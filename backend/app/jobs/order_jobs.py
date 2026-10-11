from app.core.database import SessionLocal
from app.features.orders.service import expire_pending_orders as expire_orders


def expire_pending_orders():
    db = SessionLocal()
    try:
        return expire_orders(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
