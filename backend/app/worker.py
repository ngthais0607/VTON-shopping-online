import os
import logging
from arq.connections import RedisSettings
from arq.cron import cron
from app.core.database import SessionLocal
from app.core.email import send_email
from app.features.orders.model import Order
from app.features.users.model import User
from app.jobs.order_jobs import expire_pending_orders

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


async def send_order_confirmation_email_task(ctx, order_id: int):
    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            logger.warning(f"Order #{order_id} not found for confirmation email.")
            return

        user = db.query(User).filter(User.id == order.user_id).first()
        recipient = user.email if user else "customer@example.com"
        user_name = user.full_name if (user and user.full_name) else "Khách hàng"

        context = {
            "order_id": order.id,
            "user_name": user_name,
            "product_name": order.product_name,
            "quantity": order.quantity,
            "total_amount": order.total_amount,
            "currency": order.currency,
            "status": order.status,
            "expires_at": order.expires_at.strftime("%Y-%m-%d %H:%M:%S") if order.expires_at else "N/A"
        }

        await send_email(
            subject=f"Xác nhận đơn hàng #{order.id} - LuxeStore",
            recipient=recipient,
            template_name="order_confirmation.html",
            context=context
        )
    finally:
        db.close()


async def send_payment_received_email_task(ctx, order_id: int):
    db = SessionLocal()
    try:
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            logger.warning(f"Order #{order_id} not found for payment email.")
            return

        user = db.query(User).filter(User.id == order.user_id).first()
        recipient = user.email if user else "customer@example.com"
        user_name = user.full_name if (user and user.full_name) else "Khách hàng"

        context = {
            "order_id": order.id,
            "user_name": user_name,
            "amount": order.total_amount,
            "currency": order.currency
        }

        await send_email(
            subject=f"Xác nhận thanh toán đơn hàng #{order.id} - LuxeStore",
            recipient=recipient,
            template_name="payment_received.html",
            context=context
        )
    finally:
        db.close()


async def send_welcome_email_task(ctx, user_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.warning(f"User #{user_id} not found for welcome email.")
            return

        context = {
            "user_name": user.full_name or user.email
        }

        await send_email(
            subject="Chào mừng bạn đến với LuxeStore!",
            recipient=user.email,
            template_name="welcome.html",
            context=context
        )
    finally:
        db.close()


async def cron_expire_pending_orders(ctx):
    logger.info("Running scheduled cron task: expire_pending_orders")
    try:
        expire_pending_orders()
    except Exception as e:
        logger.error(f"Error in cron_expire_pending_orders: {str(e)}")


def get_redis_settings():
    clean_url = REDIS_URL.replace("redis://", "")
    if "/" in clean_url:
        host_port, database = clean_url.split("/", 1)
        db = int(database) if database else 0
    else:
        host_port = clean_url
        db = 0

    if ":" in host_port:
        host, port = host_port.split(":", 1)
        port = int(port)
    else:
        host = host_port
        port = 6379

    return RedisSettings(host=host, port=port, database=db)


class WorkerSettings:
    functions = [
        send_order_confirmation_email_task,
        send_payment_received_email_task,
        send_welcome_email_task
    ]
    cron_jobs = [
        cron(cron_expire_pending_orders, minute={*range(0, 60)})
    ]
    redis_settings = get_redis_settings()
    max_tries = 3
    job_timeout = 60
