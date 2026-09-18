
from datetime import datetime, timezone

from app.features.orders.model import Order, Payment
from app.core.database import SessionLocal


def expire_pending_orders():
    db = SessionLocal()

    try:
        orders = db.query(Order).filter(
            Order.status == "pending",
            Order.expires_at <= datetime.now(timezone.utc)
        ).all()

        for order in orders:
            product = order.product
            if product:
                product.reserved_quantity = max(
                    0,
                    product.reserved_quantity - order.quantity
                )

            order.status = "expired"

            for payment in order.payments:
                if payment.status == "pending":
                    payment.status = "expired"

        db.commit()

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()
