from app.core.slug import generate_unique_slug, slugify


def test_slugify_converts_vietnamese_diacritics():
    assert slugify("Áo Thun Nam Cổ Tròn") == "ao-thun-nam-co-tron"
    assert slugify("Đầm Dạ Hội Đỏ") == "dam-da-hoi-do"
    assert slugify("Quần Jean Ống Rộng") == "quan-jean-ong-rong"


def test_slugify_handles_special_characters_and_whitespace():
    assert slugify("  T-Shirt & Jeans (Special Edition)!  ") == "t-shirt-jeans-special-edition"
    assert slugify("---Multiple---Hyphens---") == "multiple-hyphens"
    assert slugify("100% Cotton") == "100-cotton"


def test_generate_unique_slug_appends_counter_on_collision():
    existing = {"ao-thun", "ao-thun-2"}
    slug = generate_unique_slug("Áo Thun", existing)
    assert slug == "ao-thun-3"
    assert slug not in existing


def test_generate_unique_slug_no_collision():
    existing = {"dam-da-hoi"}
    slug = generate_unique_slug("Áo Sơ Mi", existing)
    assert slug == "ao-so-mi"
