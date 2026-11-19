"""No-AI engine: pastes the garment on the body area. For dev, CI and demos."""

from PIL import Image, ImageDraw

from app.features.vton_lab.engines.base import (
    LOWER,
    OVERALL,
    TryOnEngine,
    TryOnRequest,
    register_engine,
)
from app.features.vton_lab.images import garment_mask, letterbox

# Vertical span of the garment as a fraction of person height.
_SPANS = {LOWER: (0.48, 0.92), OVERALL: (0.20, 0.88)}
_UPPER_SPAN = (0.20, 0.55)


@register_engine("mock")
class MockEngine(TryOnEngine):
    def generate(self, request: TryOnRequest) -> Image.Image:
        person = request.person.copy()
        top_f, bottom_f = _SPANS.get(request.cloth_type, _UPPER_SPAN)
        top = int(person.height * top_f)
        height = max(1, int(person.height * bottom_f) - top)
        width = max(1, int(person.width * 0.5))
        garment, _ = letterbox(request.garment, width, height)
        left = (person.width - width) // 2
        person.paste(garment, (left, top), garment_mask(garment))
        ImageDraw.Draw(person).text((8, 8), "DEMO PREVIEW", fill=(220, 0, 0))
        return person
