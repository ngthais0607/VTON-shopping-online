"""Try-on engines. The API/worker depend only on the VtonEngine protocol."""

import asyncio
import logging
from io import BytesIO
from typing import Protocol

import httpx
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

from app.core.config import Settings

logger = logging.getLogger(__name__)

OUTPUT_SIZE = (768, 1024)


class VtonEngineError(Exception):
    def __init__(self, message: str, *, code: str, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class VtonEngine(Protocol):
    name: str

    async def run(self, person: bytes, garment: bytes, cloth_type: str) -> bytes: ...


# Garment placement boxes (fractions of the 768x1024 canvas) for the mock engine.
_MOCK_BOXES = {
    "upper": (0.20, 0.22, 0.80, 0.56),
    "lower": (0.27, 0.50, 0.73, 0.93),
    "overall": (0.20, 0.22, 0.80, 0.92),
}


class MockVtonEngine:
    """CPU-only stand-in: overlays the garment and stamps a visible DEMO banner.

    It performs no pose estimation or warping. It exists so the full pipeline
    (upload, queue, storage, UI) can run without a GPU and must never be
    mistaken for model output.
    """

    name = "mock"

    async def run(self, person: bytes, garment: bytes, cloth_type: str) -> bytes:
        return await asyncio.to_thread(self._render, person, garment, cloth_type)

    @staticmethod
    def _render(person: bytes, garment: bytes, cloth_type: str) -> bytes:
        try:
            canvas = ImageOps.fit(
                ImageOps.exif_transpose(Image.open(BytesIO(person))).convert("RGB"),
                OUTPUT_SIZE,
            )
            cloth = Image.open(BytesIO(garment)).convert("RGBA")
        except Exception as error:  # any decode failure is permanent
            raise VtonEngineError(
                "Input image could not be decoded",
                code="invalid_input",
                retryable=False,
            ) from error

        # Background = pixels connected to the corner that match its colour.
        marker = (255, 0, 255)
        flooded = cloth.convert("RGB")
        ImageDraw.floodfill(flooded, (0, 0), marker, thresh=14)
        alpha = ImageChops.difference(flooded, Image.new("RGB", cloth.size, marker))
        alpha = alpha.convert("L").point(lambda v: 255 if v else 0)
        alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))
        cloth.putalpha(alpha)
        bbox = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
        if bbox is None:
            raise VtonEngineError(
                "Garment image has no visible garment",
                code="invalid_input",
                retryable=False,
            )
        cloth = cloth.crop(bbox)

        left, top, right, bottom = _MOCK_BOXES.get(cloth_type, _MOCK_BOXES["upper"])
        box_w = int((right - left) * OUTPUT_SIZE[0])
        box_h = int((bottom - top) * OUTPUT_SIZE[1])
        scale = min(box_w / cloth.width, box_h / cloth.height)
        cloth = cloth.resize(
            (max(1, int(cloth.width * scale)), max(1, int(cloth.height * scale))),
            Image.Resampling.LANCZOS,
        )
        offset_x = int(left * OUTPUT_SIZE[0]) + (box_w - cloth.width) // 2
        offset_y = int(top * OUTPUT_SIZE[1])
        canvas.paste(cloth, (offset_x, offset_y), cloth)

        banner = Image.new("RGBA", OUTPUT_SIZE, (0, 0, 0, 0))
        draw = ImageDraw.Draw(banner)
        draw.rectangle(
            (0, OUTPUT_SIZE[1] - 52, OUTPUT_SIZE[0], OUTPUT_SIZE[1]),
            fill=(15, 23, 42, 200),
        )
        draw.text(
            (18, OUTPUT_SIZE[1] - 36),
            "DEMO PREVIEW - mock engine, not an AI try-on result",
            fill=(255, 255, 255, 255),
        )
        canvas = Image.alpha_composite(canvas.convert("RGBA"), banner).convert("RGB")
        out = BytesIO()
        canvas.save(out, format="PNG", optimize=True)
        return out.getvalue()


class HttpCatVtonEngine:
    """Calls the GPU inference service in /vton-service (CatVTON)."""

    name = "catvton"

    def __init__(self, base_url: str, timeout_seconds: int) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(timeout_seconds, connect=10)

    async def run(self, person: bytes, garment: bytes, cloth_type: str) -> bytes:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._base_url}/v1/tryon",
                    data={"cloth_type": cloth_type},
                    files={
                        "person": ("person.jpg", person, "image/jpeg"),
                        "garment": ("garment.png", garment, "image/png"),
                    },
                )
        except httpx.TimeoutException as error:
            raise VtonEngineError(
                "Inference service timed out", code="engine_timeout", retryable=True
            ) from error
        except httpx.HTTPError as error:
            raise VtonEngineError(
                "Inference service unreachable",
                code="engine_unavailable",
                retryable=True,
            ) from error

        if response.status_code == 200:
            return response.content
        if response.status_code == 422:
            raise VtonEngineError(
                "No usable person detected", code="no_person_detected", retryable=False
            )
        if 400 <= response.status_code < 500:
            raise VtonEngineError(
                f"Inference service rejected the request ({response.status_code})",
                code="engine_rejected",
                retryable=False,
            )
        raise VtonEngineError(
            f"Inference service error ({response.status_code})",
            code="engine_error",
            retryable=True,
        )


def create_vton_engine(settings: Settings) -> VtonEngine:
    if settings.vton_engine == "catvton":
        return HttpCatVtonEngine(
            settings.vton_service_url, settings.vton_service_timeout_seconds
        )
    return MockVtonEngine()
