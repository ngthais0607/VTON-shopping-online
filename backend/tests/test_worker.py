import asyncio
import unittest.mock
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.features.orders.model import Order, OrderItem
from app.features.products.model import Product
from app.features.users.model import User
from app.worker import (
    cron_expire_pending_orders,
    send_order_confirmation_email_task,
    send_payment_received_email_task,
    send_welcome_email_task,
)
from tests.factories import make_product


@pytest.mark.anyio
async def test_worker_closes_and_rolls_back_session_when_job_fails(monkeypatch):
    from unittest.mock import AsyncMock, Mock

    session = Mock()
    job = AsyncMock(side_effect=RuntimeError("delivery failed"))
    monkeypatch.setattr("app.worker.SessionLocal", lambda: session)
    monkeypatch.setattr("app.worker.send_welcome_email", job, raising=False)

    with pytest.raises(RuntimeError, match="delivery failed"):
        await send_welcome_email_task({}, 7)

    job.assert_awaited_once()
    session.rollback.assert_called_once()
    session.close.assert_called_once()


@pytest.mark.anyio
async def test_send_order_confirmation_email_task(db_session):
    # Setup test product, user, and order in test DB
    product = make_product(
        db_session, name="Test Watch", price=100.0, stock_quantity=10
    )
    db_session.commit()

    user = User(
        username="worker_user1",
        email="worker1@example.com",
        password_hash="hashedpassword123",
        role="customer",
        first_name="Worker",
        last_name="User",
    )
    db_session.add(user)
    db_session.commit()

    order = Order(
        user_id=user.id,
        product_id=product.id,
        product_name=product.name,
        unit_price=100.0,
        quantity=1,
        total_amount=100.0,
        currency="USD",
        status="pending",
        customer_name="Worker User",
        customer_phone="0123456789",
        shipping_address="123 Worker Street",
        payment_method="vietqr",
    )
    db_session.add(order)
    db_session.commit()

    mock_send = AsyncMock()
    with (
        unittest.mock.patch("app.worker.SessionLocal", return_value=db_session),
        unittest.mock.patch(
            "app.worker.SmtpEmailSender", return_value=SimpleNamespace(send=mock_send)
        ),
    ):
        await send_order_confirmation_email_task({}, order.id)
        mock_send.assert_awaited_once()
        _, kwargs = mock_send.call_args
        assert "Xác nhận đơn hàng" in kwargs["subject"]
        assert kwargs["recipient"] == "worker1@example.com"


@pytest.mark.anyio
async def test_send_payment_received_email_task(db_session):
    product = make_product(
        db_session, name="Paid Watch", price=250.0, stock_quantity=10
    )
    db_session.commit()

    user = User(
        username="worker_user2",
        email="worker2@example.com",
        password_hash="hashedpassword123",
        role="customer",
        first_name="Paid",
        last_name="User",
    )
    db_session.add(user)
    db_session.commit()

    order = Order(
        user_id=user.id,
        product_id=product.id,
        product_name=product.name,
        unit_price=250.0,
        quantity=2,
        total_amount=500.0,
        currency="USD",
        status="paid",
        customer_name="Paid User",
        customer_phone="0123456789",
        shipping_address="123 Paid Street",
        payment_method="vietqr",
    )
    db_session.add(order)
    db_session.commit()

    mock_send = AsyncMock()
    with (
        unittest.mock.patch("app.worker.SessionLocal", return_value=db_session),
        unittest.mock.patch(
            "app.worker.SmtpEmailSender", return_value=SimpleNamespace(send=mock_send)
        ),
    ):
        await send_payment_received_email_task({}, order.id)
        mock_send.assert_awaited_once()
        _, kwargs = mock_send.call_args
        assert "Xác nhận thanh toán" in kwargs["subject"]
        assert kwargs["recipient"] == "worker2@example.com"


@pytest.mark.anyio
async def test_send_welcome_email_task(db_session):
    user = User(
        username="worker_user3",
        email="worker3@example.com",
        password_hash="hashedpassword123",
        role="customer",
        first_name="Welcome",
        last_name="User",
    )
    db_session.add(user)
    db_session.commit()

    mock_send = AsyncMock()
    with (
        unittest.mock.patch("app.worker.SessionLocal", return_value=db_session),
        unittest.mock.patch(
            "app.worker.SmtpEmailSender", return_value=SimpleNamespace(send=mock_send)
        ),
    ):
        await send_welcome_email_task({}, user.id)
        mock_send.assert_awaited_once()
        _, kwargs = mock_send.call_args
        assert "Chào mừng" in kwargs["subject"]
        assert kwargs["recipient"] == "worker3@example.com"


@pytest.mark.anyio
async def test_cron_expire_pending_orders():
    with (
        unittest.mock.patch("app.worker.SessionLocal"),
        unittest.mock.patch("app.worker.expire_pending_orders") as mock_expire,
    ):
        await cron_expire_pending_orders({})
        mock_expire.assert_called_once()


def test_expiration_only_changes_expired_vietqr_pending_orders(db_session):
    product = make_product(
        db_session,
        name="Expiration product",
        price=100,
        stock_quantity=10,
        reserved_quantity=2,
    )
    db_session.commit()
    expired_vietqr = Order(
        product_id=None,
        product_name=None,
        unit_price=None,
        quantity=None,
        total_amount=100,
        currency="USD",
        status="pending",
        payment_method="vietqr",
        customer_name="VietQR",
        customer_phone="1",
        shipping_address="Address",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    confirmed_cod = Order(
        product_id=None,
        product_name=None,
        unit_price=None,
        quantity=None,
        total_amount=100,
        currency="USD",
        status="confirmed",
        payment_method="cod",
        customer_name="COD",
        customer_phone="2",
        shipping_address="Address",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    db_session.add_all([expired_vietqr, confirmed_cod])
    db_session.flush()

    variant = product.variants[0]
    item1 = OrderItem(
        order_id=expired_vietqr.id,
        product_id=product.id,
        product_name=product.name,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        quantity=1,
        unit_price=100,
        subtotal=100,
    )
    item2 = OrderItem(
        order_id=confirmed_cod.id,
        product_id=product.id,
        product_name=product.name,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        quantity=1,
        unit_price=100,
        subtotal=100,
    )
    db_session.add_all([item1, item2])
    db_session.commit()
    expired_vietqr_id = expired_vietqr.id
    confirmed_cod_id = confirmed_cod.id
    product_id = product.id

    with unittest.mock.patch("app.worker.SessionLocal", return_value=db_session):
        asyncio.run(cron_expire_pending_orders({}))

    assert db_session.get(Order, expired_vietqr_id).status == "expired"
    assert db_session.get(Order, confirmed_cod_id).status == "confirmed"
    assert db_session.get(Product, product_id).reserved_quantity == 1
