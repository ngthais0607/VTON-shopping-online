"""Size-chart presets per garment type.

Admin picks a category (garment type) and the system supplies the matching chart.
Each preset is one *family* of charts; the categories listed in `shared_by` all use
the same table, while a category with its own measurements gets a family of its own.

Values are finished garment measurements in cm (circumferences, not flat widths), in
the flat shape `{size: {metric: value}}` that both the storefront size guide and the
3D try-on (`parseSizeChart`) already read. Admins can edit any value afterwards.

Share / own summary (see docs/BANG_SIZE_THEO_LOAI_DO.md):
  ao-phong      shared   ao-thun, ao-polo, tops
  ao-so-mi      own      ao-so-mi
  ao-hoodie     own      ao-hoodie
  ao-khoac      shared   ao-khoac-bomber, outerwear
  ao-blazer     own      ao-blazer
  quan-dai      shared   quan-jeans, quan-tay, bottoms
  quan-short    own      quan-short
  chan-vay      own      chan-vay-chu-a
  dam-xoe       shared   dam-dang-xoe, dresses-skirts
  dam-da-hoi    own      dam-da-hoi
"""

from dataclasses import dataclass
from typing import Any

from app.features.vton.mapping import (
    CATEGORY_CLOTH_TYPES,
    LOWER,
    OVERALL,
    PARENT_CLOTH_TYPES,
    UPPER,
)

Rows = dict[str, tuple[float, ...]]

# Metrics, in the order the values of each row are listed.
UPPER_METRICS = ("chest", "waist", "hem", "shoulder", "length", "sleeve")
PANTS_METRICS = ("waist", "hip", "thigh", "length", "inseam", "leg_opening")
SHORTS_METRICS = ("waist", "hip", "thigh", "length", "inseam")
SKIRT_METRICS = ("waist", "hip", "length")
DRESS_METRICS = ("bust", "waist", "hip", "length")

# Table key used by presets that have a single, gender-neutral table.
ANY = "any"


@dataclass(frozen=True)
class SizeChartPreset:
    key: str
    label: str
    cloth_type: str
    metrics: tuple[str, ...]
    # Category slugs that share this exact table (shared).
    shared_by: tuple[str, ...]
    # "male", "female" (unisex is derived from both), or ANY → {size: values per metrics}.
    tables: dict[str, Rows]
    note: str

    @property
    def sharing(self) -> str:
        return "shared" if len(self.shared_by) > 1 else "own"


PRESETS: tuple[SizeChartPreset, ...] = (
    SizeChartPreset(
        key="ao-phong",
        label="T-shirt / polo (short sleeve, regular fit)",
        cloth_type=UPPER,
        metrics=UPPER_METRICS,
        shared_by=("ao-thun", "ao-polo", "tops"),
        note="T-shirts, polos and the Tops group share the same short-sleeve cut, so they share one chart.",
        tables={
            "male": {
                "S": (96, 94, 96, 42, 65, 20),
                "M": (102, 100, 102, 44, 68, 21),
                "L": (108, 106, 108, 46, 71, 22),
                "XL": (114, 112, 114, 48, 74, 23),
                "XXL": (120, 118, 120, 50, 77, 24),
            },
            "female": {
                "XS": (82, 73, 85, 35, 54, 14),
                "S": (88, 79, 91, 36.5, 56, 15),
                "M": (94, 85, 97, 38, 58, 16),
                "L": (102, 93, 105, 40, 60, 17),
                "XL": (110, 101, 113, 41.5, 62, 18),
            },
        },
    ),
    SizeChartPreset(
        key="ao-so-mi",
        label="Dress shirt (long sleeve)",
        cloth_type=UPPER,
        metrics=UPPER_METRICS,
        shared_by=("ao-so-mi",),
        note="Shirts have long sleeves and a slimmer cut than tees, so they get their own chart.",
        tables={
            "male": {
                "S": (100, 96, 98, 43, 70, 59),
                "M": (106, 102, 104, 45, 72, 60),
                "L": (112, 108, 110, 47, 74, 61),
                "XL": (118, 114, 116, 49, 76, 62),
                "XXL": (124, 120, 122, 51, 78, 63),
            },
            "female": {
                "XS": (86, 76, 90, 35, 60, 55),
                "S": (90, 80, 94, 36, 62, 56),
                "M": (94, 84, 98, 37.5, 64, 57),
                "L": (98, 88, 102, 39, 66, 58),
                "XL": (102, 92, 106, 40.5, 68, 59),
            },
        },
    ),
    SizeChartPreset(
        key="ao-hoodie",
        label="Hoodie / sweatshirt (relaxed fit)",
        cloth_type=UPPER,
        metrics=UPPER_METRICS,
        shared_by=("ao-hoodie",),
        note="Hoodies are roomy with dropped shoulders and a hem band narrower than the body, so they get their own chart.",
        tables={
            "male": {
                "S": (108, 96, 96, 48, 66, 60),
                "M": (114, 102, 102, 50, 68, 61),
                "L": (120, 108, 108, 52, 70, 62),
                "XL": (126, 114, 114, 54, 72, 63),
                "XXL": (132, 120, 120, 56, 74, 64),
            },
            "female": {
                "S": (100, 88, 88, 44, 60, 57),
                "M": (106, 94, 94, 46, 62, 58),
                "L": (112, 100, 100, 48, 64, 59),
                "XL": (118, 106, 106, 50, 66, 60),
            },
        },
    ),
    SizeChartPreset(
        key="ao-khoac",
        label="Bomber / outerwear jacket",
        cloth_type=UPPER,
        metrics=UPPER_METRICS,
        shared_by=("ao-khoac-bomber", "outerwear"),
        note="Short jackets with a hem band: bomber and the Outerwear group share one chart.",
        tables={
            "male": {
                "S": (108, 98, 98, 46, 62, 61),
                "M": (114, 104, 104, 48, 64, 62),
                "L": (120, 110, 110, 50, 66, 63),
                "XL": (126, 116, 116, 52, 68, 64),
                "XXL": (132, 122, 122, 54, 70, 65),
            },
            "female": {
                "S": (100, 90, 90, 42, 56, 58),
                "M": (106, 96, 96, 44, 58, 59),
                "L": (112, 102, 102, 46, 60, 60),
                "XL": (118, 108, 108, 48, 62, 61),
            },
        },
    ),
    SizeChartPreset(
        key="ao-blazer",
        label="Blazer / vest",
        cloth_type=UPPER,
        metrics=UPPER_METRICS,
        shared_by=("ao-blazer",),
        note="Blazers have a structured cut, padded shoulders and a longer length, so they get their own chart.",
        tables={
            "male": {
                "S": (104, 96, 102, 44, 72, 60),
                "M": (110, 102, 108, 46, 74, 61),
                "L": (116, 108, 114, 48, 76, 62),
                "XL": (122, 114, 120, 50, 78, 63),
                "XXL": (128, 120, 126, 52, 80, 64),
            },
            "female": {
                "XS": (86, 72, 90, 36, 58, 56),
                "S": (90, 76, 94, 37, 60, 57),
                "M": (94, 80, 98, 38, 62, 58),
                "L": (98, 84, 102, 39, 64, 59),
                "XL": (102, 88, 106, 40, 66, 60),
            },
        },
    ),
    SizeChartPreset(
        key="quan-dai",
        label="Long pants (jeans / trousers)",
        cloth_type=LOWER,
        metrics=PANTS_METRICS,
        shared_by=("quan-jeans", "quan-tay", "bottoms"),
        note="Jeans and trousers are measured the same way (waist, hip, thigh, length), so they share one chart.",
        tables={
            "male": {
                "S": (76, 98, 60, 100, 76, 36),
                "M": (80, 102, 62, 102, 77, 37),
                "L": (84, 106, 64, 104, 78, 38),
                "XL": (88, 110, 66, 106, 79, 39),
                "XXL": (92, 114, 68, 108, 80, 40),
            },
            "female": {
                "XS": (64, 88, 54, 96, 73, 32),
                "S": (68, 92, 56, 98, 74, 33),
                "M": (72, 96, 58, 100, 75, 34),
                "L": (76, 100, 60, 102, 76, 35),
                "XL": (80, 104, 62, 104, 77, 36),
            },
        },
    ),
    SizeChartPreset(
        key="quan-short",
        label="Shorts",
        cloth_type=LOWER,
        metrics=SHORTS_METRICS,
        shared_by=("quan-short",),
        note="Shorts have no long leg, so thigh and length are shorter; they get their own chart.",
        tables={
            "male": {
                "S": (76, 98, 62, 46, 20),
                "M": (80, 102, 64, 48, 21),
                "L": (84, 106, 66, 50, 22),
                "XL": (88, 110, 68, 52, 23),
            },
            "female": {
                "XS": (64, 88, 56, 36, 9),
                "S": (68, 92, 58, 38, 10),
                "M": (72, 96, 60, 40, 11),
                "L": (76, 100, 62, 42, 12),
                "XL": (80, 104, 64, 44, 13),
            },
        },
    ),
    SizeChartPreset(
        key="chan-vay",
        label="A-line skirt",
        cloth_type=LOWER,
        metrics=SKIRT_METRICS,
        shared_by=("chan-vay-chu-a",),
        note="Skirts need only waist, hip and length; one chart for all genders.",
        tables={
            ANY: {
                "XS": (62, 86, 45),
                "S": (66, 90, 48),
                "M": (70, 94, 50),
                "L": (74, 98, 52),
                "XL": (78, 102, 54),
            },
        },
    ),
    SizeChartPreset(
        key="dam-xoe",
        label="Flare dress",
        cloth_type=OVERALL,
        metrics=DRESS_METRICS,
        shared_by=("dam-dang-xoe", "dresses-skirts"),
        note="Flare dresses and the Dresses & Skirts group are measured by bust, waist, hip and length, so they share one chart.",
        tables={
            ANY: {
                "XS": (84, 66, 92, 94),
                "S": (88, 70, 96, 96),
                "M": (92, 74, 100, 98),
                "L": (96, 78, 104, 100),
                "XL": (100, 82, 108, 102),
            },
        },
    ),
    SizeChartPreset(
        key="dam-da-hoi",
        label="Evening gown (fitted, long)",
        cloth_type=OVERALL,
        metrics=DRESS_METRICS,
        shared_by=("dam-da-hoi",),
        note="Evening gowns are more fitted and longer than flare dresses, so they get their own chart.",
        tables={
            ANY: {
                "XS": (82, 64, 88, 125),
                "S": (86, 68, 92, 127),
                "M": (90, 72, 96, 129),
                "L": (94, 76, 100, 131),
                "XL": (98, 80, 104, 133),
            },
        },
    ),
)

PRESETS_BY_KEY: dict[str, SizeChartPreset] = {p.key: p for p in PRESETS}
SLUG_PRESET: dict[str, str] = {
    slug: preset.key for preset in PRESETS for slug in preset.shared_by
}
# Custom child categories fall back to the parent's default family, then to the
# generic family of their cloth type.
PARENT_PRESET: dict[str, str] = {
    "ao": "ao-phong",
    "ao-khoac": "ao-khoac",
    "quan": "quan-dai",
}
CLOTH_TYPE_PRESET: dict[str, str] = {
    UPPER: "ao-phong",
    LOWER: "quan-dai",
    OVERALL: "dam-xoe",
}

# Genders with a published table; anything else (e.g. "kids") has no preset.
# "unisex" has no table of its own: it is derived from the male and female ones (see `_unisex_rows`).
_GENDER_TABLE = {"male": "male", "unisex": "unisex", "female": "female"}
_SIZE_ORDER = ("XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL")


def _unisex_rows(preset: SizeChartPreset) -> Rows | None:
    """Unisex = the men's and women's tables averaged per size (nearest 0.5 cm).

    A size only one table has (XS women's, XXL men's) is kept as it is, so the range is the
    union of both. Nothing extra is stored, so editing a men's or women's row updates unisex too.
    """
    male, female = preset.tables.get("male"), preset.tables.get("female")
    if male is None or female is None:
        return None
    sizes = sorted(set(male) | set(female), key=lambda size: _SIZE_ORDER.index(size))
    rows: Rows = {}
    for size in sizes:
        a, b = male.get(size), female.get(size)
        rows[size] = (
            tuple(round((x + y) / 2 * 2) / 2 for x, y in zip(a, b, strict=True))
            if a and b
            else (a or b)
        )
    return rows


def preset_for_category(category: Any) -> SizeChartPreset | None:
    """The chart family for a category: its own slug, else its parent's, else its cloth type."""
    if category is None:
        return None
    key = SLUG_PRESET.get(category.slug)
    if key is None:
        parent = getattr(category, "parent", None)
        if parent is not None:
            key = SLUG_PRESET.get(parent.slug) or PARENT_PRESET.get(parent.slug)
    if key is None:
        cloth_type = CATEGORY_CLOTH_TYPES.get(category.slug)
        if cloth_type is None and getattr(category, "parent", None) is not None:
            cloth_type = PARENT_CLOTH_TYPES.get(category.parent.slug)
        key = CLOTH_TYPE_PRESET.get(cloth_type) if cloth_type else None
    return PRESETS_BY_KEY.get(key) if key else None


def build_chart(
    preset: SizeChartPreset, gender: str | None
) -> dict[str, dict[str, float]] | None:
    """`{size: {metric: cm}}` for the preset and gender, or None when none is published."""
    if ANY in preset.tables:
        rows = preset.tables[ANY]
    else:
        table = _GENDER_TABLE.get((gender or "unisex").strip().lower())
        rows = (
            _unisex_rows(preset)
            if table == "unisex"
            else preset.tables.get(table)
            if table
            else None
        )
        if rows is None:
            return None
    return {
        size: dict(zip(preset.metrics, values, strict=True))
        for size, values in rows.items()
    }


def gender_table_for(preset: SizeChartPreset, gender: str | None) -> str | None:
    """Which table serves the gender: "male", "female", "unisex" (derived), or "any" for a single table."""
    if ANY in preset.tables:
        return ANY
    table = _GENDER_TABLE.get((gender or "unisex").strip().lower())
    if table == "unisex":
        return table if _unisex_rows(preset) else None
    return table if table in preset.tables else None


def resolve_size_chart(
    category: Any, gender: str | None, preset_key: str | None = None
) -> dict[str, Any] | None:
    """Chart for the picked family (else the category's) and gender, shaped for the admin form.

    An explicit `preset_key` is the admin choosing a chart type by hand; without it the
    category decides.
    """
    preset = (
        PRESETS_BY_KEY.get(preset_key) if preset_key else preset_for_category(category)
    )
    if preset is None:
        return None
    chart = build_chart(preset, gender)
    if chart is None:
        return None
    return {
        "preset_key": preset.key,
        "label": preset.label,
        "cloth_type": preset.cloth_type,
        "sharing": preset.sharing,
        "shared_with": list(preset.shared_by),
        "note": preset.note,
        "gender_table": gender_table_for(preset, gender),
        "unit": "cm",
        "size_chart": chart,
    }


def catalog() -> list[dict[str, Any]]:
    """Every family with the categories that share it, for the admin reference list."""
    return [
        {
            "preset_key": p.key,
            "label": p.label,
            "cloth_type": p.cloth_type,
            "sharing": p.sharing,
            "shared_with": list(p.shared_by),
            "note": p.note,
            "metrics": list(p.metrics),
            "genders": sorted(p.tables),
        }
        for p in PRESETS
    ]
