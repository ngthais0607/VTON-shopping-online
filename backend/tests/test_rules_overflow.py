"""Integers beyond what the database stores must be refused with a 4xx, never a 5xx."""

import pytest

from tests.rule_helpers import (
    BIG,
    CATEGORIES,
    ORDERS,
    PRODUCTS,
    SHIPPING,
    USERS,
    VARIANTS,
    VTON,
    make_product,
)

PNG = ("a.png", b"x", "image/png")
VARIANT_ROW = {"size": "S", "color_name": "A"}

REQUESTS = [
    ("get", f"{PRODUCTS}/{BIG}", {}),
    ("patch", f"{PRODUCTS}/{BIG}", {"json": {"name": "x"}}),
    ("delete", f"{PRODUCTS}/{BIG}", {}),
    ("get", f"{PRODUCTS}/variants/lookup", {"params": {"ids": "9" * 40}}),
    ("get", PRODUCTS, {"params": {"category_id": BIG}}),
    ("get", PRODUCTS, {"params": {"min_price": "nan"}}),
    ("post", PRODUCTS, {"json": {"name": "a", "price": 1, "category_id": BIG}}),
    ("post", f"{ORDERS}/checkout-cart", {"json": {**SHIPPING, "items": [{"variant_id": BIG, "quantity": 1}]}}),
    ("get", f"{ORDERS}/{BIG}", {}),
    ("put", f"{ORDERS}/{BIG}/status", {"json": {"status": "paid"}}),
    ("post", f"{ORDERS}/{BIG}/cancel", {}),
    ("get", f"{ORDERS}/user/{BIG}", {}),
    ("get", f"{CATEGORIES}/{BIG}", {}),
    ("patch", f"{CATEGORIES}/{BIG}", {"json": {"name": "x"}}),
    ("post", CATEGORIES, {"json": {"name": "x", "parent_id": BIG}}),
    ("delete", f"{CATEGORIES}/{BIG}", {}),
    ("get", f"{USERS}/{BIG}", {}),
    ("delete", f"{USERS}/{BIG}", {}),
    ("get", f"{VTON}/products/{BIG}/eligibility", {}),
    ("post", f"{VARIANTS}/{BIG}/adjust-stock", {"json": {"delta": 1, "reason": "x"}}),
    ("post", f"{VARIANTS}/1/adjust-stock", {"json": {"delta": BIG, "reason": "x"}}),
    ("patch", f"{VARIANTS}/{BIG}", {"json": {"price": 1}}),
    ("post", f"{PRODUCTS}/{BIG}/variants/bulk", {"json": {"variants": [VARIANT_ROW]}}),
    ("post", f"{PRODUCTS}/1/variants/bulk", {"json": {"variants": [{**VARIANT_ROW, "stock_quantity": BIG}]}}),
    ("post", f"{PRODUCTS}/{BIG}/images", {"files": {"file": PNG}}),
    ("post", f"{PRODUCTS}/1/images", {"data": {"sort_order": str(BIG)}, "files": {"file": PNG}}),
    ("get", f"{PRODUCTS}/size-chart-preset", {"params": {"category_id": BIG}}),
    ("get", f"{PRODUCTS}/{BIG}/reviews", {}),
    ("get", "/api/v1/dashboard/recent-orders", {"params": {"limit": BIG}}),
]


@pytest.mark.parametrize(
    "method,url,kwargs",
    REQUESTS,
    ids=[f"{m}-{u.split('/api/v1/')[-1][:40]}" for m, u, _ in REQUESTS],
)
def test_oversized_integers_are_a_client_error(client, mock_admin_auth, mock_user_auth, method, url, kwargs):
    response = client.request(method.upper(), url, **kwargs)
    assert 400 <= response.status_code < 500, f"{response.status_code} {response.text[:200]}"


def test_out_of_range_error_uses_the_standard_envelope(client, db_session, mock_admin_auth):
    _, (variant_id,) = make_product(client, db_session, variants=[{"size": "M", "color_name": "Red"}])
    response = client.post(f"{VARIANTS}/{variant_id}/adjust-stock", json={"delta": BIG, "reason": "x"})
    assert response.status_code == 422
    assert response.json()["code"] == "value_out_of_range"
