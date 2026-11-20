"""Rule violations on variants and stock adjustments."""

import pytest

from tests.rule_helpers import BIG, PRODUCTS, VARIANTS, assert_rejected, make_product

STOCK = [{"size": "M", "color_name": "Red", "stock_quantity": 3}]


@pytest.fixture
def variant(client, db_session, mock_admin_auth):
    product, (variant_id,) = make_product(client, db_session, variants=STOCK)
    return product["id"], variant_id


def test_stock_cannot_drop_below_zero(client, variant):
    _, vid = variant
    assert_rejected(client.post(f"{VARIANTS}/{vid}/adjust-stock", json={"delta": -100, "reason": "x"}), 400)


def test_absurd_stock_delta_is_refused(client, variant):
    _, vid = variant
    assert_rejected(client.post(f"{VARIANTS}/{vid}/adjust-stock", json={"delta": BIG, "reason": "x"}), 422)
    # A huge negative delta is stopped by the "not below zero" rule before the range check.
    assert_rejected(client.post(f"{VARIANTS}/{vid}/adjust-stock", json={"delta": -BIG, "reason": "x"}), 400)


def test_adjust_unknown_variant_is_404(client, mock_admin_auth):
    assert_rejected(client.post(f"{VARIANTS}/99999/adjust-stock", json={"delta": 1, "reason": "x"}), 404)


@pytest.mark.parametrize(
    "body",
    [{"price": -1}, {"stock_quantity": 999}, {"size": ""}, {"color_name": "c" * 51}, {"size": "s" * 21}],
)
def test_variant_patch_violations_are_422(client, variant, body):
    _, vid = variant
    assert_rejected(client.patch(f"{VARIANTS}/{vid}", json=body), 422)


@pytest.mark.parametrize("method", ["patch", "delete"])
def test_unknown_variant_is_404(client, mock_admin_auth, method):
    kwargs = {"json": {"price": 1}} if method == "patch" else {}
    assert_rejected(getattr(client, method)(f"{VARIANTS}/99999", **kwargs), 404)


BULK_CASES = {
    "empty body": ({}, 422),
    "bad hex colour": ({"variants": [{"size": "S", "color_name": "A", "color_hex": "red"}]}, 422),
    "negative stock": ({"variants": [{"size": "S", "color_name": "A", "stock_quantity": -1}]}, 422),
    "stock beyond 64 bits": ({"variants": [{"size": "S", "color_name": "A", "stock_quantity": BIG}]}, 422),
}


@pytest.mark.parametrize("label", BULK_CASES)
def test_bulk_violations_are_refused(client, variant, label):
    pid, _ = variant
    body, status = BULK_CASES[label]
    assert_rejected(client.post(f"{PRODUCTS}/{pid}/variants/bulk", json=body), status)


def test_bulk_on_unknown_product_is_404(client, mock_admin_auth):
    body = {"variants": [{"size": "S", "color_name": "A"}]}
    assert_rejected(client.post(f"{PRODUCTS}/99999/variants/bulk", json=body), 404)


def test_bulk_size_explosion_is_bounded(client, variant):
    pid, _ = variant
    body = {"sizes": [f"s{i}" for i in range(1000)], "colors": [{"name": "A"}], "default_stock": 1}
    assert client.post(f"{PRODUCTS}/{pid}/variants/bulk", json=body).status_code in (201, 400, 422)


@pytest.mark.parametrize(
    "ids,status",
    [("a,b", 400), (",".join(map(str, range(1500))), 400), ("9" * 40, 422)],
)
def test_variant_lookup_violations_are_refused(client, ids, status):
    assert_rejected(client.get(f"{PRODUCTS}/variants/lookup", params={"ids": ids}), status)
