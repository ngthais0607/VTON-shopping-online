"""Rule violations on checkout, order lookup/admin and the payment webhook."""

import pytest

from tests.rule_helpers import ORDERS, PRODUCTS, SHIPPING, assert_rejected, make_product

ITEM = {"variant_id": 1, "quantity": 1}
STOCK = [
    {"size": "M", "color_name": "Red", "stock_quantity": 3},
    {"size": "L", "color_name": "Red", "stock_quantity": 0},
]

CHECKOUT_CASES = {
    "no items": ({"items": []}, 422),
    "missing items": ({}, 422),
    "51 lines": ({"items": [ITEM] * 51}, 422),
    "quantity 0": ({"items": [{**ITEM, "quantity": 0}]}, 422),
    "negative quantity": ({"items": [{**ITEM, "quantity": -1}]}, 422),
    "quantity 100": ({"items": [{**ITEM, "quantity": 100}]}, 422),
    "fractional quantity": ({"items": [{**ITEM, "quantity": 1.5}]}, 422),
    "variant id 0": ({"items": [{**ITEM, "variant_id": 0}]}, 422),
    "client-supplied price": ({"items": [{**ITEM, "price": 1}]}, 422),
    "bad phone": ({"items": [ITEM], "customer_phone": "abc"}, 422),
    "empty name": ({"items": [ITEM], "customer_name": ""}, 422),
    "blank address": ({"items": [ITEM], "shipping_address": "   "}, 422),
    "notes too long": ({"items": [ITEM], "notes": "n" * 2001}, 422),
    "unknown payment method": ({"items": [ITEM], "payment_method": "bitcoin"}, 422),
    "unknown variant": ({"items": [{**ITEM, "variant_id": 99999}]}, 404),
}


@pytest.mark.parametrize("label", CHECKOUT_CASES)
def test_checkout_violations_are_refused(client, mock_user_auth, label):
    body, status = CHECKOUT_CASES[label]
    assert_rejected(
        client.post(f"{ORDERS}/checkout-cart", json={**SHIPPING, **body}), status
    )


def checkout(client, variant_id, quantity, **extra):
    items = [{"variant_id": variant_id, "quantity": quantity}]
    return client.post(
        f"{ORDERS}/checkout-cart", json={**SHIPPING, "items": items, **extra}
    )


def test_stock_is_never_oversold(client, db_session, mock_admin_auth, mock_user_auth):
    product, (medium, large) = make_product(client, db_session, variants=STOCK)
    assert_rejected(checkout(client, medium, 1), 404)  # product is still inactive
    client.patch(f"{PRODUCTS}/{product['id']}", json={"is_active": True})

    assert_rejected(checkout(client, medium, 4), 409)  # more than in stock
    assert_rejected(checkout(client, large, 1), 409)  # nothing in stock
    twice = {**SHIPPING, "items": [{"variant_id": medium, "quantity": 2}] * 2}
    assert_rejected(
        client.post(f"{ORDERS}/checkout-cart", json=twice), 409
    )  # lines add up to 4

    assert checkout(client, medium, 3, payment_method="cod").status_code == 201
    assert_rejected(checkout(client, medium, 1), 409)  # sold out now

    detail = client.get(f"{PRODUCTS}/{product['id']}").json()
    assert detail["available_stock"] == 0


def test_huge_variant_id_is_refused_not_a_server_error(client, mock_user_auth):
    assert_rejected(checkout(client, 10**30, 1), 422)


@pytest.mark.parametrize("path", ["/99999", "/track/NOPE", "/track/%00%0a" + "A" * 300])
def test_unknown_order_lookup_is_404(client, mock_user_auth, path):
    assert_rejected(client.get(f"{ORDERS}{path}"), 404)


def test_unknown_order_actions_are_404(client, mock_admin_auth, mock_user_auth):
    assert_rejected(client.post(f"{ORDERS}/99999/cancel"), 404)
    assert_rejected(client.post(f"{ORDERS}/track/NOPE/reorder"), 404)
    assert_rejected(client.put(f"{ORDERS}/99999/status", json={"status": "paid"}), 404)


@pytest.mark.parametrize(
    "body", [{"status": "teleported"}, {}, {"status": "paid", "x": 1}]
)
def test_order_status_violations_are_refused(client, mock_admin_auth, body):
    assert client.put(f"{ORDERS}/99999/status", json=body).status_code in (404, 422)


@pytest.mark.parametrize(
    "params", [{"limit": 0}, {"limit": 10000}, {"limit": -1}, {"offset": -1}]
)
def test_order_list_paging_violations_are_422(client, mock_admin_auth, params):
    assert_rejected(client.get(ORDERS, params=params), 422)


@pytest.mark.parametrize(
    "path,params",
    [
        ("/recent-orders", {"limit": -1}),
        ("/low-stock-products", {"limit": 1_000_000}),
    ],
)
def test_dashboard_limits_are_422(client, mock_admin_auth, path, params):
    assert_rejected(client.get(f"/api/v1/dashboard{path}", params=params), 422)


def test_webhook_rejects_missing_wrong_secret_and_bad_amount(client):
    body = {"transaction_id": "t", "amount": 1, "content": "x"}
    assert client.post(f"{ORDERS}/vietqr-webhook", json=body).status_code in (401, 422)
    assert_rejected(
        client.post(
            f"{ORDERS}/vietqr-webhook", headers={"X-Webhook-Secret": "bad"}, json=body
        ),
        401,
    )
    assert_rejected(
        client.post(f"{ORDERS}/vietqr-webhook", json={**body, "amount": -5}), 422
    )


def test_checkout_flood_is_throttled(client, mock_user_auth):
    codes = [checkout(client, 99999, 1).status_code for _ in range(25)]
    assert set(codes) <= {404, 429} and 429 in codes
