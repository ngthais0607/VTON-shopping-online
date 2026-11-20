"""Image helpers shared by try-on engines (decode, letterbox, garment mask)."""

import io

from PIL import Image, ImageChops, ImageFilter, ImageOps, UnidentifiedImageError

from app.core.errors import BusinessRuleError
from app.features.products.images import MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MIN_SIDE = 128
ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
WHITE = (255, 255, 255)

Box = tuple[int, int, int, int]  # left, top, width, height inside a canvas


def decode_image(data: bytes, label: str) -> Image.Image:
    """Decode an uploaded image to RGB; transparent pixels become white."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise BusinessRuleError(
            f"{label} image is larger than 8 MiB", code="vton_invalid_image"
        )
    try:
        image = Image.open(io.BytesIO(data))
        if image.format not in ALLOWED_FORMATS:
            raise BusinessRuleError(
                f"{label} image must be PNG, JPEG or WebP", code="vton_invalid_image"
            )
        # Header-only check first: load() would allocate the full bitmap of a decompression bomb.
        width, height = image.size
        if (
            width > MAX_IMAGE_DIMENSION
            or height > MAX_IMAGE_DIMENSION
            or width * height > MAX_IMAGE_PIXELS
        ):
            raise BusinessRuleError(
                f"{label} image dimensions exceed the allowed limit",
                code="vton_invalid_image",
            )
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise BusinessRuleError(
            f"{label} image could not be read", code="vton_invalid_image"
        ) from exc
    image = ImageOps.exif_transpose(image)
    if min(image.size) < MIN_SIDE:
        raise BusinessRuleError(
            f"{label} image must be at least {MIN_SIDE} px on each side",
            code="vton_invalid_image",
        )
    return flatten_on_white(image)


def flatten_on_white(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, WHITE)
        canvas.paste(rgba, mask=rgba.getchannel("A"))
        return canvas
    return image.convert("RGB")


def letterbox(
    image: Image.Image, width: int, height: int, fill=WHITE
) -> tuple[Image.Image, Box]:
    """Fit ``image`` into width x height without distortion, padding with fill."""
    scale = min(width / image.width, height / image.height)
    new_w = max(1, round(image.width * scale))
    new_h = max(1, round(image.height * scale))
    resized = image.resize((new_w, new_h), Image.Resampling.BICUBIC)
    canvas = Image.new(image.mode, (width, height), fill)
    left, top = (width - new_w) // 2, (height - new_h) // 2
    canvas.paste(resized, (left, top))
    return canvas, (left, top, new_w, new_h)


def unletterbox(image: Image.Image, box: Box, size: tuple[int, int]) -> Image.Image:
    """Undo :func:`letterbox`: crop the content box and scale back to ``size``."""
    left, top, width, height = box
    cropped = image.crop((left, top, left + width, top + height))
    return cropped.resize(size, Image.Resampling.BICUBIC)


def garment_mask(image: Image.Image, threshold: int = 235) -> Image.Image:
    """Binary mask (L, 0/255) of a garment photographed on a white background."""
    r, g, b = image.convert("RGB").split()
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)
    mask = darkest.point(lambda v: 255 if v < threshold else 0)
    # Close small holes (white prints, highlights), then drop isolated specks.
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    return mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))


def to_png_bytes(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _foreground(image: Image.Image, threshold: int) -> tuple[Image.Image, float]:
    """Low-res foreground mask (L) and the scale used: background = border median."""
    scale = 160 / max(image.size)
    small = image.convert("RGB").resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    )
    width, height = small.size
    pixels = small.load()
    border = [pixels[x, 0] for x in range(width)] + [
        pixels[x, height - 1] for x in range(width)
    ]
    border += [pixels[0, y] for y in range(height)] + [
        pixels[width - 1, y] for y in range(height)
    ]
    background = tuple(sorted(p[c] for p in border)[len(border) // 2] for c in range(3))
    diff = ImageChops.difference(small, Image.new("RGB", small.size, background))
    r, g, b = diff.split()
    mask = ImageChops.lighter(ImageChops.lighter(r, g), b).point(
        lambda v: 255 if v > threshold else 0
    )
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    return mask, scale


def foreground_mask(image: Image.Image, threshold: int = 40) -> Image.Image:
    """Person silhouette (L, 0/255) at the size of ``image``; studio backgrounds only."""
    mask, _ = _foreground(image, threshold)
    return mask.resize(image.size, Image.Resampling.BILINEAR)


def person_bbox(image: Image.Image, threshold: int = 40) -> Box | None:
    """Bounding box (left, top, width, height) of the person in a studio-style photo.

    Heuristic, no model: returns None when nothing stands out.
    """
    mask, scale = _foreground(image, threshold)
    width, height = mask.size
    data = mask.load()
    cols = [sum(1 for y in range(height) if data[x, y]) for x in range(width)]
    rows = [sum(1 for x in range(width) if data[x, y]) for y in range(height)]
    xs = [x for x, c in enumerate(cols) if c >= height * 0.04]
    ys = [y for y, r in enumerate(rows) if r >= width * 0.02]
    if not xs or not ys:
        return None
    left, right, top, bottom = xs[0], xs[-1] + 1, ys[0], ys[-1] + 1
    if (right - left) * (bottom - top) < 0.03 * width * height:
        return None
    return (
        round(left / scale),
        round(top / scale),
        round((right - left) / scale),
        round((bottom - top) / scale),
    )


def upper_body_box(size: tuple[int, int], person: Box, aspect: float = 3 / 4) -> Box:
    """Crop (left, top, w, h) around head-to-hip, with the given width/height aspect."""
    left, top, width, height = person
    crop_h = height * 0.6
    crop_w = max(crop_h * aspect, width * 1.15)
    crop_h = max(crop_h, crop_w / aspect)
    crop_w = crop_h * aspect
    crop_h = min(crop_h, size[1])
    crop_w = crop_h * aspect
    if crop_w > size[0]:
        crop_w = size[0]
        crop_h = crop_w / aspect
    cx = left + width / 2
    x0 = min(max(cx - crop_w / 2, 0), size[0] - crop_w)
    y0 = min(max(top - crop_h * 0.04, 0), size[1] - crop_h)
    return (round(x0), round(y0), round(crop_w), round(crop_h))
