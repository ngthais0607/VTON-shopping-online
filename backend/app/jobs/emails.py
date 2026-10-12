"""Notification use cases invoked by ARQ entry points."""

import logging

from sqlalchemy.orm import Session

from app.features.orders.model import Order
from app.features.users.model import User
from app.integrations.email import EmailSender

logger = logging.getLogger(__name__)


def _order_recipient(db: Session, order_id: int) -> tuple[Order, User] | None:
    order = db.get(Order, order_id)
    if order is None:
        logger.warning("Notification order missing order_id=%s", order_id)
        return None
    user = db.get(User, order.user_id) if order.user_id is not None else None
    if user is None or not user.email:
        logger.warning(
            "Notification user or email missing order_id=%s user_id=%s",
            order_id,
            order.user_id,
        )
        return None
    return order, user


async def send_order_confirmation_email(
    db: Session, order_id: int, sender: EmailSender
) -> None:
    found = _order_recipient(db, order_id)
    if found is None:
        return
    order, user = found
    product_name = (
        ", ".join(f"{it.product_name} x{it.quantity}" for it in order.items)
        if getattr(order, "items", None)
        else order.product_name
    )
    quantity = (
        sum(it.quantity for it in order.items)
        if getattr(order, "items", None)
        else order.quantity
    )
    await sender.send(
        subject=f"Xác nhận đơn hàng #{order.id} - TrueLook",
        recipient=user.email,
        template_name="order_confirmation.html",
        context={
            "order_id": order.id,
            "user_name": user.full_name or "Khách hàng",
            "product_name": product_name,
            "quantity": quantity,
            "total_amount": order.total_amount,
            "currency": order.currency,
            "status": order.status,
            "expires_at": order.expires_at.strftime("%Y-%m-%d %H:%M:%S")
            if order.expires_at
            else "N/A",
        },
    )


async def send_payment_received_email(
    db: Session, order_id: int, sender: EmailSender
) -> None:
    found = _order_recipient(db, order_id)
    if found is None:
        return
    order, user = found
    await sender.send(
        subject=f"Xác nhận thanh toán đơn hàng #{order.id} - TrueLook",
        recipient=user.email,
        template_name="payment_received.html",
        context={
            "order_id": order.id,
            "user_name": user.full_name or "Khách hàng",
            "amount": order.total_amount,
            "currency": order.currency,
        },
    )


async def send_welcome_email(db: Session, user_id: int, sender: EmailSender) -> None:
    user = db.get(User, user_id)
    if user is None or not user.email:
        logger.warning("Welcome email user or email missing user_id=%s", user_id)
        return
    await sender.send(
        subject="Chào mừng bạn đến với TrueLook!",
        recipient=user.email,
        template_name="welcome.html",
        context={"user_name": user.full_name or user.email},
    )
