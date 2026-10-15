from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import BackgroundTasks

from app.core.errors import BusinessRuleError
from app.features.orders import service
from app.features.orders.model import Order
from tests.test_order_service_locking import _two_pending_orders


def test_customer_cannot_cancel_paid_order(db_session):
    _, order_id, _ = _two_pending_orders(db_session)
    order = db_session.get(Order, order_id)
    order.user_id = 7
    order.status = "paid"
    db_session.flush()
    with pytest.raises(BusinessRuleError) as exc:
        service.cancel_customer_order(
            db_session, order_id, SimpleNamespace(id=7, role="customer"), AsyncMock()
        )
    assert exc.value.code == "order_not_cancellable"


def test_customer_cancel_rechecks_status_after_inventory_lock(db_session, monkeypatch):
    variant, order_id, _ = _two_pending_orders(db_session)
    order = db_session.get(Order, order_id)
    order.user_id = 7
    db_session.flush()
    real_lock = service._resolve_and_lock_order_inventory

    def paid_before_lock(db, ids):
        # Model a webhook winning after the initial owner/status read.
        db.connection().exec_driver_sql(
            "UPDATE orders SET status='paid' WHERE id=?", (order_id,)
        )
        db.connection().exec_driver_sql(
            "UPDATE product_variants SET reserved_quantity=1, sold_quantity=1 WHERE id=?",
            (variant.id,),
        )
        return real_lock(db, ids)

    monkeypatch.setattr(service, "_resolve_and_lock_order_inventory", paid_before_lock)
    with pytest.raises(BusinessRuleError) as exc:
        service.cancel_customer_order(
            db_session,
            order_id,
            SimpleNamespace(id=7, role="customer"),
            AsyncMock(),
            BackgroundTasks(),
        )
    assert exc.value.code == "order_not_cancellable"
    db_session.refresh(order)
    assert order.status == "paid"
    assert (variant.reserved_quantity, variant.sold_quantity) == (1, 1)
