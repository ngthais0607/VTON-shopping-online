
from datetime import datetime, timezone

from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.model import Order
from app.features.orders.service import transition_order
from app.core.database import SessionLocal


def expire_pending_orders():
    db = SessionLocal()

    try:
        orders = db.query(Order).filter(
            Order.status == "pending",
            Order.payment_method == "vietqr",
            Order.expires_at <= datetime.now(timezone.utc)
        ).with_for_update().all()

        for order in orders:
            transition_order(order, OrderStatus.EXPIRED)

        db.commit()

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()
