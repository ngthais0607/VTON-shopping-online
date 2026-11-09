"""Explicit catalog -> CatVTON mapping. Anything not listed is unsupported."""

from pathlib import PurePosixPath

UPPER = "upper"
LOWER = "lower"
OVERALL = "overall"
CLOTH_TYPES = (UPPER, LOWER, OVERALL)

CATEGORY_CLOTH_TYPES: dict[str, str] = {
    "tops": UPPER,
    "outerwear": UPPER,
    "bottoms": LOWER,
    "dresses-skirts": OVERALL,
    "ao-thun": UPPER,
    "ao-so-mi": UPPER,
    "ao-polo": UPPER,
    "ao-blazer": UPPER,
    "ao-hoodie": UPPER,
    "ao-khoac-bomber": UPPER,
    "quan-jeans": LOWER,
    "quan-tay": LOWER,
    "quan-short": LOWER,
    "chan-vay-chu-a": LOWER,
    "dam-dang-xoe": OVERALL,
    "dam-da-hoi": OVERALL,
}
# "vay-dam" is deliberately absent: it mixes skirts (lower) and dresses (overall).
PARENT_CLOTH_TYPES: dict[str, str] = {
    "ao": UPPER,
    "ao-khoac": UPPER,
    "quan": LOWER,
}

GARMENT_KINDS = ("vton_garment", "flat_lay", "catalog")
RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def cloth_type_for_category(category) -> str | None:
    if category is None:
        return None
    mapped = CATEGORY_CLOTH_TYPES.get(category.slug)
    if mapped:
        return mapped
    parent = getattr(category, "parent", None)
    if parent is not None:
        return PARENT_CLOTH_TYPES.get(parent.slug)
    return None


def pick_garment_image(images, color_name: str | None):
    """Best raster garment-only image; SVG illustrations are never usable.

    With a requested colour, an image tagged with a different colour is
    rejected; an untagged image is an acceptable fallback.
    """
    wanted = (color_name or "").strip().lower()
    best = None
    best_score: tuple[int, int, int] | None = None
    for image in images:
        if image.kind not in GARMENT_KINDS:
            continue
        if PurePosixPath(image.object_name).suffix.lower() not in RASTER_EXTENSIONS:
            continue
        image_color = (image.color_name or "").strip().lower()
        if wanted and image_color and image_color != wanted:
            continue
        if wanted and image_color == wanted:
            color_score = 2
        else:
            color_score = 1 if not image_color else 0
        kind_score = len(GARMENT_KINDS) - GARMENT_KINDS.index(image.kind)
        score = (color_score, kind_score, -(image.sort_order or 0))
        if best_score is None or score > best_score:
            best, best_score = image, score
    return best
