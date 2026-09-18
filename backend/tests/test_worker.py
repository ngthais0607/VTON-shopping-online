import pytest
import unittest.mock
from app.features.orders.model import Order
from app.features.users.model import User
from app.features.products.model import Product
from app.worker import (
    send_order_confirmation_email_task,
    send_payment_received_email_task,
    send_welcome_email_task,
    cron_expire_pending_orders
)

@pytest.mark.anyio
async def test_send_order_confirmation_email_task(db_session):
    # Setup test product, user, and order in test DB
    product = Product(name="Test Watch", price=100.0, stock_quantity=10)
    db_session.add(product)
    db_session.commit()

    user = User(
        username="worker_user1",
        email="worker1@example.com",
        password_hash="hashedpassword123",
        role="customer",
        first_name="Worker",
        last_name="User"
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
        status="pending"
    )
    db_session.add(order)
    db_session.commit()

    with unittest.mock.patch("app.worker.SessionLocal", return_value=db_session), \
         unittest.mock.patch("app.worker.send_email", new_callable=unittest.mock.AsyncMock) as mock_send:
        await send_order_confirmation_email_task({}, order.id)
        mock_send.assert_called_once()
        _, kwargs = mock_send.call_args
        assert "Xác nhận đơn hàng" in kwargs["subject"]
        assert kwargs["recipient"] == "worker1@example.com"


@pytest.mark.anyio
async def test_send_payment_received_email_task(db_session):
    product = Product(name="Paid Watch", price=250.0, stock_quantity=10)
    db_session.add(product)
    db_session.commit()

    user = User(
        username="worker_user2",
        email="worker2@example.com",
        password_hash="hashedpassword123",
        role="customer",
        first_name="Paid",
        last_name="User"
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
        status="paid"
    )
    db_session.add(order)
    db_session.commit()

    with unittest.mock.patch("app.worker.SessionLocal", return_value=db_session), \
         unittest.mock.patch("app.worker.send_email", new_callable=unittest.mock.AsyncMock) as mock_send:
        await send_payment_received_email_task({}, order.id)
        mock_send.assert_called_once()
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
        last_name="User"
    )
    db_session.add(user)
    db_session.commit()

    with unittest.mock.patch("app.worker.SessionLocal", return_value=db_session), \
         unittest.mock.patch("app.worker.send_email", new_callable=unittest.mock.AsyncMock) as mock_send:
        await send_welcome_email_task({}, user.id)
        mock_send.assert_called_once()
        _, kwargs = mock_send.call_args
        assert "Chào mừng" in kwargs["subject"]
        assert kwargs["recipient"] == "worker3@example.com"


@pytest.mark.anyio
async def test_cron_expire_pending_orders():
    with unittest.mock.patch("app.worker.expire_pending_orders") as mock_expire:
        await cron_expire_pending_orders({})
        mock_expire.assert_called_once()
