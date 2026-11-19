"""Calls a CatVTON-compatible HTTP service (``vton-service``: POST /v1/tryon)."""

import io

import httpx
from PIL import Image, UnidentifiedImageError

from app.features.vton_lab.engines.base import (
    TryOnEngine,
    TryOnRequest,
    register_engine,
)
from app.features.vton_lab.errors import VtonEngineError
from app.features.vton_lab.images import to_png_bytes


@register_engine("catvton_http")
class CatVtonHttpEngine(TryOnEngine):
    """Options: ``url`` (required), ``timeout_s`` (default 3600)."""

    def generate(self, request: TryOnRequest) -> Image.Image:
        url = str(self.option("url", required=True)).rstrip("/")
        timeout = float(self.option("timeout_s", 3600))
        files = {
            "person": ("person.png", to_png_bytes(request.person), "image/png"),
            "garment": ("garment.png", to_png_bytes(request.garment), "image/png"),
        }
        try:
            response = httpx.post(
                f"{url}/v1/tryon",
                files=files,
                data={"cloth_type": request.cloth_type},
                timeout=timeout,
            )
        except httpx.HTTPError as exc:
            raise VtonEngineError(
                f"CatVTON service unreachable: {exc.__class__.__name__}"
            ) from exc
        if response.status_code != 200:
            raise VtonEngineError(
                f"CatVTON service answered {response.status_code}",
                details={"status": response.status_code},
            )
        try:
            image = Image.open(io.BytesIO(response.content))
            image.load()
        except (UnidentifiedImageError, OSError) as exc:
            raise VtonEngineError("CatVTON service returned a bad image") from exc
        return image.convert("RGB")
