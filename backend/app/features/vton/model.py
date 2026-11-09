from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class VtonTask(Base):
    """One virtual try-on request. Images live in private object storage."""

    __tablename__ = "vton_tasks"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "idempotency_key", name="uq_vton_tasks_user_idempotency"
        ),
        Index("ix_vton_tasks_user_created", "user_id", "created_at"),
        Index("ix_vton_tasks_status_created", "status", "created_at"),
    )

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=True)

    cloth_type = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False, default="queued")
    engine = Column(String(20), nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    error_code = Column(String(50), nullable=True)
    idempotency_key = Column(String(64), nullable=True)

    person_object = Column(String(255), nullable=True)
    garment_object = Column(String(255), nullable=False)
    result_object = Column(String(255), nullable=True)

    consent_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    purged_at = Column(DateTime, nullable=True)
