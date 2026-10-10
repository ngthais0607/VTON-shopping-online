import asyncio
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.features.orders.constants import OrderStatus
from app.features.orders.model import Order
from app.features.orders.router import update_order_status
from app.features.orders.schema import OrderStatusUpdate
from app.features.orders.service import transition_order
from app.features.products.model import Product
from app.features.users.model import User
from app.jobs.order_jobs import expire_pending_orders


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
    product = Product(name=f"Transition {suffix}", price=100, stock_quantity=1, reserved_quantity=1)
    session.add_all([admin, product])
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
    session.add(order)
    session.commit()
    identifiers = admin.id, product.id, order.id
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
    admin_id, product_id, order_id = _create_pending_order(session_factory)
    locking_session = session_factory()
    locked_order = (
        locking_session.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .one()
    )
    transition_order(locked_order, OrderStatus.EXPIRED)
    locking_session.flush()

    def mark_paid():
        session = session_factory()
        try:
            admin = session.get(User, admin_id)
            with patch("app.features.orders.router.enqueue_task", new=AsyncMock()):
                try:
                    asyncio.run(
                        update_order_status(
                            order_id,
                            OrderStatusUpdate(status="paid"),
                            session,
                            admin,
                        )
                    )
                except HTTPException as exc:
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
    product = verify_session.get(Product, product_id)
    assert product.reserved_quantity == 0
    assert product.sold_quantity == 0
    verify_session.close()
    locking_session.close()
    engine.dispose()


def test_expiration_worker_rechecks_status_after_waiting_for_lock():
    engine, session_factory = _session_factory()
    _, product_id, order_id = _create_pending_order(session_factory)
    locking_session = session_factory()
    locked_order = (
        locking_session.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .one()
    )
    transition_order(locked_order, OrderStatus.PAID)
    locking_session.flush()

    with patch("app.jobs.order_jobs.SessionLocal", session_factory):
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(expire_pending_orders)
            time.sleep(0.3)
            locking_session.commit()
            future.result(timeout=5)

    verify_session = session_factory()
    assert verify_session.get(Order, order_id).status == "paid"
    product = verify_session.get(Product, product_id)
    assert product.reserved_quantity == 0
    assert product.sold_quantity == 1
    verify_session.close()
    locking_session.close()
    engine.dispose()
