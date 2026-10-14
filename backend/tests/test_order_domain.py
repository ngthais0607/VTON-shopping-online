from datetime import datetime, timezone

import pytest

from app.core.errors import ConflictError
from app.features.orders.constants import OrderStatus
from app.features.orders.domain import (
    InvalidCartItemError,
    InvalidOrderTransition,
    aggregate_cart_items,
    apply_order_transition,
    available_stock,
)
from app.features.orders.model import Order, OrderItem, Payment
from app.features.orders.schemas import CartItemRequest
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant


def _order(method: str, status: str) -> tuple[Order, Product, ProductVariant]:
    product = Product(name="Watch", price=20)
    variant = ProductVariant(
        id=1,
        product=product,
        product_id=1,
        sku="WATCH-DEFAULT",
        size="ONE_SIZE",
        color_name="Default",
        stock_quantity=7,
        reserved_quantity=2,
        sold_quantity=1,
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
    item = OrderItem(
        order=order,
        product=product,
        variant=variant,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        quantity=2,
        unit_price=20,
        subtotal=40,
    )
    order.items = [item]
    return order, product, variant


def test_available_stock_excludes_reserved_and_sold():
    _, _, variant = _order("vietqr", "pending")
    assert available_stock(variant) == 4


def test_duplicate_cart_lines_aggregate_before_stock_check():
    items = [
        CartItemRequest(variant_id=5, quantity=2),
        CartItemRequest(variant_id=5, quantity=3),
    ]
    assert aggregate_cart_items(items) == {5: 5}


@pytest.mark.parametrize("quantity", [0, -1])
def test_non_positive_cart_quantity_is_rejected(quantity):
    with pytest.raises(InvalidCartItemError):
        aggregate_cart_items(
            [CartItemRequest.model_construct(variant_id=5, quantity=quantity)]
        )


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
    order, _, variant = _order(method, initial)
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    apply_order_transition(order, target, now)
    assert order.status == target.value
    assert variant.reserved_quantity == 0
    assert variant.sold_quantity == sold
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
    order, _, variant = _order(method, initial)
    with pytest.raises(InvalidOrderTransition):
        apply_order_transition(order, target)
    assert order.status == initial
    assert variant.reserved_quantity == 2
    assert variant.sold_quantity == 1


def test_expiration_marks_pending_payments_expired():
    order, _, _ = _order("vietqr", "pending")
    order.payments = [
        Payment(status="pending", amount=40),
        Payment(status="paid", amount=40),
    ]
    apply_order_transition(order, OrderStatus.EXPIRED)
    assert [payment.status for payment in order.payments] == ["expired", "paid"]


def test_cod_pending_to_confirmed_preserves_reservation_and_available_stock():
    order, _, variant = _order("cod", "pending")
    # Initial: stock=7, reserved=2, sold=1 -> available=4
    apply_order_transition(order, OrderStatus.CONFIRMED)
    assert order.status == "confirmed"
    assert variant.reserved_quantity == 2, "CONFIRMED must not release reservation!"
    assert variant.sold_quantity == 1, "CONFIRMED must not increment sold quantity!"
    assert available_stock(variant) == 4, "Available stock must stay exactly 4!"


def test_inconsistent_negative_counters_raises_inventory_state_inconsistent():
    order, _, variant = _order("vietqr", "pending")
    variant.reserved_quantity = 1  # order quantity is 2, so reserved is insufficient
    with pytest.raises(ConflictError) as exc_info:
        apply_order_transition(order, OrderStatus.CANCELLED)
    assert exc_info.value.code == "inventory_state_inconsistent"


def test_is_order_paid_predicate():
    from app.features.orders.domain import is_order_paid

    order, _, _ = _order("vietqr", "pending")
    assert is_order_paid(order) is False

    order.paid_at = datetime.now(timezone.utc)
    assert is_order_paid(order) is True

    order.paid_at = None
    order.status = "paid"
    assert is_order_paid(order) is True

    order.status = "pending"
    order.payments = [Payment(status="paid", amount=40)]
    assert is_order_paid(order) is True

    order.payments = [Payment(status="pending", amount=40)]
    assert is_order_paid(order) is False
