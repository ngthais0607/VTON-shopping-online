import re
import unicodedata


def slugify(text: str) -> str:
    """
    Generate clean, lowercase, URL-safe slug from text without external libraries.
    Handles Vietnamese special character đ/Đ and removes all diacritics.
    """
    if not text:
        return ""

    # Replace Vietnamese specific characters đ/Đ with d
    cleaned = text.replace("đ", "d").replace("Đ", "d")

    # Decompose unicode to separate base characters from combining accents (NFKD)
    normalized = unicodedata.normalize("NFKD", cleaned)
    # Filter out combining marks
    without_marks = "".join(c for c in normalized if not unicodedata.combining(c))

    # Convert to lowercase
    lower = without_marks.lower()

    # Replace any non-alphanumeric character with hyphen
    hyphenated = re.sub(r"[^a-z0-9]+", "-", lower)

    # Collapse multiple consecutive hyphens and strip leading/trailing hyphens
    slug = re.sub(r"-+", "-", hyphenated).strip("-")
    return slug


def generate_unique_slug(base_text: str, existing_slugs: set[str]) -> str:
    """
    Generate a unique slug, appending -2, -3, etc. if a collision exists in existing_slugs.
    """
    base_slug = slugify(base_text)
    if not base_slug:
        base_slug = "item"

    candidate = base_slug
    counter = 2
    while candidate in existing_slugs:
        candidate = f"{base_slug}-{counter}"
        counter += 1
    return candidate
