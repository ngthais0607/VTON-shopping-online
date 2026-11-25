from types import SimpleNamespace

import pytest

from app.features.categories.model import Category
from app.features.products import size_charts

PRODUCTS = "/api/v1/products"


def cat(slug, parent_slug=None):
    parent = SimpleNamespace(slug=parent_slug, parent=None) if parent_slug else None
    return SimpleNamespace(slug=slug, parent=parent)


def test_categories_that_share_a_family_get_the_same_chart():
    thun = size_charts.resolve_size_chart(cat("ao-thun"), "male")
    polo = size_charts.resolve_size_chart(cat("ao-polo"), "male")
    assert thun["preset_key"] == polo["preset_key"] == "ao-phong"
    assert thun["size_chart"] == polo["size_chart"]
    assert thun["sharing"] == "shared"
    assert set(thun["shared_with"]) >= {"ao-thun", "ao-polo"}


def test_categories_with_own_measurements_get_their_own_chart():
    shirt = size_charts.resolve_size_chart(cat("ao-so-mi"), "male")
    tee = size_charts.resolve_size_chart(cat("ao-thun"), "male")
    assert shirt["preset_key"] == "ao-so-mi" and shirt["sharing"] == "own"
    assert shirt["size_chart"] != tee["size_chart"]


def test_every_listed_slug_resolves_to_its_family():
    for family in size_charts.PRESETS:
        for slug in family.shared_by:
            assert size_charts.preset_for_category(cat(slug)).key == family.key
    # A slug is never claimed by two families.
    slugs = [s for f in size_charts.PRESETS for s in f.shared_by]
    assert len(slugs) == len(set(slugs))


def test_every_slug_the_try_on_knows_has_a_chart():
    from app.features.vton.mapping import CATEGORY_CLOTH_TYPES

    for slug, cloth_type in CATEGORY_CLOTH_TYPES.items():
        family = size_charts.preset_for_category(cat(slug))
        assert family is not None and family.cloth_type == cloth_type


@pytest.mark.parametrize("family", size_charts.PRESETS, ids=lambda f: f.key)
def test_family_rows_match_their_metrics(family):
    assert family.tables
    for rows in family.tables.values():
        for size, values in rows.items():
            assert len(values) == len(family.metrics), size
            assert all(v > 0 for v in values)


def test_chart_values_are_the_flat_shape_read_by_the_storefront():
    chart = size_charts.resolve_size_chart(cat("ao-thun"), "male")["size_chart"]
    assert chart["M"] == {
        "chest": 102,
        "waist": 100,
        "hem": 102,
        "shoulder": 44,
        "length": 68,
        "sleeve": 21,
    }


def test_gender_picks_the_table():
    male = size_charts.resolve_size_chart(cat("quan-jeans"), "male")["size_chart"]
    unisex = size_charts.resolve_size_chart(cat("quan-jeans"), "unisex")["size_chart"]
    female = size_charts.resolve_size_chart(cat("quan-jeans"), "female")["size_chart"]
    assert male != unisex != female and male != female
    assert "XS" in female and "XS" not in male and "XS" in unisex and "XXL" in unisex


def test_unisex_is_the_average_of_men_and_women():
    tee = size_charts.PRESETS_BY_KEY["ao-phong"]
    chart = size_charts.build_chart(tee, "unisex")
    assert list(chart) == ["XS", "S", "M", "L", "XL", "XXL"]
    assert chart["M"]["chest"] == 98  # (102 + 94) / 2
    assert chart["XS"] == size_charts.build_chart(tee, "female")["XS"]
    assert chart["XXL"] == size_charts.build_chart(tee, "male")["XXL"]
    # one table for everybody stays untouched
    skirt = size_charts.PRESETS_BY_KEY["chan-vay"]
    assert size_charts.build_chart(skirt, "unisex") == size_charts.build_chart(
        skirt, "male"
    )


def test_every_unisex_chart_is_complete_and_ordered():
    for preset in size_charts.PRESETS:
        chart = size_charts.build_chart(preset, "unisex")
        assert chart, preset.key
        assert all(set(row) == set(preset.metrics) for row in chart.values())
        for metric in preset.metrics:
            if "male" in preset.tables:
                values = [row[metric] for row in chart.values()]
                assert values == sorted(values), (preset.key, metric)


def test_gender_neutral_family_ignores_gender():
    a = size_charts.resolve_size_chart(cat("chan-vay-chu-a"), "female")
    b = size_charts.resolve_size_chart(cat("chan-vay-chu-a"), "male")
    assert a["size_chart"] == b["size_chart"]


def test_kids_has_no_preset():
    assert size_charts.resolve_size_chart(cat("ao-thun"), "kids") is None


def test_custom_child_falls_back_to_parent_then_cloth_type():
    assert (
        size_charts.resolve_size_chart(cat("ao-ba-lo", "ao"), "male")["preset_key"]
        == "ao-phong"
    )
    assert (
        size_charts.resolve_size_chart(cat("quan-moi", "quan"), "male")["preset_key"]
        == "quan-dai"
    )
    # A child of a known family inherits that family.
    assert (
        size_charts.resolve_size_chart(cat("ao-so-mi-moi", "ao-so-mi"), "male")[
            "preset_key"
        ]
        == "ao-so-mi"
    )


def test_unknown_or_ambiguous_category_has_no_preset():
    assert size_charts.resolve_size_chart(cat("phu-kien"), "male") is None
    assert size_charts.resolve_size_chart(cat("khac", "vay-dam"), "female") is None
    assert size_charts.resolve_size_chart(None, "male") is None


def make_category(db, slug, name=None):
    category = Category(name=name or slug, slug=slug)
    db.add(category)
    db.commit()
    return category


def test_preset_endpoint_returns_chart_for_picked_category(
    client, db_session, mock_admin_auth
):
    category = make_category(db_session, "ao-polo")
    response = client.get(
        f"{PRODUCTS}/size-chart-preset",
        params={"category_id": category.id, "gender": "female"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["preset_key"] == "ao-phong" and body["unit"] == "cm"
    assert "XS" in body["size_chart"]


def test_preset_endpoint_returns_null_when_no_chart(
    client, db_session, mock_admin_auth
):
    category = make_category(db_session, "phu-kien")
    response = client.get(
        f"{PRODUCTS}/size-chart-preset", params={"category_id": category.id}
    )
    assert response.status_code == 200 and response.json() is None


def test_preset_endpoints_require_admin(client, db_session, mock_user_auth):
    category = make_category(db_session, "ao-thun")
    assert (
        client.get(
            f"{PRODUCTS}/size-chart-preset", params={"category_id": category.id}
        ).status_code
        == 403
    )
    assert client.get(f"{PRODUCTS}/size-chart-presets").status_code == 403


def test_catalog_lists_shared_and_own_families(client, mock_admin_auth):
    response = client.get(f"{PRODUCTS}/size-chart-presets")
    assert response.status_code == 200
    families = {f["preset_key"]: f for f in response.json()}
    assert families["ao-phong"]["sharing"] == "shared"
    assert families["ao-so-mi"]["sharing"] == "own"


def product_payload(category_id, **overrides):
    payload = {
        "name": "Polo Test",
        "price": 100000,
        "category_id": category_id,
        "gender": "male",
    }
    payload.update(overrides)
    return payload


def test_create_product_fills_chart_from_category(client, db_session, mock_admin_auth):
    category = make_category(db_session, "ao-thun")
    response = client.post(PRODUCTS, json=product_payload(category.id))
    assert response.status_code == 201
    assert response.json()["size_chart"]["M"]["chest"] == 102


def test_create_product_keeps_an_explicit_chart(client, db_session, mock_admin_auth):
    category = make_category(db_session, "ao-thun")
    custom = {"M": {"chest": 99}}
    response = client.post(
        PRODUCTS, json=product_payload(category.id, size_chart=custom)
    )
    assert response.status_code == 201
    assert response.json()["size_chart"] == custom


def test_create_product_without_known_category_has_no_chart(
    client, db_session, mock_admin_auth
):
    category = make_category(db_session, "phu-kien")
    response = client.post(PRODUCTS, json=product_payload(category.id))
    assert response.status_code == 201
    assert response.json()["size_chart"] is None


def test_explicit_family_overrides_the_category():
    chart = size_charts.resolve_size_chart(cat("ao-thun"), "male", "ao-hoodie")
    assert chart["preset_key"] == "ao-hoodie"
    assert (
        size_charts.resolve_size_chart(None, "male", "quan-short")["preset_key"]
        == "quan-short"
    )
    assert size_charts.resolve_size_chart(None, "male", "nope") is None


def test_preset_endpoint_accepts_a_chosen_family(client, mock_admin_auth):
    response = client.get(
        f"{PRODUCTS}/size-chart-preset",
        params={"preset_key": "ao-blazer", "gender": "female"},
    )
    assert response.status_code == 200
    assert response.json()["preset_key"] == "ao-blazer"


def test_preset_endpoint_rejects_unknown_family_and_empty_request(
    client, db_session, mock_admin_auth
):
    assert (
        client.get(
            f"{PRODUCTS}/size-chart-preset", params={"preset_key": "nope"}
        ).status_code
        == 400
    )
    assert client.get(f"{PRODUCTS}/size-chart-preset").status_code == 400
    category = make_category(db_session, "ao-thun")
    assert (
        client.get(
            f"{PRODUCTS}/size-chart-preset",
            params={"category_id": category.id, "preset_key": "ao-hoodie"},
        ).json()["preset_key"]
        == "ao-hoodie"
    )


def test_response_says_which_gender_table_was_used():
    tee = size_charts.PRESETS_BY_KEY["ao-phong"]
    assert size_charts.gender_table_for(tee, "unisex") == "unisex"
    assert size_charts.gender_table_for(tee, "female") == "female"
    assert size_charts.gender_table_for(tee, "kids") is None
    assert (
        size_charts.gender_table_for(size_charts.PRESETS_BY_KEY["dam-xoe"], "male")
        == "any"
    )
    assert (
        size_charts.resolve_size_chart(None, "female", "ao-phong")["gender_table"]
        == "female"
    )
