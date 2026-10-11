from datetime import datetime, timezone

import pytest

from app.features.orders.constants import OrderStatus
from app.features.orders.domain import (
    InvalidCartItemError,
    InvalidOrderTransition,
    aggregate_cart_items,
    apply_order_transition,
    available_stock,
)
from app.features.orders.model import Order, Payment
from app.features.orders.schemas import CartItemRequest
from app.features.products.model import Product


def _order(method: str, status: str) -> tuple[Order, Product]:
    product = Product(
        name="Watch", price=20, stock_quantity=7, reserved_quantity=2, sold_quantity=1
    )
    order = Order(
        product=product,
        product_name="Watch",
        unit_price=20,
        quantity=2,
        total_amount=40,
        currency="USD",
        status=status,
        payment_method=method,
        customer_name="Buyer",
        customer_phone="1",
        shipping_address="Address",
    )
    return order, product


def test_available_stock_excludes_reserved_and_sold():
    _, product = _order("vietqr", "pending")
    assert available_stock(product) == 4


def test_duplicate_cart_lines_aggregate_before_stock_check():
    items = [
        CartItemRequest(product_id=5, quantity=2),
        CartItemRequest(product_id=5, quantity=3),
    ]
    assert aggregate_cart_items(items) == {5: 5}


@pytest.mark.parametrize("quantity", [0, -1])
def test_non_positive_cart_quantity_is_rejected(quantity):
    with pytest.raises(InvalidCartItemError):
        aggregate_cart_items([CartItemRequest(product_id=5, quantity=quantity)])


@pytest.mark.parametrize(
    ("method", "initial", "target", "sold"),
    [
        ("vietqr", "pending", OrderStatus.PAID, 3),
        ("vietqr", "pending", OrderStatus.CANCELLED, 1),
        ("vietqr", "pending", OrderStatus.EXPIRED, 1),
        ("cod", "confirmed", OrderStatus.PAID, 3),
        ("cod", "confirmed", OrderStatus.CANCELLED, 1),
    ],
)
def test_allowed_transition_releases_reservation(method, initial, target, sold):
    order, product = _order(method, initial)
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    apply_order_transition(order, target, now)
    assert order.status == target.value
    assert product.reserved_quantity == 0
    assert product.sold_quantity == sold
    assert order.paid_at == (now if target == OrderStatus.PAID else None)


@pytest.mark.parametrize(
    ("method", "initial", "target"),
    [
        ("vietqr", "pending", OrderStatus.CONFIRMED),
        ("cod", "confirmed", OrderStatus.EXPIRED),
        ("vietqr", "paid", OrderStatus.PAID),
        ("vietqr", "expired", OrderStatus.PAID),
        ("cod", "cancelled", OrderStatus.PAID),
    ],
)
def test_forbidden_or_repeated_transition_does_not_mutate_stock(
    method, initial, target
):
    order, product = _order(method, initial)
    with pytest.raises(InvalidOrderTransition):
        apply_order_transition(order, target)
    assert order.status == initial
    assert product.reserved_quantity == 2
    assert product.sold_quantity == 1


def test_expiration_marks_pending_payments_expired():
    order, _ = _order("vietqr", "pending")
    order.payments = [
        Payment(status="pending", amount=40),
        Payment(status="paid", amount=40),
    ]
    apply_order_transition(order, OrderStatus.EXPIRED)
    assert [payment.status for payment in order.payments] == ["expired", "paid"]
