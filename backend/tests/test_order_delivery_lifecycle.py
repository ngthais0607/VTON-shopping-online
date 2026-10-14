from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from starlette.testclient import TestClient

from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.domain import (
    InvalidOrderTransition,
    apply_order_transition,
)
from app.features.orders.model import Order, OrderItem
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User


def _make_domain_order(
    payment_method: OrderPaymentMethod,
    status: OrderStatus,
    qty: int = 2,
    reserved: int = 2,
    sold: int = 0,
    paid: bool = False,
):
    variant = MagicMock()
    variant.id = 101
    variant.stock_quantity = 20
    variant.reserved_quantity = reserved
    variant.sold_quantity = sold

    item = MagicMock()
    item.id = 201
    item.quantity = qty
    item.variant = variant

    order = MagicMock(spec=Order)
    order.id = 1
    order.status = status.value
    order.payment_method = payment_method.value
    order.items = [item]
    order.paid_at = "2026-10-14T10:00:00Z" if paid else None
    order.payments = []
    return order, variant


def test_vietqr_delivery_lifecycle_transitions():
    order, variant = _make_domain_order(
        OrderPaymentMethod.VIETQR, OrderStatus.PENDING, reserved=2, sold=0
    )

    # pending -> paid (deducts reserved, increases sold)
    apply_order_transition(order, OrderStatus.PAID)
    assert order.status == OrderStatus.PAID.value
    assert variant.reserved_quantity == 0
    assert variant.sold_quantity == 2

    # paid -> shipped (inventory untouched)
    apply_order_transition(order, OrderStatus.SHIPPED)
    assert order.status == OrderStatus.SHIPPED.value
    assert variant.reserved_quantity == 0
    assert variant.sold_quantity == 2

    # shipped -> delivered (inventory untouched)
    apply_order_transition(order, OrderStatus.DELIVERED)
    assert order.status == OrderStatus.DELIVERED.value
    assert variant.reserved_quantity == 0
    assert variant.sold_quantity == 2


def test_cod_delivery_lifecycle_transitions():
    order, variant = _make_domain_order(
        OrderPaymentMethod.COD, OrderStatus.PENDING, reserved=2, sold=0
    )

    # pending -> confirmed (reservation intact)
    apply_order_transition(order, OrderStatus.CONFIRMED)
    assert order.status == OrderStatus.CONFIRMED.value
    assert variant.reserved_quantity == 2
    assert variant.sold_quantity == 0

    # confirmed -> shipped (reservation intact)
    apply_order_transition(order, OrderStatus.SHIPPED)
    assert order.status == OrderStatus.SHIPPED.value
    assert variant.reserved_quantity == 2
    assert variant.sold_quantity == 0

    # shipped -> delivered (reservation intact)
    apply_order_transition(order, OrderStatus.DELIVERED)
    assert order.status == OrderStatus.DELIVERED.value
    assert variant.reserved_quantity == 2
    assert variant.sold_quantity == 0

    # delivered -> paid (COD receipt upon delivery: unreserves and marks sold)
    apply_order_transition(order, OrderStatus.PAID)
    assert order.status == OrderStatus.PAID.value
    assert variant.reserved_quantity == 0
    assert variant.sold_quantity == 2


def test_invalid_lifecycle_transitions():
    order, _ = _make_domain_order(OrderPaymentMethod.VIETQR, OrderStatus.PENDING)

    # Cannot skip directly from pending to delivered
    with pytest.raises(InvalidOrderTransition):
        apply_order_transition(order, OrderStatus.DELIVERED)

    # Cannot skip directly from pending to shipped
    with pytest.raises(InvalidOrderTransition):
        apply_order_transition(order, OrderStatus.SHIPPED)


def test_customer_can_cancel_pending_order_and_restores_inventory(
    client: TestClient, db_session
):
    user = User(
        email="customer_cancel@example.com",
        username="cust_cancel",
        password_hash="pw",
        role="customer",
    )
    db_session.add(user)
    db_session.commit()

    product = Product(
        name="Cancel Shirt",
        slug="cancel-shirt",
        price=Decimal("200000.00"),
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="CANCEL-VAR-1",
        size="L",
        color_name="Blue",
        stock_quantity=10,
        reserved_quantity=2,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(variant)
    db_session.flush()

    order = Order(
        user_id=user.id,
        customer_name="Customer Test",
        customer_phone="0912345678",
        shipping_address="123 Duong Le Loi, TP HCM",
        total_amount=Decimal("400000.00"),
        payment_method=OrderPaymentMethod.VIETQR.value,
        status=OrderStatus.PENDING.value,
    )
    db_session.add(order)
    db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=product.id,
        variant_id=variant.id,
        sku=variant.sku,
        size="L",
        color_name="Blue",
        product_name="Cancel Shirt",
        unit_price=Decimal("200000.00"),
        quantity=2,
        subtotal=Decimal("400000.00"),
    )
    db_session.add(item)
    db_session.commit()

    from app.core.security import create_access_token

    token = create_access_token({"sub": str(user.id), "role": user.role})
    headers = {"Authorization": f"Bearer {token}"}

    # Cancel the pending order
    res = client.post(f"/api/v1/orders/{order.id}/cancel", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "cancelled"
    assert data["payment_status"] == "cancelled"

    # Inventory reserved should be restored
    db_session.refresh(variant)
    assert variant.reserved_quantity == 0


def test_customer_cannot_cancel_already_paid_or_other_user_order(
    client: TestClient, db_session
):
    user1 = User(
        email="user1_cancel@example.com",
        username="user1_cancel",
        password_hash="pw",
        role="customer",
    )
    user2 = User(
        email="user2_cancel@example.com",
        username="user2_cancel",
        password_hash="pw",
        role="customer",
    )
    db_session.add_all([user1, user2])
    db_session.commit()

    product = Product(
        name="NoCancel Shirt",
        slug="nocancel-shirt",
        price=Decimal("100000.00"),
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="NOCANCEL-VAR",
        size="S",
        color_name="Red",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=1,
        is_active=True,
    )
    db_session.add(variant)
    db_session.flush()

    paid_order = Order(
        user_id=user1.id,
        customer_name="User 1",
        customer_phone="0912345678",
        shipping_address="123 Duong Le Loi, TP HCM",
        total_amount=Decimal("100000.00"),
        payment_method=OrderPaymentMethod.VIETQR.value,
        status=OrderStatus.PAID.value,
    )
    db_session.add(paid_order)
    db_session.flush()

    item = OrderItem(
        order_id=paid_order.id,
        product_id=product.id,
        variant_id=variant.id,
        sku=variant.sku,
        size="S",
        color_name="Red",
        product_name="NoCancel Shirt",
        unit_price=Decimal("100000.00"),
        quantity=1,
        subtotal=Decimal("100000.00"),
    )
    db_session.add(item)
    db_session.commit()

    from app.core.security import create_access_token

    # 1. User1 attempts to cancel already PAID order -> rejected
    token1 = create_access_token({"sub": str(user1.id), "role": user1.role})
    res1 = client.post(
        f"/api/v1/orders/{paid_order.id}/cancel",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert res1.status_code == 400
    assert res1.json()["code"] == "order_not_cancellable"

    # 2. User2 attempts to cancel User1's order -> forbidden
    token2 = create_access_token({"sub": str(user2.id), "role": user2.role})
    res2 = client.post(
        f"/api/v1/orders/{paid_order.id}/cancel",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res2.status_code == 403
