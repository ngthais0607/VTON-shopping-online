"""Business-logic edge cases: order state machine, stock counters, payments, memos, reviews."""

from types import SimpleNamespace

import pytest

from app.core.errors import ConflictError
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.domain import (
    _ALLOWED_TRANSITIONS,
    InvalidCartItemError,
    InvalidOrderTransition,
    aggregate_cart_items,
    apply_order_transition,
    available_stock,
)
from app.features.orders.model import Order, Payment
from app.features.orders.vietqr_memo import (
    generate_order_payment_memo,
    parse_order_ids_from_memo,
)
from app.features.products.variant_model import ProductVariant
from tests.rule_helpers import ORDERS, PRODUCTS, SHIPPING, assert_rejected, make_product

WEBHOOK = f"{ORDERS}/vietqr-webhook"
SECRET = {"X-Webhook-Secret": "test-webhook-secret-32-chars-long-abc"}
STOCK = [{"size": "M", "color_name": "Red", "stock_quantity": 5}]


# --------------------------------------------------------------------- pure state machine


def fake_order(method, status, *, reserved=1, sold=0, stock=5, paid_at=None, qty=1):
    variant = SimpleNamespace(
        id=1, stock_quantity=stock, reserved_quantity=reserved, sold_quantity=sold
    )
    item = SimpleNamespace(id=1, quantity=qty, variant=variant)
    return SimpleNamespace(
        id=1,
        status=status.value,
        payment_method=method.value,
        items=[item],
        payments=[],
        paid_at=paid_at,
    ), variant


ALL_STATES = list(OrderStatus)
METHODS = list(OrderPaymentMethod)


@pytest.mark.parametrize("method", METHODS)
@pytest.mark.parametrize("current", ALL_STATES)
@pytest.mark.parametrize("target", ALL_STATES)
def test_every_unlisted_transition_is_refused_and_changes_nothing(
    method, current, target
):
    if target in _ALLOWED_TRANSITIONS.get((method, current), set()):
        pytest.skip("allowed transition")
    order, variant = fake_order(method, current)
    with pytest.raises(InvalidOrderTransition):
        apply_order_transition(order, target)
    assert order.status == current.value
    assert (variant.reserved_quantity, variant.sold_quantity) == (1, 0)


@pytest.mark.parametrize("method", METHODS)
@pytest.mark.parametrize("terminal", [OrderStatus.CANCELLED, OrderStatus.EXPIRED])
@pytest.mark.parametrize("target", ALL_STATES)
def test_cancelled_and_expired_orders_never_come_back(method, terminal, target):
    order, _ = fake_order(method, terminal, reserved=0)
    with pytest.raises(InvalidOrderTransition):
        apply_order_transition(order, target)


def test_pending_vietqr_pay_moves_reserved_to_sold():
    order, variant = fake_order(
        OrderPaymentMethod.VIETQR, OrderStatus.PENDING, qty=2, reserved=2
    )
    apply_order_transition(order, OrderStatus.PAID)
    assert (variant.reserved_quantity, variant.sold_quantity) == (0, 2)
    assert order.paid_at is not None


@pytest.mark.parametrize("target", [OrderStatus.CANCELLED, OrderStatus.EXPIRED])
def test_releasing_a_pending_order_returns_the_reservation(target):
    order, variant = fake_order(
        OrderPaymentMethod.VIETQR, OrderStatus.PENDING, qty=2, reserved=3
    )
    apply_order_transition(order, target)
    assert (variant.reserved_quantity, variant.sold_quantity) == (1, 0)


def test_cancelling_a_paid_order_releases_sold_not_reserved():
    order, variant = fake_order(
        OrderPaymentMethod.VIETQR,
        OrderStatus.PAID,
        reserved=4,
        sold=2,
        qty=2,
        stock=10,
        paid_at="x",
    )
    apply_order_transition(order, OrderStatus.CANCELLED)
    assert (variant.reserved_quantity, variant.sold_quantity) == (4, 0)


def test_counters_that_do_not_cover_the_order_are_refused_without_partial_writes():
    order, variant = fake_order(
        OrderPaymentMethod.VIETQR, OrderStatus.PENDING, reserved=1, qty=3
    )
    with pytest.raises(ConflictError):
        apply_order_transition(order, OrderStatus.PAID)
    assert order.status == "pending"
    assert (variant.reserved_quantity, variant.sold_quantity) == (1, 0)


def test_counters_beyond_stock_are_treated_as_corrupt():
    order, _ = fake_order(
        OrderPaymentMethod.VIETQR, OrderStatus.PENDING, reserved=9, stock=5
    )
    with pytest.raises(ConflictError):
        apply_order_transition(order, OrderStatus.CANCELLED)


def test_order_without_items_cannot_transition():
    order, _ = fake_order(OrderPaymentMethod.VIETQR, OrderStatus.PENDING)
    order.items = []
    with pytest.raises(RuntimeError):
        apply_order_transition(order, OrderStatus.PAID)


def test_same_variant_on_two_lines_is_checked_cumulatively():
    order, variant = fake_order(
        OrderPaymentMethod.VIETQR, OrderStatus.PENDING, reserved=3, qty=2
    )
    order.items.append(SimpleNamespace(id=2, quantity=2, variant=variant))
    with pytest.raises(ConflictError):  # 2 + 2 > 3 reserved
        apply_order_transition(order, OrderStatus.PAID)
    assert variant.reserved_quantity == 3


@pytest.mark.parametrize(
    "stock,reserved,sold,expected",
    [
        (10, 0, 0, 10),
        (10, 3, 2, 5),
        (0, 0, 0, 0),
        (None, None, None, 0),
        (5, 5, 0, 0),
        (5, 4, 3, -2),
    ],
)
def test_available_stock_math(stock, reserved, sold, expected):
    target = SimpleNamespace(
        stock_quantity=stock, reserved_quantity=reserved, sold_quantity=sold
    )
    assert available_stock(target) == expected


@pytest.mark.parametrize(
    "items",
    [
        [],
        [SimpleNamespace(variant_id=0, quantity=1)],
        [SimpleNamespace(variant_id=-3, quantity=1)],
        [SimpleNamespace(variant_id=1, quantity=0)],
        [SimpleNamespace(variant_id=1, quantity=-2)],
    ],
)
def test_cart_aggregation_refuses_bad_lines(items):
    with pytest.raises(InvalidCartItemError):
        aggregate_cart_items(items)


def test_cart_aggregation_merges_duplicate_lines():
    lines = [
        SimpleNamespace(variant_id=1, quantity=2),
        SimpleNamespace(variant_id=2, quantity=1),
        SimpleNamespace(variant_id=1, quantity=3),
    ]
    assert aggregate_cart_items(lines) == {1: 5, 2: 1}


# --------------------------------------------------------------------- VietQR memo


@pytest.mark.parametrize(
    "memo,expected",
    [
        ("TL12", [12]),
        ("tl12", [12]),
        ("TRUELOOK_12", [12]),
        ("LUXESTORE 12", [12]),
        ("thanh toan TL12 cam on", [12]),
        ("TL12x13", [12, 13]),
        ("TL13_12", [12, 13]),
        ("TL12x12", [12]),
        ("", []),
        ("   ", []),
        ("TL", []),
        ("TL0", []),
        ("TL012", []),
        ("TL-5", [5]),  # a dash is an accepted separator
        ("TL12abc", []),
        ("ATL12", []),
        ("TL12 TL13", []),  # two tokens are ambiguous
        ("TL12 TLabc", []),
        ("XTL12", []),
        ("12", []),
        ("TL" + "9" * 50, [int("9" * 50)]),
    ],
)
def test_memo_parsing(memo, expected):
    assert parse_order_ids_from_memo(memo) == expected


def test_memo_round_trip():
    for order_id in (1, 7, 123456):
        assert parse_order_ids_from_memo(generate_order_payment_memo(order_id)) == [
            order_id
        ]


@pytest.mark.parametrize("bad", [0, -1])
def test_memo_generation_refuses_non_positive_ids(bad):
    with pytest.raises(ValueError):
        generate_order_payment_memo(bad)


# --------------------------------------------------------------------- end to end stock counters


@pytest.fixture
def shop(client, db_session, mock_admin_auth, mock_user_auth):
    product, (variant_id,) = make_product(
        client, db_session, variants=STOCK, price=100000
    )
    assert (
        client.patch(
            f"{PRODUCTS}/{product['id']}", json={"is_active": True}
        ).status_code
        == 200
    )
    return SimpleNamespace(
        product=product, variant_id=variant_id, db=db_session, client=client
    )


def counters(shop):
    shop.db.expire_all()
    variant = shop.db.get(ProductVariant, shop.variant_id)
    return variant.reserved_quantity, variant.sold_quantity


def place(shop, quantity=1, method="vietqr"):
    response = shop.client.post(
        f"{ORDERS}/checkout-cart",
        json={
            **SHIPPING,
            "payment_method": method,
            "items": [{"variant_id": shop.variant_id, "quantity": quantity}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["orders"][0]


def pay(shop, order, amount=None, tx="TX-1", memo=None):
    return shop.client.post(
        WEBHOOK,
        headers=SECRET,
        json={
            "transaction_id": tx,
            "amount": amount if amount is not None else float(order["total_amount"]),
            "content": memo or generate_order_payment_memo(order["id"]),
        },
    )


def set_status(shop, order, status):
    return shop.client.put(f"{ORDERS}/{order['id']}/status", json={"status": status})


def test_checkout_reserves_and_total_uses_server_price(shop):
    order = place(shop, quantity=3)
    assert counters(shop) == (3, 0)
    assert float(order["total_amount"]) == 300000
    assert order["status"] == "pending"


def test_cod_checkout_starts_confirmed(shop):
    assert place(shop, method="cod")["status"] == "confirmed"


def test_pay_then_cancel_releases_sold_stock(shop):
    order = place(shop, quantity=2)
    assert pay(shop, order).status_code == 200
    assert counters(shop) == (0, 2)
    assert set_status(shop, order, "cancelled").status_code == 200
    assert counters(shop) == (0, 0)


def test_cancel_pending_releases_reservation(shop):
    order = place(shop, quantity=2)
    assert shop.client.post(f"{ORDERS}/{order['id']}/cancel").status_code == 200
    assert counters(shop) == (0, 0)


def test_cancelling_twice_never_releases_stock_twice(shop):
    first = place(shop, quantity=2)
    second = place(shop, quantity=1)
    shop.client.post(f"{ORDERS}/{first['id']}/cancel")
    assert_rejected(shop.client.post(f"{ORDERS}/{first['id']}/cancel"), 400)
    assert counters(shop) == (1, 0)  # only the second order is still holding stock
    assert second["id"] != first["id"]


def test_customer_cannot_cancel_after_payment(shop):
    order = place(shop)
    pay(shop, order)
    assert_rejected(shop.client.post(f"{ORDERS}/{order['id']}/cancel"), 400)
    assert counters(shop) == (0, 1)


@pytest.mark.parametrize("status", ["shipped", "delivered", "confirmed", "pending"])
def test_admin_cannot_skip_ahead_on_a_pending_vietqr_order(shop, status):
    order = place(shop)
    assert_rejected(set_status(shop, order, status), 409)
    assert counters(shop) == (1, 0)


def test_shipped_requires_payment_first_for_vietqr(shop):
    order = place(shop)
    assert_rejected(set_status(shop, order, "shipped"), 409)
    pay(shop, order)
    assert set_status(shop, order, "shipped").status_code == 200
    assert set_status(shop, order, "delivered").status_code == 200
    assert_rejected(set_status(shop, order, "shipped"), 409)  # no going back


def test_cod_full_lifecycle_keeps_counters_consistent(shop):
    order = place(shop, quantity=2, method="cod")
    assert counters(shop) == (2, 0)
    assert set_status(shop, order, "shipped").status_code == 200
    assert set_status(shop, order, "paid").status_code == 200
    assert counters(shop) == (0, 2)
    assert set_status(shop, order, "delivered").status_code == 200
    assert counters(shop) == (0, 2)


def test_marking_paid_twice_is_refused_and_counts_once(shop):
    order = place(shop)
    assert set_status(shop, order, "paid").status_code == 200
    assert_rejected(set_status(shop, order, "paid"), 409)
    assert counters(shop) == (0, 1)


def test_available_stock_tracks_the_whole_lifecycle(shop):
    pid = shop.product["id"]

    def available():
        return shop.client.get(f"{PRODUCTS}/{pid}").json()["available_stock"]

    assert available() == 5
    order = place(shop, quantity=2)
    assert available() == 3
    pay(shop, order)
    assert available() == 3
    set_status(shop, order, "cancelled")
    assert available() == 5


def test_pending_order_limit_blocks_stock_hoarding(shop):
    shop.client.post(
        f"/api/v1/variants/{shop.variant_id}/adjust-stock",
        json={"delta": 5, "reason": "restock"},
    )
    for _ in range(5):
        place(shop)
    response = shop.client.post(
        f"{ORDERS}/checkout-cart",
        json={**SHIPPING, "items": [{"variant_id": shop.variant_id, "quantity": 1}]},
    )
    assert_rejected(response, 429)
    # COD orders do not count against the limit.
    assert place(shop, method="cod")["status"] == "confirmed"


def test_deactivating_the_product_blocks_new_orders_only(shop):
    order = place(shop)
    shop.client.patch(f"{PRODUCTS}/{shop.product['id']}", json={"is_active": False})
    response = shop.client.post(
        f"{ORDERS}/checkout-cart",
        json={**SHIPPING, "items": [{"variant_id": shop.variant_id, "quantity": 1}]},
    )
    assert_rejected(response, 404)
    assert pay(shop, order).status_code == 200  # existing order can still be paid


def test_reorder_requires_a_dead_order_and_rechecks_stock(shop):
    order = place(shop, quantity=2)
    code = order["public_code"]
    assert_rejected(
        shop.client.post(f"{ORDERS}/track/{code}/reorder"), 400
    )  # still pending
    shop.client.post(f"{ORDERS}/{order['id']}/cancel")
    again = shop.client.post(f"{ORDERS}/track/{code}/reorder")
    assert again.status_code == 201, again.text
    assert counters(shop) == (2, 0)
    # a second reorder of the same cancelled order is fine only while stock lasts
    shop.client.post(f"{ORDERS}/track/{code}/reorder")
    assert counters(shop) == (4, 0)
    assert_rejected(shop.client.post(f"{ORDERS}/track/{code}/reorder"), 409)


# --------------------------------------------------------------------- webhook logic


def test_webhook_marks_paid_and_replay_is_idempotent(shop):
    order = place(shop)
    assert pay(shop, order).json()["status"] == "success"
    assert pay(shop, order).json()["status"] == "already_processed"
    assert counters(shop) == (0, 1)
    payments = shop.db.query(Payment).filter_by(order_id=order["id"]).all()
    assert [p.status for p in payments] == ["paid"]


def test_second_transaction_for_a_paid_order_is_a_duplicate_not_a_second_sale(shop):
    order = place(shop)
    pay(shop, order, tx="A")
    assert pay(shop, order, tx="B").json()["status"] == "duplicate_payment"
    assert counters(shop) == (0, 1)


def test_wrong_amount_is_recorded_but_does_not_pay(shop):
    order = place(shop)
    result = pay(shop, order, amount=1)
    assert result.json()["status"] == "amount_mismatch"
    assert counters(shop) == (1, 0)
    shop.db.expire_all()
    assert shop.db.get(Order, order["id"]).status == "pending"
    # the right amount with a new transaction id still pays afterwards
    assert pay(shop, order, tx="OK").json()["status"] == "success"


def test_payment_after_cancel_is_a_late_payment_and_never_revives_the_order(shop):
    order = place(shop)
    shop.client.post(f"{ORDERS}/{order['id']}/cancel")
    assert pay(shop, order).json()["status"] == "late_payment"
    shop.db.expire_all()
    assert shop.db.get(Order, order["id"]).status == "cancelled"
    assert counters(shop) == (0, 0)


def test_same_transaction_cannot_pay_two_different_orders(shop):
    first, second = place(shop), place(shop)
    pay(shop, first, tx="SHARED")
    assert_rejected(pay(shop, second, tx="SHARED"), 400)
    assert counters(shop) == (1, 1)


def test_memo_naming_two_orders_is_refused(shop):
    first, second = place(shop), place(shop)
    memo = f"TL{first['id']}x{second['id']}"
    assert_rejected(pay(shop, first, memo=memo), 400)
    assert counters(shop) == (2, 0)


@pytest.mark.parametrize("memo", ["hello", "TL0", "TL99999", "TLabc"])
def test_unusable_memos_never_pay_anything(shop, memo):
    place(shop)
    assert pay(shop, {"id": 1, "total_amount": 100000}, memo=memo).status_code in (
        400,
        404,
    )
    assert counters(shop) == (1, 0)


def test_webhook_amount_rounding_follows_whole_dong(shop):
    order = place(shop)
    assert pay(shop, order, amount=100000.4).json()["status"] == "success"


# --------------------------------------------------------------------- reviews


def review(client, pid, **body):
    return client.post(f"{PRODUCTS}/{pid}/reviews", json={"rating": 5, **body})


def test_review_requires_a_paid_order(shop):
    pid = shop.product["id"]
    assert_rejected(review(shop.client, pid), 403)
    order = place(shop)
    assert_rejected(review(shop.client, pid), 403)  # pending is not a purchase
    pay(shop, order)
    assert review(shop.client, pid).status_code in (200, 201)


def test_review_is_refused_again_after_the_only_order_is_cancelled(shop):
    pid = shop.product["id"]
    order = place(shop)
    pay(shop, order)
    set_status(shop, order, "cancelled")
    assert_rejected(review(shop.client, pid), 403)


def test_second_review_updates_instead_of_duplicating(shop):
    pid = shop.product["id"]
    pay(shop, place(shop))
    review(shop.client, pid, rating=2, comment="meh")
    review(shop.client, pid, rating=4, comment="better")
    data = shop.client.get(f"{PRODUCTS}/{pid}/reviews").json()
    assert data["total"] == 1
    assert data["summary"]["average_rating"] == 4.0
    assert data["items"][0]["comment"] == "better"


@pytest.mark.parametrize(
    "body",
    [
        {"rating": 0},
        {"rating": 6},
        {"rating": 4.5},
        {"rating": "five"},
        {"rating": 5, "fit_feedback": "huge"},
        {"rating": 5, "comment": "c" * 1001},
        {"rating": 5, "title": "t" * 256},
    ],
)
def test_review_field_violations_are_422(shop, body):
    pid = shop.product["id"]
    pay(shop, place(shop))
    assert_rejected(shop.client.post(f"{PRODUCTS}/{pid}/reviews", json=body), 422)


def test_review_summary_percentages_and_empty_state(shop):
    pid = shop.product["id"]
    empty = shop.client.get(f"{PRODUCTS}/{pid}/reviews").json()
    assert empty["total"] == 0 and empty["summary"]["average_rating"] is None
    assert empty["summary"]["fit_feedback"] is None
    pay(shop, place(shop))
    review(shop.client, pid, rating=3, fit_feedback="large")
    fit = shop.client.get(f"{PRODUCTS}/{pid}/reviews").json()["summary"]["fit_feedback"]
    assert fit["large"] == 100.0 and fit["small"] == 0.0 and fit["total_responses"] == 1
