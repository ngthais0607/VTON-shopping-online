"""Scheduled order job delegation."""

import logging
import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.features.orders.model import Order
from app.features.orders.schemas import VietQRWebhookPayload
from app.features.orders.service import (
    demo_auto_pay_delay,
    generate_order_payment_memo,
    process_vietqr_webhook,
    to_vnd_amount,
)
from app.features.orders.service import expire_pending_orders as expire_orders

logger = logging.getLogger(__name__)


def expire_pending_orders(db: Session) -> int:
    return expire_orders(db)


def demo_auto_pay_order(db: Session, order_id: int) -> bool:
    """Demo only: pretend the bank confirmed the transfer for a pending order.

    Goes through the real webhook logic, so amount checks, duplicate detection
    and inventory locking still apply.
    """
    if demo_auto_pay_delay() is None:
        return False
    order = db.get(Order, order_id)
    if order is None or order.status != "pending":
        return False
    settings = get_settings()
    payload = VietQRWebhookPayload(
        transaction_id=f"DEMO-{uuid.uuid4().hex[:12]}",
        amount=Decimal(to_vnd_amount(order.total_amount)),
        content=generate_order_payment_memo(order.id),
        account_number=settings.vietqr_account_no,
    )
    result = process_vietqr_webhook(db, payload, settings.vietqr_webhook_secret)
    logger.info("Demo auto-pay order_id=%s status=%s", order_id, result.status)
    return result.status == "success"
