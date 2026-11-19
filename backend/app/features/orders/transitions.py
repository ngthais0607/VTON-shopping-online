import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.features.orders.constants import OrderStatus
from app.features.orders.domain import (
    apply_order_transition,
)
from app.features.orders.model import Order, OrderItem, Payment
from app.features.products.variant_model import ProductVariant

logger = logging.getLogger(__name__)


def _lock_transition_variants(
    db: Session, variant_ids: set[int]
) -> dict[int, ProductVariant]:
    locked: dict[int, ProductVariant] = {}
    for vid in sorted(variant_ids):
        locked[vid] = (
            db.query(ProductVariant)
            .filter(ProductVariant.id == vid)
            .populate_existing()
            .with_for_update()
            .one()
        )
    return locked


def _resolve_and_lock_order_inventory(
    db: Session, order_ids: list[int] | set[int]
) -> dict[int, ProductVariant]:
    items = db.query(OrderItem).filter(OrderItem.order_id.in_(order_ids)).all()
    variant_ids: set[int] = set()

    for item in items:
        if item.variant_id is None:
            raise RuntimeError(f"Order item {item.id} has no variant_id")
        variant_ids.add(item.variant_id)

    return _lock_transition_variants(db, variant_ids)


def _record_paid(
    db: Session,
    order: Order,
    provider: str,
    transaction_id: str | None,
    now: datetime,
) -> None:
    """Transition and record a receipt in the caller's locked transaction."""
    apply_order_transition(order, OrderStatus.PAID, now)
    if not any(payment.status == "paid" for payment in order.payments):
        db.add(
            Payment(
                order=order,
                provider=provider,
                provider_transaction_id=transaction_id,
                amount=order.total_amount,
                currency=order.currency,
                status="paid",
                paid_at=order.paid_at,
            )
        )
