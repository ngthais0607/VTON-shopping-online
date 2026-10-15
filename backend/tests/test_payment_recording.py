from unittest.mock import AsyncMock

import pytest
from fastapi import BackgroundTasks

from app.features.orders.constants import OrderStatus
from app.features.orders.model import Payment
from app.features.orders.schemas import VietQRWebhookPayload
from app.features.orders.service import change_order_status, process_vietqr_webhook
from tests.test_vietqr_webhook import SECRET, setup_test_order


@pytest.mark.parametrize(
    "path,method,initial,provider",
    [
        ("webhook", "vietqr", "pending", "vietqr"),
        ("admin", "vietqr", "pending", "manual"),
        ("admin", "cod", "confirmed", "cod"),
        ("admin", "cod", "shipped", "cod"),
        ("admin", "cod", "delivered", "cod"),
    ],
)
def test_paid_at_always_has_a_paid_payment(db_session, path, method, initial, provider):
    order, product = setup_test_order(db_session)
    order.payment_method, order.status = method, initial
    db_session.commit()
    if path == "webhook":
        process_vietqr_webhook(
            db_session,
            VietQRWebhookPayload(
                transaction_id="real-payment", amount=100, content=f"TL{order.id}"
            ),
            SECRET,
        )
    else:
        change_order_status(
            db_session, order.id, OrderStatus.PAID, AsyncMock(), BackgroundTasks()
        )
    db_session.refresh(order)
    assert order.paid_at is not None
    payments = (
        db_session.query(Payment).filter_by(order_id=order.id, status="paid").all()
    )
    assert len(payments) == 1
    assert payments[0].provider == provider
    assert payments[0].provider_transaction_id == (
        "real-payment" if path == "webhook" else None
    )
    assert payments[0].amount == order.total_amount
    assert (
        product.variants[0].reserved_quantity,
        product.variants[0].sold_quantity,
    ) == (0, 1)


@pytest.mark.parametrize(
    "progress",
    [[], [OrderStatus.SHIPPED], [OrderStatus.SHIPPED, OrderStatus.DELIVERED]],
)
def test_real_webhook_after_manual_payment_is_recorded_as_duplicate(
    db_session, progress
):
    order, product = setup_test_order(db_session)
    change_order_status(
        db_session, order.id, OrderStatus.PAID, AsyncMock(), BackgroundTasks()
    )
    for status in progress:
        change_order_status(
            db_session, order.id, status, AsyncMock(), BackgroundTasks()
        )
    before = order.status, order.paid_at
    response = process_vietqr_webhook(
        db_session,
        VietQRWebhookPayload(
            transaction_id="late-real-bank-transfer",
            amount=100,
            content=f"TL{order.id}",
        ),
        SECRET,
    )
    assert response.status == "duplicate_payment"
    db_session.refresh(order)
    assert (order.status, order.paid_at) == before
    assert sorted(
        p.status for p in db_session.query(Payment).filter_by(order_id=order.id)
    ) == ["duplicate_payment", "paid"]
    assert (
        product.variants[0].reserved_quantity,
        product.variants[0].sold_quantity,
    ) == (0, 1)
