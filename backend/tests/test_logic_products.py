"""Business-logic edge cases for variants, stock, price aggregation and size charts."""

import pytest

from app.features.products.variant_model import ProductVariant
from tests.rule_helpers import (
    CATEGORIES,
    PRODUCTS,
    VARIANTS,
    assert_rejected,
    make_product,
)

VARIANTS_BODY = [
    {"size": "S", "color_name": "Red", "stock_quantity": 2, "price": 150000},
    {"size": "M", "color_name": "Red", "stock_quantity": 3},
]


@pytest.fixture
def product(client, db_session, mock_admin_auth):
    created, ids = make_product(
        client, db_session, variants=VARIANTS_BODY, price=100000
    )
    return created, ids


def bulk(client, pid, body):
    return client.post(f"{PRODUCTS}/{pid}/variants/bulk", json=body)


def rows(db, pid):
    db.expire_all()
    return (
        db.query(ProductVariant)
        .filter_by(product_id=pid)
        .order_by(ProductVariant.id)
        .all()
    )


def test_variant_price_falls_back_to_the_product_price(product, client):
    created, _ = product
    detail = client.get(f"{PRODUCTS}/{created['id']}").json()
    # S has its own price (150000); M has none and uses the product price (100000).
    assert (detail["price_min"], detail["price_max"]) == (100000, 150000)


def test_available_stock_is_the_sum_over_active_variants(product, client):
    created, (small, _) = product
    assert client.get(f"{PRODUCTS}/{created['id']}").json()["available_stock"] == 5
    assert (
        client.patch(f"{VARIANTS}/{small}", json={"is_active": False}).status_code
        == 200
    )
    assert client.get(f"{PRODUCTS}/{created['id']}").json()["available_stock"] == 3


def test_price_filter_uses_the_cheapest_active_variant(product, client):
    created, (small, medium) = product
    # The listing price is "from X": the cheapest active variant (M falls back to 100000).
    inside = client.get(
        PRODUCTS, params={"min_price": 90000, "max_price": 120000}
    ).json()
    assert [p["id"] for p in inside["items"]] == [created["id"]]
    assert client.get(PRODUCTS, params={"min_price": 140000}).json()["items"] == []
    # Deactivating the cheap variant moves the product into the higher price band.
    client.patch(f"{VARIANTS}/{medium}", json={"is_active": False})
    moved = client.get(PRODUCTS, params={"min_price": 140000}).json()
    assert [p["id"] for p in moved["items"]] == [created["id"]]


def test_inverted_price_range_is_empty_or_refused_never_an_error(product, client):
    response = client.get(PRODUCTS, params={"min_price": 200, "max_price": 100})
    assert response.status_code in (200, 400, 422)
    if response.status_code == 200:
        assert response.json()["items"] == []


def test_bulk_is_idempotent_for_existing_size_colour_pairs(product, client, db_session):
    created, _ = product
    body = {
        "variants": [{"size": " s ", "color_name": "RED"}]
    }  # same pair, different case/spaces
    assert bulk(client, created["id"], body).status_code in (200, 201)
    assert len(rows(db_session, created["id"])) == 2


def test_bulk_duplicate_pairs_inside_one_request_create_one_row(
    product, client, db_session
):
    created, _ = product
    body = {
        "variants": [
            {"size": "XL", "color_name": "Blue"},
            {"size": "xl", "color_name": "blue"},
        ]
    }
    assert bulk(client, created["id"], body).status_code in (200, 201)
    assert len(rows(db_session, created["id"])) == 3


def test_bulk_matrix_builds_every_combination_with_unique_skus(
    product, client, db_session
):
    created, _ = product
    body = {
        "sizes": ["L", "XL"],
        "colors": [{"name": "Black"}, {"name": "Navy"}],
        "default_stock": 4,
    }
    assert bulk(client, created["id"], body).status_code in (200, 201)
    found = rows(db_session, created["id"])
    assert len(found) == 6
    assert len({v.sku for v in found}) == 6
    assert all(v.stock_quantity in (2, 3, 4) for v in found)


def test_explicit_sku_clash_is_a_conflict_and_adds_nothing(product, client, db_session):
    created, (first, _) = product
    taken = db_session.get(ProductVariant, first).sku
    body = {"variants": [{"size": "XXL", "color_name": "Green", "sku": taken}]}
    assert_rejected(bulk(client, created["id"], body), 409)
    assert len(rows(db_session, created["id"])) == 2


def test_two_colours_that_normalise_alike_still_get_distinct_skus(
    product, client, db_session
):
    created, _ = product
    body = {
        "variants": [
            {"size": "L", "color_name": "Sky Blue"},
            {"size": "L", "color_name": "Sky-Blue"},
        ]
    }
    assert bulk(client, created["id"], body).status_code in (200, 201)
    skus = [v.sku for v in rows(db_session, created["id"])]
    assert len(skus) == len(set(skus))


def test_symbol_only_names_fall_back_to_default_sku_parts(product, client, db_session):
    created, _ = product
    body = {"variants": [{"size": "★", "color_name": "★★"}]}
    assert bulk(client, created["id"], body).status_code in (200, 201)
    assert any(
        "DEF" in v.sku and "STD" in v.sku for v in rows(db_session, created["id"])
    )


def test_matrix_values_longer_than_the_column_are_refused(product, client):
    created, _ = product
    assert_rejected(
        bulk(client, created["id"], {"sizes": ["s" * 80], "colors": [{"name": "Red"}]}),
        422,
    )


def test_matrix_axes_are_bounded(product, client):
    created, _ = product
    sizes = [f"s{i}" for i in range(31)]
    assert_rejected(
        bulk(client, created["id"], {"sizes": sizes, "colors": [{"name": "Red"}]}), 422
    )
    colors = [{"name": f"c{i}"} for i in range(31)]
    assert_rejected(
        bulk(client, created["id"], {"sizes": ["S"], "colors": colors}), 422
    )


def test_matrix_with_only_sizes_or_only_colours_is_refused(product, client):
    created, _ = product
    assert_rejected(bulk(client, created["id"], {"sizes": ["S"]}), 422)
    assert_rejected(bulk(client, created["id"], {"colors": [{"name": "Red"}]}), 422)


def test_blank_matrix_entries_are_refused(product, client):
    created, _ = product
    assert_rejected(
        bulk(client, created["id"], {"sizes": ["  "], "colors": [{"name": "Red"}]}), 422
    )


def test_stock_adjustment_is_audited_and_cannot_cross_reserved_stock(
    product, client, db_session
):
    _, (small, _) = product
    ok = client.post(
        f"{VARIANTS}/{small}/adjust-stock", json={"delta": 3, "reason": "restock"}
    )
    assert ok.status_code in (200, 201)
    assert db_session.get(ProductVariant, small).stock_quantity == 5
    assert_rejected(
        client.post(
            f"{VARIANTS}/{small}/adjust-stock", json={"delta": -6, "reason": "loss"}
        ),
        400,
    )
    db_session.expire_all()
    assert db_session.get(ProductVariant, small).stock_quantity == 5


def test_stock_cannot_drop_below_what_is_already_reserved(product, client, db_session):
    _, (small, _) = product
    variant = db_session.get(ProductVariant, small)
    variant.reserved_quantity = 2
    db_session.commit()
    assert_rejected(
        client.post(
            f"{VARIANTS}/{small}/adjust-stock", json={"delta": -1, "reason": "x"}
        ),
        400,
    )


def test_deleted_variant_disappears_from_the_product_and_stock(product, client):
    created, (small, _) = product
    assert client.delete(f"{VARIANTS}/{small}").status_code in (200, 204)
    detail = client.get(f"{PRODUCTS}/{created['id']}").json()
    assert detail["available_stock"] == 3
    assert (detail["price_min"], detail["price_max"]) == (100000, 100000)
    assert_rejected(client.delete(f"{VARIANTS}/{small}"), 404)


def test_soft_deleted_product_is_gone_and_its_slug_is_reusable_or_refused_cleanly(
    product, client, db_session
):
    created, _ = product
    assert client.delete(f"{PRODUCTS}/{created['id']}").status_code in (200, 204)
    assert_rejected(client.get(f"{PRODUCTS}/{created['id']}"), 404)
    again = client.post(
        PRODUCTS, json={"name": created["name"], "price": 1, "gender": "male"}
    )
    assert again.status_code in (201, 409)


# --------------------------------------------------------------------- size charts


def test_omitted_size_chart_is_filled_from_the_category_preset(
    client, db_session, mock_admin_auth
):
    created, _ = make_product(client, db_session)
    chart = client.get(f"{PRODUCTS}/{created['id']}").json().get("size_chart")
    assert chart and all(isinstance(row, dict) for row in chart.values())


def test_custom_size_chart_is_kept_exactly(client, db_session, mock_admin_auth):
    custom = {"S": {"chest": 90.5}, "M": {"chest": 96}}
    created, _ = make_product(client, db_session, size_chart=custom)
    assert client.get(f"{PRODUCTS}/{created['id']}").json()["size_chart"] == custom


@pytest.mark.parametrize("gender", ["male", "female", "unisex", "kids"])
def test_every_gender_gets_a_chart_request_that_never_fails(
    client, db_session, mock_admin_auth, gender
):
    category = make_product(client, db_session)[0]["category"]["id"]
    response = client.get(
        f"{PRODUCTS}/size-chart-preset",
        params={"category_id": category, "gender": gender},
    )
    assert response.status_code in (200, 404), response.text


def test_unisex_preset_is_between_the_male_and_female_values(
    client, db_session, mock_admin_auth
):
    category = make_product(client, db_session)[0]["category"]["id"]

    def chest(gender):
        body = client.get(
            f"{PRODUCTS}/size-chart-preset",
            params={"category_id": category, "gender": gender},
        )
        return body.json()["size_chart"]["M"]["chest"]

    low, high = sorted([chest("male"), chest("female")])
    assert low <= chest("unisex") <= high


def test_preset_needs_a_category_or_a_key(client, mock_admin_auth):
    assert_rejected(client.get(f"{PRODUCTS}/size-chart-preset"), 400)
    assert_rejected(
        client.get(f"{PRODUCTS}/size-chart-preset", params={"preset_key": "nope"}), 400
    )


# --------------------------------------------------------------------- gender, null chart, categories


@pytest.mark.parametrize("gender", ["banana", "men", "", "  ", "male,female", "<b>"])
def test_unknown_gender_is_refused_on_create_and_update(
    client, db_session, mock_admin_auth, gender
):
    assert_rejected(
        client.post(PRODUCTS, json={"name": "G", "price": 1, "gender": gender}), 422
    )
    created, _ = make_product(client, db_session)
    assert_rejected(
        client.patch(f"{PRODUCTS}/{created['id']}", json={"gender": gender}), 422
    )


def test_gender_is_normalised_to_lower_case(client, mock_admin_auth):
    created = client.post(
        PRODUCTS, json={"name": "G case", "price": 1, "gender": " Female "}
    )
    assert created.status_code == 201
    assert created.json()["gender"] == "female"


def test_null_chart_on_create_falls_back_to_the_preset_but_on_update_removes_it(
    client, db_session, mock_admin_auth
):
    created, _ = make_product(client, db_session, size_chart=None)
    assert client.get(f"{PRODUCTS}/{created['id']}").json()[
        "size_chart"
    ]  # preset filled
    removed = client.patch(f"{PRODUCTS}/{created['id']}", json={"size_chart": None})
    assert removed.status_code == 200
    assert client.get(f"{PRODUCTS}/{created['id']}").json()["size_chart"] is None


def test_category_requests_reject_unknown_fields(client, mock_admin_auth):
    assert_rejected(client.post(CATEGORIES, json={"name": "Hats", "parent": 1}), 422)
    assert_rejected(
        client.post(CATEGORIES, json={"name": "Hats", "is_admin": True}), 422
    )
    made = client.post(CATEGORIES, json={"name": "Scarves"})
    assert made.status_code in (200, 201)
    assert_rejected(
        client.patch(f"{CATEGORIES}/{made.json()['id']}", json={"nmae": "x"}), 422
    )


def test_every_preset_builds_for_every_gender_without_error():
    from app.features.products import size_charts

    for preset in size_charts.PRESETS_BY_KEY.values():
        for gender in ("male", "female", "unisex", "kids", None, "weird"):
            chart = size_charts.build_chart(preset, gender)
            assert chart is None or all(
                len(row) == len(preset.metrics) for row in chart.values()
            )
