"""DM-VTON student network (warp + small generator) on CPU.

Upstream code needs a CUDA-only ``cupy`` kernel for its cost-volume layer; this
engine swaps it for a pure PyTorch version so the model runs on CPU. About 2 s
per image at 256x192 on a 4-core laptop (measured, random weights).

Needs ``torch`` and ``torchvision`` (not in the backend lockfiles: install them
into the venv that runs this engine) and a clone of
https://github.com/KiseKloset/DM-VTON (academic licence).

Options:
  repo             path to the DM-VTON clone                      (required)
  warp_checkpoint  dmvton_pf_warp.pt                              (required)
  gen_checkpoint   dmvton_pf_gen.pt                               (required)
  width / height   working size, default 192 x 256 (multiples of 64 recommended)
  threads          torch CPU threads (default: torch's choice)
  crop             "auto" (default): run on the head-to-hip crop of the person, the
                   framing the model was trained on; "none": use the whole photo
  parsing_repo / parsing_checkpoint  optional: CatVTON clone + SCHP ATR weights; edits
                   are then limited to clothes and arms (no halos in the background)
  silhouette       false (opt-in; fails on clothes close to the background): ignore edits outside the person's silhouette
  candidates       1 (default) .. 5: try that many crop/garment-margin variants and
                   keep the one whose edited pixels best match the garment colours
                   (about +2 s each)
  paste_back       true (default): keep the original pixels outside the changed
                   garment region, so only the garment area is low resolution
  garment_fit      "tight" (default): crop the garment photo to the garment first;
                   "none": use the photo as is
  allow_random_weights  true only for speed benchmarks: skips the checkpoints
"""

import sys
import types
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

from app.features.vton_lab.engines.base import (
    UPPER,
    TryOnEngine,
    TryOnRequest,
    register_engine,
)
from app.features.vton_lab.errors import VtonEngineError
from app.features.vton_lab.images import (
    foreground_mask,
    garment_mask,
    letterbox,
    person_bbox,
    upper_body_box,
)


def cost_volume(first, second, stride=1):
    """CPU equivalent of upstream's cupy correlation (7x7 window, stride 1).

    out[b, k] = mean_c first[b, c, y, x] * second[b, c, y + k // 7 - 3, x + k % 7 - 3]
    with zero padding outside the image.
    """
    import torch.nn.functional as F

    if stride != 1:
        raise NotImplementedError("DM-VTON student only uses stride 1")
    import torch

    _, channels, height, width = first.shape
    padded = F.pad(second, (3, 3, 3, 3))
    planes = [
        (first * padded[:, :, dy : dy + height, dx : dx + width]).sum(1, keepdim=True)
        for dy in range(7)
        for dx in range(7)
    ]
    return torch.cat(planes, 1) / channels


def _install_correlation_stub() -> None:
    module = types.ModuleType("models.common.correlation")
    module.FunctionCorrelation = lambda tenFirst, tenSecond, intStride: cost_volume(
        tenFirst, tenSecond, intStride
    )
    sys.modules["models.common.correlation"] = module


@register_engine("dmvton_cpu")
class DmVtonCpuEngine(TryOnEngine):
    # The student was trained on upper-body garments only.
    supported_cloth_types = frozenset({UPPER})

    def load(self) -> None:
        try:
            import torch
        except ImportError as exc:
            raise VtonEngineError("torch is not installed in this environment") from exc
        repo = Path(str(self.option("repo", required=True)))
        if not (repo / "pipelines").is_dir():
            raise VtonEngineError(f"DM-VTON repo not found at {repo}")
        threads = self.option("threads")
        if threads:
            torch.set_num_threads(int(threads))
        _install_correlation_stub()
        # Upstream uses top-level package names (models, pipelines, utils).
        sys.path.insert(0, str(repo))
        try:
            from pipelines import DMVTONPipeline
        except ImportError as exc:
            raise VtonEngineError(f"Cannot import DM-VTON: {exc}") from exc

        if self.option("allow_random_weights", False):
            checkpoints = None
        else:
            warp = Path(str(self.option("warp_checkpoint", required=True)))
            gen = Path(str(self.option("gen_checkpoint", required=True)))
            for path in (warp, gen):
                if not path.is_file():
                    raise VtonEngineError(f"Checkpoint not found: {path}")
            checkpoints = {"warp": str(warp), "gen": str(gen)}
        self._torch = torch
        self._model = DMVTONPipeline(checkpoints=checkpoints).eval()
        self._parser = None
        if self.option("parsing_repo") and self.option("parsing_checkpoint"):
            from app.features.vton_lab.engines.parsing import SchpParser

            self._parser = SchpParser(
                str(self.option("parsing_repo")),
                str(self.option("parsing_checkpoint")),
                threads=threads,
            )
            self._parser.load()
        self._width = int(self.option("width", 192))
        self._height = int(self.option("height", 256))

    def generate(self, request: TryOnRequest) -> Image.Image:
        if request.cloth_type not in self.supported_cloth_types:
            raise VtonEngineError(
                f"dmvton_cpu supports {sorted(self.supported_cloth_types)} only; "
                f"got {request.cloth_type}"
            )
        source = request.person
        base_box = None
        if self.option("crop", "auto") == "auto":
            bbox = person_bbox(source)
            if bbox is not None:
                base_box = upper_body_box(source.size, bbox)
        count = max(1, int(self.option("candidates", 1)))
        self._limit = None
        if self._parser is not None:
            area = base_box or (0, 0, *source.size)
            region = source.crop(
                (area[0], area[1], area[0] + area[2], area[1] + area[3])
            )
            self._limit = Image.new("L", source.size, 0)
            self._limit.paste(self._parser.editable_mask(region), (area[0], area[1]))
        best, best_score = None, -1.0
        for zoom, margin in _VARIANTS[:count]:
            crop_box = _zoom_box(base_box, source.size, zoom) if base_box else None
            candidate, score = self._attempt(source, crop_box, request.garment, margin)
            if score > best_score:
                best, best_score = candidate, score
        return best

    def _attempt(self, source, crop_box, garment, margin):
        if crop_box is None:
            region = source
        else:
            left, top, width, height = crop_box
            region = source.crop((left, top, left + width, top + height))

        generated, base, garment_img = self._run_model(region, garment, margin)
        score = _match_score(base, generated, garment_img)
        if self.option("paste_back", True):
            limit = None
            if self._limit is not None:
                crop = crop_box or (0, 0, *source.size)
                box = (crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3])
                limit = self._limit.crop(box).resize(base.size)
            elif self.option("silhouette", False):
                limit = foreground_mask(region).resize(base.size)
            region_out = _paste_changed_region(region, base, generated, limit)
        else:
            region_out = generated.resize(region.size, Image.Resampling.BICUBIC)
        if crop_box is None:
            return region_out, score
        result = source.copy()
        result.paste(region_out, (crop_box[0], crop_box[1]))
        return result, score

    def _run_model(self, region: Image.Image, garment: Image.Image, margin: float):
        """Return (model output, the model-resolution input) as boxed images."""
        torch = self._torch
        person_img, person_box = letterbox(region, self._width, self._height)
        if self.option("garment_fit", "tight") == "tight":
            garment = _tight_garment(garment, margin)
        garment_img, _ = letterbox(garment, self._width, self._height)
        edge_img = garment_mask(garment_img)

        person = _to_tensor(person_img)
        garment_t = _to_tensor(garment_img)
        edge = _to_tensor(edge_img.convert("RGB"))[:, :1] / 2 + 0.5  # [0, 1]
        with torch.inference_mode():
            tryon, _warped = self._model(person, garment_t, edge)
        out = _from_tensor(tryon)
        box = (
            person_box[0],
            person_box[1],
            person_box[0] + person_box[2],
            person_box[1] + person_box[3],
        )
        return out.crop(box), person_img.crop(box), garment_img


# (crop zoom, garment margin) tried in order when ``candidates`` > 1.
_VARIANTS = ((1.0, 0.06), (1.12, 0.06), (1.0, 0.16), (1.12, 0.0), (0.92, 0.06))


def _zoom_box(box, size, factor):
    """Scale a (left, top, w, h) crop about its centre, keeping it inside ``size``."""
    left, top, width, height = box
    new_w, new_h = min(width * factor, size[0]), min(height * factor, size[1])
    x0 = min(max(left + (width - new_w) / 2, 0), size[0] - new_w)
    y0 = min(max(top + (height - new_h) / 2, 0), size[1] - new_h)
    return (round(x0), round(y0), round(new_w), round(new_h))


def _histogram(image, mask):
    import numpy as np

    pixels = np.asarray(image.convert("RGB"))[np.asarray(mask) > 0] >> 6
    bins = np.bincount(
        pixels[:, 0] * 16 + pixels[:, 1] * 4 + pixels[:, 2], minlength=64
    )
    return bins / max(1, bins.sum()), int(bins.sum())


def _match_score(base, generated, garment_img) -> float:
    """How well the edited pixels look like the garment (colour histogram overlap).

    Catches failures where the model leaves the old clothes or paints half of the
    garment: those candidates have a low overlap or barely change anything.
    """
    import numpy as np

    diff = ImageChops.difference(base, generated)
    r, g, b = diff.split()
    changed = ImageChops.lighter(ImageChops.lighter(r, g), b).point(
        lambda v: 255 if v > 25 else 0
    )
    cloth_hist, cloth_n = _histogram(garment_img, garment_mask(garment_img))
    out_hist, out_n = _histogram(generated, changed)
    if not cloth_n or not out_n:
        return 0.0
    overlap = float(np.minimum(cloth_hist, out_hist).sum())
    return overlap * min(1.0, out_n / (0.12 * base.width * base.height))


def _tight_garment(garment: Image.Image, margin: float = 0.06) -> Image.Image:
    """Crop a product photo to the garment, so it fills the frame like the training data."""
    bbox = garment_mask(garment).getbbox()
    if bbox is None:
        return garment
    left, top, right, bottom = bbox
    pad_x, pad_y = round((right - left) * margin), round((bottom - top) * margin)
    box = (
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(garment.width, right + pad_x),
        min(garment.height, bottom + pad_y),
    )
    return garment.crop(box)


def _paste_changed_region(
    original: Image.Image,
    base: Image.Image,
    generated: Image.Image,
    limit: Image.Image | None = None,
) -> Image.Image:
    """Full-resolution ``original`` with ``generated`` blended in where it changed it.

    ``base`` and ``generated`` are the model's input and output (same low
    resolution); the difference between them marks the pixels the model edited.
    """
    diff = ImageChops.difference(base, generated)
    r, g, b = diff.split()
    mask = ImageChops.lighter(ImageChops.lighter(r, g), b)
    mask = mask.filter(ImageFilter.GaussianBlur(1.5)).point(
        lambda v: min(255, max(0, (v - 14) * 12))
    )
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.5))
    if limit is not None:
        # Edits outside the person (background tint, halos) are model noise.
        mask = ImageChops.multiply(
            mask,
            limit.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1)),
        )
    size = original.size
    mask = mask.resize(size, Image.Resampling.BICUBIC)
    detail = generated.resize(size, Image.Resampling.BICUBIC).filter(
        ImageFilter.UnsharpMask(radius=2, percent=120, threshold=2)
    )
    return Image.composite(detail, original, mask)


def _to_tensor(image: Image.Image):
    import numpy as np
    import torch

    array = np.asarray(image, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(array).permute(2, 0, 1).unsqueeze(0)
    return tensor * 2 - 1


def _from_tensor(tensor) -> Image.Image:
    import numpy as np

    array = ((tensor[0].clamp(-1, 1) + 1) * 127.5).permute(1, 2, 0).numpy()
    return Image.fromarray(array.round().astype(np.uint8))
