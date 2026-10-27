from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi import BackgroundTasks
from sqlalchemy import event

from app.features.orders.constants import OrderStatus
from app.features.orders.model import Order, OrderItem
from app.features.orders.schemas import CheckoutCommand
from app.features.orders.service import (
    InsufficientStockError,
    change_order_status,
    checkout_cart,
    expire_pending_orders,
)
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User


def _two_pending_orders(db_session) -> tuple[ProductVariant, int, int]:
    product = Product(
        name="Shared stock",
        price=20,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="SHARED-ONE_SIZE",
        size="ONE_SIZE",
        color_name="Default",
        stock_quantity=2,
        reserved_quantity=2,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(variant)
    db_session.flush()

    orders = []
    for _ in range(2):
        order = Order(
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
        item = OrderItem(
            order=order,
            product_id=product.id,
            product_name=product.name,
            variant_id=variant.id,
            sku=variant.sku,
            size=variant.size,
            color_name=variant.color_name,
            unit_price=20,
            quantity=1,
            subtotal=20,
        )
        order.items = [item]
        orders.append(order)

    db_session.add_all(orders)
    db_session.commit()
    return variant, orders[0].id, orders[1].id


def test_status_change_refreshes_shared_stock_after_another_order_paid(db_session):
    variant, first_id, second_id = _two_pending_orders(db_session)
    db_session.connection().exec_driver_sql(
        "UPDATE product_variants SET reserved_quantity = 1, sold_quantity = 1 WHERE id = ?",
        (variant.id,),
    )
    db_session.connection().exec_driver_sql(
        "UPDATE orders SET status = 'paid' WHERE id = ?", (first_id,)
    )
    assert variant.reserved_quantity == 2
    assert variant.sold_quantity == 0

    change_order_status(
        db_session,
        second_id,
        OrderStatus.PAID,
        AsyncMock(),
        background_tasks=BackgroundTasks(),
    )

    db_session.refresh(variant)
    assert variant.reserved_quantity == 0
    assert variant.sold_quantity == 2


def test_expiration_refreshes_shared_stock_after_another_order_expired(db_session):
    variant, first_id, second_id = _two_pending_orders(db_session)
    db_session.connection().exec_driver_sql(
        "UPDATE product_variants SET reserved_quantity = 1 WHERE id = ?", (variant.id,)
    )
    db_session.connection().exec_driver_sql(
        "UPDATE orders SET status = 'expired' WHERE id = ?", (first_id,)
    )
    assert variant.reserved_quantity == 2

    expired_count = expire_pending_orders(db_session)

    assert expired_count == 1
    assert db_session.get(Order, second_id).status == "expired"
    db_session.refresh(variant)
    assert variant.reserved_quantity == 0
    assert variant.sold_quantity == 0


def test_checkout_rechecks_locked_product_when_identity_map_is_stale(db_session):
    user = User(
        username="stale-checkout",
        email="stale-checkout@example.com",
        password_hash="unused",
        role="customer",
    )
    product = Product(name="Stale checkout stock", price=20)
    db_session.add_all([user, product])
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="STALE-ONE_SIZE",
        size="ONE_SIZE",
        color_name="Default",
        stock_quantity=2,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(variant)
    db_session.commit()

    db_session.connection().exec_driver_sql(
        "UPDATE product_variants SET reserved_quantity = 1 WHERE id = ?", (variant.id,)
    )
    assert variant.reserved_quantity == 0
    command = CheckoutCommand(
        items=[{"variant_id": variant.id, "quantity": 2}],
        customer_name="Buyer",
        customer_phone="0912345678",
        shipping_address="123 Test Street, Hanoi",
    )

    with pytest.raises(InsufficientStockError):
        checkout_cart(
            db_session, user, command, AsyncMock(), background_tasks=BackgroundTasks()
        )

    db_session.refresh(variant)
    assert variant.reserved_quantity == 1
    assert db_session.query(Order).count() == 0


def _record_row_lock_order(db_session):
    locked_tables: list[str] = []

    def record(execution):
        statement = execution.statement
        if not execution.is_select or statement._for_update_arg is None:
            return
        sql = str(statement)
        if "FROM product_variants" in sql:
            locked_tables.append("variant")
        elif "FROM products" in sql:
            locked_tables.append("product")
        elif "FROM orders" in sql:
            locked_tables.append("order")

    event.listen(db_session, "do_orm_execute", record)
    return locked_tables, record


def test_status_change_locks_product_before_order_row(db_session):
    _, _, second_id = _two_pending_orders(db_session)
    locked_tables, record = _record_row_lock_order(db_session)
    try:
        change_order_status(
            db_session,
            second_id,
            OrderStatus.CANCELLED,
            AsyncMock(),
            background_tasks=BackgroundTasks(),
        )
    finally:
        event.remove(db_session, "do_orm_execute", record)

    assert locked_tables[:2] == ["variant", "order"]


def test_expiration_locks_product_before_exact_order_rows(db_session):
    _two_pending_orders(db_session)
    locked_tables, record = _record_row_lock_order(db_session)
    try:
        assert expire_pending_orders(db_session) == 2
    finally:
        event.remove(db_session, "do_orm_execute", record)

    assert locked_tables == ["variant", "order", "order"]


@pytest.mark.parametrize("change", ["paid", "extended"])
def test_expiration_rechecks_candidate_after_discovery(db_session, change):
    product = Product(
        name="Expiring candidate",
        price=20,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="EXP-ONE_SIZE",
        size="ONE_SIZE",
        color_name="Default",
        stock_quantity=1,
        reserved_quantity=1,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(variant)
    db_session.flush()

    order = Order(
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
    item = OrderItem(
        order=order,
        product_id=product.id,
        product_name=product.name,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        unit_price=20,
        quantity=1,
        subtotal=20,
    )
    order.items = [item]

    db_session.add(order)
    db_session.commit()
    changed = False

    def change_after_discovery(
        connection, _cursor, statement, _parameters, _context, _many
    ):
        nonlocal changed
        if (
            changed
            or "FROM orders" not in statement
            or "orders.expires_at" not in statement
        ):
            return
        changed = True
        if change == "paid":
            connection.exec_driver_sql(
                "UPDATE orders SET status = 'paid' WHERE id = ?", (order.id,)
            )
            connection.exec_driver_sql(
                "UPDATE product_variants SET reserved_quantity = 0, sold_quantity = 1 WHERE id = ?",
                (variant.id,),
            )
        else:
            new_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
            connection.exec_driver_sql(
                "UPDATE orders SET expires_at = ? WHERE id = ?",
                (new_expiry.isoformat(sep=" "), order.id),
            )

    event.listen(db_session.bind, "after_cursor_execute", change_after_discovery)
    try:
        expired_count = expire_pending_orders(db_session)
    finally:
        event.remove(db_session.bind, "after_cursor_execute", change_after_discovery)

    assert changed
    assert expired_count == 0
    db_session.refresh(order)
    db_session.refresh(variant)
    assert order.status == ("paid" if change == "paid" else "pending")
    assert variant.reserved_quantity == (0 if change == "paid" else 1)
    assert variant.sold_quantity == (1 if change == "paid" else 0)
