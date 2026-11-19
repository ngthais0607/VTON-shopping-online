"""Human parsing (SCHP, ATR labels) used to limit try-on edits to clothes and arms.

Needs ``torch``, ``opencv-python`` and a clone of
https://github.com/Zheng-Chong/CatVTON (only its ``model/SCHP`` package is used,
not its diffusion pipeline) plus the ``exp-schp-201908301523-atr.pth`` checkpoint.
About 0.6 s per 256x192 crop on a 4-core laptop.
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

from app.features.vton_lab.errors import VtonEngineError

# ATR labels: 4 upper-clothes, 5 skirt, 7 dress, 14/15 arms, 17 scarf.
EDITABLE_LABELS = (4, 5, 7, 14, 15, 17)
FACE = 11
NECK_FROM = 0.6  # fraction of the face label's height where the neck starts


class SchpParser:
    def __init__(self, repo: str, checkpoint: str, size=(256, 192), threads=None):
        self._repo, self._checkpoint, self._size = Path(repo), Path(checkpoint), size
        self._threads = threads
        self._model = None

    def load(self) -> None:
        import torch

        if not (self._repo / "model" / "SCHP").is_dir():
            raise VtonEngineError(f"SCHP package not found under {self._repo}")
        if not self._checkpoint.is_file():
            raise VtonEngineError(f"Checkpoint not found: {self._checkpoint}")
        if self._threads:
            torch.set_num_threads(int(self._threads))
        sys.path.insert(0, str(self._repo))
        try:
            from model.SCHP import SCHP
        except ImportError as exc:
            raise VtonEngineError(f"Cannot import SCHP: {exc}") from exc
        finally:
            sys.path.remove(str(self._repo))
        parser = SCHP(str(self._checkpoint), "cpu")
        height, width = self._size
        parser.input_size = [height, width]
        parser.aspect_ratio = width / height
        parser.upsample = torch.nn.Upsample(
            size=(height, width), mode="bilinear", align_corners=True
        )
        self._torch, self._model = torch, parser

    def editable_mask(self, image: Image.Image) -> Image.Image:
        """L mask (255 = clothes/arms), same size as ``image``, slightly grown."""
        import numpy as np

        with self._torch.inference_mode():
            labels = np.array(self._model(image.convert("RGB")))
        editable = np.isin(labels, EDITABLE_LABELS)
        # Neck and collar are labelled "face": allow only the lower part of it.
        rows = np.where((labels == FACE).any(axis=1))[0]
        if rows.size:
            cutoff = rows[0] + int(NECK_FROM * (rows[-1] - rows[0] + 1))
            editable[cutoff:] |= labels[cutoff:] == FACE
        mask = Image.fromarray(editable.astype("uint8") * 255)
        grow = max(3, (image.width // 40) | 1)
        mask = mask.filter(ImageFilter.MaxFilter(grow)).filter(
            ImageFilter.GaussianBlur(1)
        )
        return ImageChops.lighter(mask, Image.new("L", mask.size, 0))
