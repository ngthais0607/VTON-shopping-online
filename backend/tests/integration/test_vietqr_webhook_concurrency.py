import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from threading import Barrier
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.features.orders.constants import OrderStatus
from app.features.orders.model import Order, OrderItem, Payment
from app.features.orders.schemas import VietQRWebhookPayload
from app.features.orders.service import (
    change_order_status,
    process_vietqr_webhook,
)
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User

pytestmark = pytest.mark.integration


def _session_factory():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for integration concurrency tests")
    engine = create_engine(database_url, pool_pre_ping=True)
    return engine, sessionmaker(bind=engine, expire_on_commit=False)


def _setup_test_order(
    session_factory, total_amount=100.0, status="pending", reserved=1
):
    session = session_factory()
    suffix = uuid4().hex[:8]
    user = User(
        username=f"buyer-{suffix}",
        email=f"buyer-{suffix}@example.com",
        password_hash="unused",
        role="customer",
    )
    product = Product(
        name=f"Product {suffix}",
        slug=f"product-{suffix}",
        price=Decimal(str(total_amount)),
        currency="VND",
        is_active=True,
    )
    session.add_all([user, product])
    session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"SKU-{suffix}",
        size="M",
        color_name="Black",
        stock_quantity=10,
        reserved_quantity=reserved,
        sold_quantity=0,
        is_active=True,
    )
    session.add(variant)
    session.flush()

    order = Order(
        user_id=user.id,
        total_amount=Decimal(str(total_amount)),
        currency="VND",
        status=status,
        customer_name="Concurrent Buyer",
        customer_phone="0912345678",
        shipping_address="123 Street",
        payment_method="vietqr",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
    )
    session.add(order)
    session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=product.id,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        product_name=product.name,
        quantity=reserved,
        unit_price=Decimal(str(total_amount)),
        subtotal=Decimal(str(total_amount)),
    )
    session.add(item)
    session.commit()
    order_id = order.id
    variant_id = variant.id
    product_id = product.id
    session.close()
    return order_id, variant_id, product_id


def test_concurrent_webhooks_same_transaction_id():
    engine, session_factory = _session_factory()
    order_id, variant_id, _ = _setup_test_order(
        session_factory, total_amount=100000.0, reserved=2
    )
    settings = get_settings()
    secret = settings.vietqr_webhook_secret or "test-secret"
    settings.vietqr_webhook_secret = secret

    txn_id = f"TXN_SAME_{uuid4().hex[:8]}"
    payload = VietQRWebhookPayload(
        transaction_id=txn_id,
        amount=100000.0,
        content=f"TRUELOOK_{order_id}",
    )
    barrier = Barrier(2)

    def run_webhook():
        session = session_factory()
        try:
            barrier.wait(timeout=10)
            res = process_vietqr_webhook(session, payload, secret)
            return res.status
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(run_webhook)
        f2 = executor.submit(run_webhook)
        statuses = [f1.result(timeout=15), f2.result(timeout=15)]

    assert "success" in statuses
    assert "already_processed" in statuses

    verify = session_factory()
    order = verify.get(Order, order_id)
    variant = verify.get(ProductVariant, variant_id)
    payments = verify.query(Payment).filter(Payment.order_id == order_id).all()

    assert order.status == "paid"
    assert variant.reserved_quantity == 0
    assert variant.sold_quantity == 2
    assert len(payments) == 1
    assert payments[0].status == "paid"
    verify.close()


def test_concurrent_webhooks_different_transaction_ids():
    engine, session_factory = _session_factory()
    order_id, variant_id, _ = _setup_test_order(
        session_factory, total_amount=100000.0, reserved=2
    )
    settings = get_settings()
    secret = settings.vietqr_webhook_secret or "test-secret"
    settings.vietqr_webhook_secret = secret

    payload1 = VietQRWebhookPayload(
        transaction_id=f"TXN_DIFF_A_{uuid4().hex[:8]}",
        amount=100000.0,
        content=f"TRUELOOK_{order_id}",
    )
    payload2 = VietQRWebhookPayload(
        transaction_id=f"TXN_DIFF_B_{uuid4().hex[:8]}",
        amount=100000.0,
        content=f"TRUELOOK_{order_id}",
    )
    barrier = Barrier(2)

    def run_webhook(payload):
        session = session_factory()
        try:
            barrier.wait(timeout=10)
            res = process_vietqr_webhook(session, payload, secret)
            return res.status
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(run_webhook, payload1)
        f2 = executor.submit(run_webhook, payload2)
        statuses = [f1.result(timeout=15), f2.result(timeout=15)]

    assert "success" in statuses
    assert "duplicate_payment" in statuses or "already_processed" in statuses

    verify = session_factory()
    order = verify.get(Order, order_id)
    variant = verify.get(ProductVariant, variant_id)
    payments = verify.query(Payment).filter(Payment.order_id == order_id).all()

    assert order.status == "paid"
    assert variant.reserved_quantity == 0
    assert variant.sold_quantity == 2
    assert len(payments) == 2
    payment_statuses = {p.status for p in payments}
    assert "paid" in payment_statuses
    assert "duplicate_payment" in payment_statuses
    verify.close()


def test_webhook_racing_with_admin_paid():
    engine, session_factory = _session_factory()
    order_id, variant_id, _ = _setup_test_order(
        session_factory, total_amount=100000.0, reserved=1
    )
    settings = get_settings()
    secret = settings.vietqr_webhook_secret or "test-secret"
    settings.vietqr_webhook_secret = secret

    payload = VietQRWebhookPayload(
        transaction_id=f"TXN_ADMIN_RACE_{uuid4().hex[:8]}",
        amount=100000.0,
        content=f"TRUELOOK_{order_id}",
    )
    barrier = Barrier(2)

    def run_webhook():
        session = session_factory()
        try:
            barrier.wait(timeout=10)
            res = process_vietqr_webhook(session, payload, secret)
            return res.status
        finally:
            session.close()

    def run_admin():
        session = session_factory()
        try:
            barrier.wait(timeout=10)
            order = change_order_status(
                session,
                order_id,
                OrderStatus.PAID,
                AsyncMock(),
                background_tasks=BackgroundTasks(),
            )
            return order.status
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(run_webhook)
        f2 = executor.submit(run_admin)
        f1.result(timeout=15)
        f2.result(timeout=15)

    verify = session_factory()
    order = verify.get(Order, order_id)
    variant = verify.get(ProductVariant, variant_id)
    payments = verify.query(Payment).filter(Payment.order_id == order_id).all()

    assert order.status == "paid"
    assert variant.reserved_quantity == 0
    assert variant.sold_quantity == 1
    assert len(payments) == 1
    verify.close()
