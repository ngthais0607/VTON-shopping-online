import asyncio
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier, Event
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.features.orders.constants import OrderStatus
from app.features.orders.domain import (
    InvalidOrderTransition,
    apply_order_transition,
    available_stock,
)
from app.features.orders.model import Order, OrderItem
from app.features.orders.schemas import CheckoutCommand
from app.features.orders.service import (
    change_order_status,
    checkout_cart,
)
from app.features.orders.service import (
    expire_pending_orders as expire_orders,
)
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User
from app.worker import cron_expire_pending_orders

pytestmark = pytest.mark.integration


def _create_pending_order(session_factory):
    session = session_factory()
    suffix = uuid4().hex
    admin = User(
        username=f"transition-admin-{suffix}",
        email=f"transition-admin-{suffix}@example.com",
        password_hash="unused",
        role="admin",
    )
    product = Product(
        name=f"Transition {suffix}",
        slug=f"transition-{suffix}",
        price=100,
        currency="USD",
    )
    session.add_all([admin, product])
    session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"SKU-{suffix}",
        size="M",
        color_name="Black",
        stock_quantity=1,
        reserved_quantity=1,
        sold_quantity=0,
        is_active=True,
    )
    session.add(variant)
    session.flush()

    order = Order(
        user_id=admin.id,
        product_id=product.id,
        product_name=product.name,
        unit_price=product.price,
        quantity=1,
        total_amount=product.price,
        currency="USD",
        status="pending",
        customer_name="Concurrency Customer",
        customer_phone="0123456789",
        shipping_address="123 Lock Street",
        payment_method="vietqr",
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
        unit_price=product.price,
        quantity=1,
        subtotal=product.price,
    )
    order.items = [item]
    session.add(order)
    session.commit()
    identifiers = admin.id, product.id, variant.id, order.id
    session.close()
    return identifiers


def _session_factory():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required")
    engine = create_engine(database_url, pool_pre_ping=True)
    return engine, sessionmaker(bind=engine, expire_on_commit=False)


def test_admin_transition_rechecks_status_after_waiting_for_lock():
    engine, session_factory = _session_factory()
    _, product_id, variant_id, order_id = _create_pending_order(session_factory)
    locking_session = session_factory()
    locked_order = (
        locking_session.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .one()
    )
    apply_order_transition(locked_order, OrderStatus.EXPIRED)
    locking_session.flush()

    def mark_paid():
        session = session_factory()
        try:
            try:
                asyncio.run(
                    change_order_status(
                        session,
                        order_id,
                        OrderStatus.PAID,
                        AsyncMock(),
                        background_tasks=BackgroundTasks(),
                    )
                )
            except InvalidOrderTransition as exc:
                return exc.status_code
            return 200
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(mark_paid)
        time.sleep(0.3)
        locking_session.commit()
        assert future.result(timeout=5) == 409

    verify_session = session_factory()
    assert verify_session.get(Order, order_id).status == "expired"
    final_variant = verify_session.get(ProductVariant, variant_id)
    assert final_variant.reserved_quantity == 0
    assert final_variant.sold_quantity == 0
    verify_session.close()
    locking_session.close()
    engine.dispose()


def test_expiration_worker_rechecks_status_after_waiting_for_lock():
    engine, session_factory = _session_factory()
    _, product_id, variant_id, order_id = _create_pending_order(session_factory)
    locking_session = session_factory()
    locked_order = (
        locking_session.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .one()
    )
    apply_order_transition(locked_order, OrderStatus.PAID)
    locking_session.flush()

    with patch("app.worker.SessionLocal", session_factory):
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                lambda: asyncio.run(cron_expire_pending_orders({}))
            )
            time.sleep(0.3)
            locking_session.commit()
            future.result(timeout=5)

    verify_session = session_factory()
    assert verify_session.get(Order, order_id).status == "paid"
    final_variant = verify_session.get(ProductVariant, variant_id)
    assert final_variant.reserved_quantity == 0
    assert final_variant.sold_quantity == 1
    verify_session.close()
    locking_session.close()
    engine.dispose()


@pytest.mark.parametrize(
    ("second_status", "expected_sold", "use_expiration_service"),
    [
        (OrderStatus.PAID, 2, False),
        (OrderStatus.CANCELLED, 1, False),
        (OrderStatus.EXPIRED, 1, True),
    ],
)
def test_two_orders_sharing_product_preserve_both_transitions(
    second_status, expected_sold, use_expiration_service
):
    engine, session_factory = _session_factory()
    setup = session_factory()
    suffix = uuid4().hex
    product = Product(
        name=f"Shared product {suffix}",
        slug=f"shared-product-{suffix}",
        price=100,
        currency="USD",
    )
    setup.add(product)
    setup.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"SKU-SHARED-{suffix}",
        size="ONE_SIZE",
        color_name="Default",
        stock_quantity=2,
        reserved_quantity=2,
        sold_quantity=0,
        is_active=True,
    )
    setup.add(variant)
    setup.flush()

    first = Order(
        product=product,
        product_name=product.name,
        unit_price=100,
        quantity=1,
        total_amount=100,
        currency="USD",
        status="pending",
        customer_name="First Buyer",
        customer_phone="123",
        shipping_address="Address",
        payment_method="vietqr",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    item1 = OrderItem(
        order=first,
        product_id=product.id,
        product_name=product.name,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        unit_price=100,
        quantity=1,
        subtotal=100,
    )
    first.items = [item1]

    second = Order(
        product=product,
        product_name=product.name,
        unit_price=100,
        quantity=1,
        total_amount=100,
        currency="USD",
        status="pending",
        customer_name="Second Buyer",
        customer_phone="456",
        shipping_address="Address",
        payment_method="vietqr",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    item2 = OrderItem(
        order=second,
        product_id=product.id,
        product_name=product.name,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        unit_price=100,
        quantity=1,
        subtotal=100,
    )
    second.items = [item2]

    setup.add_all([first, second])
    setup.commit()
    _product_id, variant_id, first_id, second_id = (
        product.id,
        variant.id,
        first.id,
        second.id,
    )
    setup.close()

    start = Barrier(2)

    def transition(order_id, status, use_worker):
        session = session_factory()
        try:
            assert session.get(ProductVariant, variant_id).reserved_quantity == 2
            start.wait(timeout=10)
            if use_worker:
                assert expire_orders(session) == 1
            else:
                change_order_status(
                    session,
                    order_id,
                    status,
                    AsyncMock(),
                    background_tasks=BackgroundTasks(),
                )
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        first_future = executor.submit(transition, first_id, OrderStatus.PAID, False)
        second_future = executor.submit(
            transition, second_id, second_status, use_expiration_service
        )
        first_future.result(timeout=15)
        second_future.result(timeout=15)

    verify = session_factory()
    assert verify.get(Order, first_id).status == "paid"
    assert verify.get(Order, second_id).status == second_status.value
    final_variant = verify.get(ProductVariant, variant_id)
    assert final_variant.reserved_quantity == 0
    assert final_variant.sold_quantity == expected_sold
    verify.close()
    engine.dispose()


def test_checkout_insert_does_not_deadlock_with_expiration_scan():
    engine, session_factory = _session_factory()
    setup = session_factory()
    suffix = uuid4().hex
    user = User(
        username=f"checkout-expire-{suffix}",
        email=f"checkout-expire-{suffix}@example.com",
        password_hash="unused",
        role="customer",
    )
    product = Product(
        name=f"Checkout expire {suffix}",
        slug=f"checkout-expire-{suffix}",
        price=100,
        currency="VND",
    )
    setup.add_all([user, product])
    setup.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"SKU-EXPIRE-{suffix}",
        size="ONE_SIZE",
        color_name="Default",
        stock_quantity=2,
        reserved_quantity=1,
        sold_quantity=0,
        is_active=True,
    )
    setup.add(variant)
    setup.flush()

    expiring_order = Order(
        user_id=user.id,
        product=product,
        product_name=product.name,
        unit_price=100,
        quantity=1,
        total_amount=100,
        currency="VND",
        status="pending",
        customer_name="Earlier Buyer",
        customer_phone="123",
        shipping_address="Address",
        payment_method="vietqr",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    item = OrderItem(
        order=expiring_order,
        product_id=product.id,
        product_name=product.name,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        unit_price=100,
        quantity=1,
        subtotal=100,
    )
    expiring_order.items = [item]
    setup.add(expiring_order)
    setup.commit()
    user_id, variant_id, expiring_id = user.id, variant.id, expiring_order.id
    setup.close()

    checkout_locked = Event()
    expiration_discovered = Event()
    command = CheckoutCommand(
        items=[{"variant_id": variant_id, "quantity": 1}],
        customer_name="Later Buyer",
        customer_phone="456",
        shipping_address="Address",
        payment_method="vietqr",
    )

    def pause_checkout_with_product_lock(locked_target):
        checkout_locked.set()
        assert expiration_discovered.wait(timeout=10)
        return available_stock(locked_target)

    def run_checkout():
        session = session_factory()
        try:
            buyer = session.get(User, user_id)
            return checkout_cart(
                session, buyer, command, AsyncMock(), background_tasks=BackgroundTasks()
            )
        finally:
            session.close()

    def run_expiration():
        session = session_factory()

        def mark_discovery(
            _connection, _cursor, statement, _parameters, _context, _many
        ):
            if "FROM orders" in statement and "orders.expires_at" in statement:
                expiration_discovered.set()

        connection = session.connection()
        event.listen(connection, "after_cursor_execute", mark_discovery)
        try:
            return expire_orders(session)
        finally:
            event.remove(connection, "after_cursor_execute", mark_discovery)
            session.close()

    with patch(
        "app.features.orders.service.available_stock",
        side_effect=pause_checkout_with_product_lock,
    ):
        with ThreadPoolExecutor(max_workers=2) as executor:
            checkout_future = executor.submit(run_checkout)
            assert checkout_locked.wait(timeout=10)
            expire_future = executor.submit(run_expiration)
            checkout_response = checkout_future.result(timeout=15)
            expired_count = expire_future.result(timeout=15)

    assert len(checkout_response.orders) == 1
    assert expired_count == 1
    verify = session_factory()
    assert verify.get(Order, expiring_id).status == "expired"
    assert verify.get(Order, checkout_response.orders[0].id).status == "pending"
    final_variant = verify.get(ProductVariant, variant_id)
    assert final_variant.reserved_quantity == 1
    assert final_variant.sold_quantity == 0
    verify.close()
    engine.dispose()
