"""Scheduled order job delegation."""

from sqlalchemy.orm import Session

from app.features.orders.service import expire_pending_orders as expire_orders


def expire_pending_orders(db: Session) -> int:
    return expire_orders(db)
