import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from app.features.orders.constants import OrderStatus
from app.features.orders.model import Order
from app.features.orders.schemas import CheckoutCommand
from app.features.orders.service import (
    InsufficientStockError,
    change_order_status,
    checkout_cart,
    expire_pending_orders,
)
from app.features.products.model import Product
from app.features.users.model import User


def _two_pending_orders(db_session) -> tuple[Product, int, int]:
    product = Product(
        name="Shared stock",
        price=20,
        stock_quantity=2,
        reserved_quantity=2,
        sold_quantity=0,
    )
    db_session.add(product)
    db_session.flush()
    orders = [
        Order(
            product=product,
            product_name=product.name,
            unit_price=20,
            quantity=1,
            total_amount=20,
            currency="USD",
            status="pending",
            payment_method="vietqr",
            customer_name="Buyer",
            customer_phone="123",
            shipping_address="Address",
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        for _ in range(2)
    ]
    db_session.add_all(orders)
    db_session.commit()
    return product, orders[0].id, orders[1].id


def test_status_change_refreshes_shared_stock_after_another_order_paid(db_session):
    product, first_id, second_id = _two_pending_orders(db_session)
    db_session.connection().exec_driver_sql(
        "UPDATE products SET reserved_quantity = 1, sold_quantity = 1 WHERE id = ?",
        (product.id,),
    )
    db_session.connection().exec_driver_sql(
        "UPDATE orders SET status = 'paid' WHERE id = ?", (first_id,)
    )
    assert product.reserved_quantity == 2
    assert product.sold_quantity == 0

    asyncio.run(
        change_order_status(db_session, second_id, OrderStatus.PAID, AsyncMock())
    )

    db_session.refresh(product)
    assert product.reserved_quantity == 0
    assert product.sold_quantity == 2


def test_expiration_refreshes_shared_stock_after_another_order_expired(db_session):
    product, first_id, second_id = _two_pending_orders(db_session)
    db_session.connection().exec_driver_sql(
        "UPDATE products SET reserved_quantity = 1 WHERE id = ?", (product.id,)
    )
    db_session.connection().exec_driver_sql(
        "UPDATE orders SET status = 'expired' WHERE id = ?", (first_id,)
    )
    assert product.reserved_quantity == 2

    expired_count = expire_pending_orders(db_session)

    assert expired_count == 1
    assert db_session.get(Order, second_id).status == "expired"
    db_session.refresh(product)
    assert product.reserved_quantity == 0
    assert product.sold_quantity == 0


def test_checkout_rechecks_locked_product_when_identity_map_is_stale(db_session):
    user = User(
        username="stale-checkout",
        email="stale-checkout@example.com",
        password_hash="unused",
        role="customer",
    )
    product = Product(name="Stale checkout stock", price=20, stock_quantity=2)
    db_session.add_all([user, product])
    db_session.commit()
    db_session.connection().exec_driver_sql(
        "UPDATE products SET reserved_quantity = 1 WHERE id = ?", (product.id,)
    )
    assert product.reserved_quantity == 0
    command = CheckoutCommand(
        items=[{"product_id": product.id, "quantity": 2}],
        customer_name="Buyer",
        customer_phone="123",
        shipping_address="Address",
    )

    with pytest.raises(InsufficientStockError):
        asyncio.run(checkout_cart(db_session, user, command, AsyncMock()))

    db_session.refresh(product)
    assert product.reserved_quantity == 1
    assert db_session.query(Order).filter(Order.product_id == product.id).count() == 0
