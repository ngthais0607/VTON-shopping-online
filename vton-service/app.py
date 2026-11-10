"""CatVTON inference service (GPU). Thin HTTP wrapper around the upstream repo.

NOT exercised in CI: it needs an NVIDIA GPU and ~10 GB of model downloads.
Upstream: https://github.com/Zheng-Chong/CatVTON  (see Dockerfile for the pin).

POST /v1/tryon  multipart: person, garment (images), cloth_type (upper|lower|overall)
  200 -> image/png   422 -> no person/mask   400 -> bad input
"""

import io
import logging
import os
import threading

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from huggingface_hub import snapshot_download
from PIL import Image

logger = logging.getLogger("catvton-service")
app = FastAPI(title="CatVTON inference")

WIDTH, HEIGHT = 768, 1024
MODELS_DIR = os.environ.get("MODELS_DIR", "/models")
STEPS = int(os.environ.get("CATVTON_STEPS", "10"))
GUIDANCE = float(os.environ.get("CATVTON_GUIDANCE", "2.5"))
# "cuda" (default) or "cpu". CPU is a slow fallback for machines without an
# NVIDIA GPU: expect minutes per image and several GB of RAM.
DEVICE = os.environ.get("CATVTON_DEVICE", "cuda").lower()
# bfloat16 halves memory but is emulated (very slow) on most consumer CPUs.
DTYPE = getattr(
    torch,
    os.environ.get("CATVTON_DTYPE", "bfloat16" if DEVICE == "cuda" else "float32"),
)
CPU_THREADS = int(os.environ.get("CATVTON_CPU_THREADS", "0"))
MAX_BYTES = 8 * 1024 * 1024

_lock = threading.Lock()  # one GPU job at a time
_state: dict = {}


def _install_schp_abn_fallback() -> None:
    """Replace SCHP's JIT-compiled InPlace-ABN with a pure PyTorch equivalent.

    Upstream compiles a C++/CUDA extension at import time, which needs nvcc (absent
    from this runtime image) and a writable home. Inference only needs the forward
    pass, which is batch norm with gamma = |weight| + eps, then the activation.
    """
    import sys
    import types

    import torch.nn.functional as F

    name = "model.SCHP.modules.functions"
    module = types.ModuleType(name)
    module.ACT_RELU, module.ACT_LEAKY_RELU = "relu", "leaky_relu"
    module.ACT_ELU, module.ACT_NONE = "elu", "none"

    def inplace_abn(
        x,
        weight,
        bias,
        running_mean,
        running_var,
        training=False,
        momentum=0.1,
        eps=1e-05,
        activation="leaky_relu",
        slope=0.01,
        *_,
    ):
        gamma = weight.abs() + eps if weight is not None else None
        x = F.batch_norm(
            x, running_mean, running_var, gamma, bias, training, momentum, eps
        )
        if activation == "leaky_relu":
            x = F.leaky_relu(x, slope)
        elif activation == "elu":
            x = F.elu(x)
        elif activation == "relu":
            x = F.relu(x)
        return x, running_mean, running_var

    module.inplace_abn = module.inplace_abn_sync = inplace_abn
    module.__all__ = [
        "inplace_abn",
        "inplace_abn_sync",
        "ACT_RELU",
        "ACT_LEAKY_RELU",
        "ACT_ELU",
        "ACT_NONE",
    ]
    sys.modules[name] = module


def _load() -> None:
    _install_schp_abn_fallback()

    # Upstream DensePose never sets MODEL.DEVICE, so detectron2 defaults to CUDA.
    # get_cfg() clones this global default, so patch it before the masker builds.
    from detectron2.config import defaults as detectron2_defaults

    detectron2_defaults._C.MODEL.DEVICE = DEVICE

    # Imported lazily: these modules come from the cloned CatVTON repo on PYTHONPATH.
    from model.cloth_masker import AutoMasker
    from model.pipeline import CatVTONPipeline

    repo = snapshot_download(
        repo_id="zhengchong/CatVTON", local_dir=f"{MODELS_DIR}/CatVTON"
    )
    _state["pipeline"] = CatVTONPipeline(
        base_ckpt="booksforcharlie/stable-diffusion-inpainting",
        attn_ckpt=repo,
        attn_ckpt_version="mix",
        weight_dtype=DTYPE,
        device=DEVICE,
        skip_safety_check=True,
    )
    _state["masker"] = AutoMasker(
        densepose_ckpt=os.path.join(repo, "DensePose"),
        schp_ckpt=os.path.join(repo, "SCHP"),
        device=DEVICE,
    )
    logger.info("CatVTON loaded device=%s dtype=%s steps=%s", DEVICE, DTYPE, STEPS)


@app.on_event("startup")
def startup() -> None:
    if DEVICE == "cuda" and not torch.cuda.is_available():
        raise RuntimeError(
            "CatVTON service requires a CUDA GPU (or CATVTON_DEVICE=cpu)"
        )
    if DEVICE == "cpu" and CPU_THREADS > 0:
        torch.set_num_threads(CPU_THREADS)
    _load()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok" if "pipeline" in _state else "loading"}


def _read(upload: UploadFile) -> Image.Image:
    data = upload.file.read(MAX_BYTES + 1)
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(400, "image missing or too large")
    try:
        return Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as error:
        raise HTTPException(400, "image cannot be decoded") from error


@app.post("/v1/tryon")
def tryon(
    person: UploadFile = File(...),
    garment: UploadFile = File(...),
    cloth_type: str = Form(...),
) -> Response:
    if cloth_type not in {"upper", "lower", "overall"}:
        raise HTTPException(400, "cloth_type must be upper, lower or overall")
    from utils import resize_and_crop, resize_and_padding

    person_img = resize_and_crop(_read(person), (WIDTH, HEIGHT))
    garment_img = resize_and_padding(_read(garment), (WIDTH, HEIGHT))
    with _lock, torch.inference_mode():
        try:
            mask = _state["masker"](person_img, cloth_type)["mask"]
        except Exception as error:
            logger.warning("mask generation failed: %s", error)
            raise HTTPException(422, "no usable person detected") from error
        if mask.getbbox() is None:
            raise HTTPException(422, "no usable person detected")
        generator = torch.Generator(device=DEVICE).manual_seed(42)
        result = _state["pipeline"](
            image=person_img,
            condition_image=garment_img,
            mask=mask,
            num_inference_steps=STEPS,
            guidance_scale=GUIDANCE,
            generator=generator,
        )[0]
    out = io.BytesIO()
    result.save(out, format="PNG")
    return Response(content=out.getvalue(), media_type="image/png")
