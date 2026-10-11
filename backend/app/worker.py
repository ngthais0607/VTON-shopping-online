"""ARQ task entry points with one database session per invocation."""

import logging

from arq.cron import cron

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.integrations.email import SmtpEmailSender
from app.integrations.queue import parse_redis_settings
from app.jobs.emails import (
    send_order_confirmation_email,
    send_payment_received_email,
    send_welcome_email,
)
from app.jobs.orders import expire_pending_orders

logger = logging.getLogger(__name__)


async def send_order_confirmation_email_task(ctx: dict, order_id: int) -> None:
    db = SessionLocal()
    try:
        await send_order_confirmation_email(db, order_id, SmtpEmailSender())
    except Exception:
        db.rollback()
        logger.exception("Order confirmation task failed order_id=%s", order_id)
        raise
    finally:
        db.close()


async def send_payment_received_email_task(ctx: dict, order_id: int) -> None:
    db = SessionLocal()
    try:
        await send_payment_received_email(db, order_id, SmtpEmailSender())
    except Exception:
        db.rollback()
        logger.exception("Payment notification task failed order_id=%s", order_id)
        raise
    finally:
        db.close()


async def send_welcome_email_task(ctx: dict, user_id: int) -> None:
    db = SessionLocal()
    try:
        await send_welcome_email(db, user_id, SmtpEmailSender())
    except Exception:
        db.rollback()
        logger.exception("Welcome notification task failed user_id=%s", user_id)
        raise
    finally:
        db.close()


async def cron_expire_pending_orders(ctx: dict) -> None:
    db = SessionLocal()
    try:
        expired_count = expire_pending_orders(db)
        logger.info("Expired pending orders count=%s", expired_count)
    except Exception:
        db.rollback()
        logger.exception("Pending order expiration task failed")
        raise
    finally:
        db.close()


def get_redis_settings():
    url = get_settings().redis_url
    return parse_redis_settings(
        "redis://localhost:6379/0" if url == "memory://" else url
    )


class WorkerSettings:
    functions = [
        send_order_confirmation_email_task,
        send_payment_received_email_task,
        send_welcome_email_task,
    ]
    cron_jobs = [cron(cron_expire_pending_orders, minute={*range(0, 60)})]
    redis_settings = get_redis_settings()
    max_tries = 3
    job_timeout = 60
