"""Run only against a dedicated, migrated MariaDB TEST_DATABASE_URL."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks
from sqlalchemy import text

from app.core.config import get_settings
from app.core.errors import BusinessRuleError
from app.features.orders.model import Order, OrderItem, Payment
from app.features.orders.schemas import VietQRWebhookPayload
from app.features.orders.service import cancel_customer_order, process_vietqr_webhook
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User
from tests.integration.test_vietqr_webhook_concurrency import (
    _session_factory,
    _setup_test_order,
)

pytestmark = pytest.mark.integration


def test_customer_cancel_races_payment_thirty_times():
    engine, sessions = _session_factory()
    try:
        if engine.dialect.name not in {"mysql", "mariadb"}:
            pytest.skip("MariaDB is required")
        with engine.connect() as connection:
            if "MariaDB" not in connection.scalar(text("SELECT VERSION()")):
                pytest.skip("MariaDB is required")
        for _ in range(30):
            order_id, variant_id, product_id = _setup_test_order(sessions)
            with sessions() as db:
                user_id = db.get(Order, order_id).user_id
            barrier = Barrier(2)
            payload = VietQRWebhookPayload(
                transaction_id=uuid4().hex, amount=100, content=f"TL{order_id}"
            )
            secret = get_settings().vietqr_webhook_secret

            def pay():
                with sessions() as db:
                    barrier.wait(timeout=10)
                    return process_vietqr_webhook(db, payload, secret).status

            def cancel():
                with sessions() as db:
                    user = db.get(User, user_id)
                    barrier.wait(timeout=10)
                    try:
                        return cancel_customer_order(
                            db, order_id, user, AsyncMock(), BackgroundTasks()
                        ).status.value
                    except BusinessRuleError as exc:
                        db.rollback()
                        assert exc.code == "order_not_cancellable"
                        return "rejected"

            try:
                with ThreadPoolExecutor(max_workers=2) as pool:
                    paid = pool.submit(pay)
                    cancelled = pool.submit(cancel)
                    results = paid.result(timeout=30), cancelled.result(timeout=30)
                with sessions() as db:
                    order = db.get(Order, order_id)
                    variant = db.get(ProductVariant, variant_id)
                    payments = db.query(Payment).filter_by(order_id=order_id).all()
                    if order.status == "paid":
                        assert results == ("success", "rejected")
                        assert [p.status for p in payments] == ["paid"]
                        assert (variant.reserved_quantity, variant.sold_quantity) == (
                            0,
                            1,
                        )
                    else:
                        assert order.status == "cancelled"
                        assert results == ("late_payment", "cancelled")
                        assert [p.status for p in payments] == ["late_payment"]
                        assert (variant.reserved_quantity, variant.sold_quantity) == (
                            0,
                            0,
                        )
            finally:
                with sessions() as db:
                    db.query(Payment).filter_by(order_id=order_id).delete()
                    db.query(OrderItem).filter_by(order_id=order_id).delete()
                    db.query(Order).filter_by(id=order_id).delete()
                    db.query(ProductVariant).filter_by(id=variant_id).delete()
                    db.query(Product).filter_by(id=product_id).delete()
                    db.query(User).filter_by(id=user_id).delete()
                    db.commit()
    finally:
        engine.dispose()
