"""Try-on engines. The API/worker depend only on the VtonEngine protocol."""

import asyncio
import hashlib
import logging
from io import BytesIO
from typing import Protocol

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

from app.core.config import Settings
from app.integrations.storage import ProductStorage

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


def cache_key(person: bytes, garment: bytes, cloth_type: str) -> str:
    digest = hashlib.sha256()
    for part in (person, garment, cloth_type.encode()):
        digest.update(hashlib.sha256(part).digest())
    return f"vton/cache/{digest.hexdigest()}.png"


class CachedVtonEngine:
    """Serves pre-generated results (demo pairs) so they work offline and instantly.

    Lookup is by content hash of (person, garment, cloth_type). Only ``write=True``
    (the prewarm script) stores results: shoppers' photos are never cached.
    """

    def __init__(self, inner: VtonEngine, storage: ProductStorage, *, write=False):
        self._inner = inner
        self._storage = storage
        self._write = write
        self.name = inner.name

    async def run(self, person: bytes, garment: bytes, cloth_type: str) -> bytes:
        key = cache_key(person, garment, cloth_type)
        try:
            hit = await asyncio.to_thread(self._storage.get, key)
        except Exception:  # missing object or storage hiccup: just compute
            hit = None
        if hit:
            logger.info("VTON cache hit key=%s", key)
            return hit
        output = await self._inner.run(person, garment, cloth_type)
        if self._write:
            await asyncio.to_thread(
                self._storage.put, key, BytesIO(output), "image/png"
            )
        return output


def create_vton_engine(settings: Settings) -> VtonEngine:
    if settings.vton_engine == "lab":
        # Local import: the lab package depends on this module.
        from app.features.vton_lab.adapter import create_lab_engine

        return create_lab_engine(settings)
    return MockVtonEngine()
