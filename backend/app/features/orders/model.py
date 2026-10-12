from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    public_code = Column(
        String(36),
        unique=True,
        index=True,
        nullable=False,
        default=lambda: uuid4().hex,
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    def __init__(self, **kwargs):
        if "public_code" not in kwargs or not kwargs["public_code"]:
            kwargs["public_code"] = uuid4().hex
        super().__init__(**kwargs)

    # Legacy fields kept for backward compatibility and quick summary
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True, index=True)
    product_name = Column(String(255), nullable=True)
    unit_price = Column(Numeric(12, 2), nullable=True)
    quantity = Column(Integer, nullable=True)
    total_amount = Column(Numeric(12, 2), nullable=False)

    currency = Column(String(10), nullable=False, default="VND")
    status = Column(String(50), nullable=False, default="pending", index=True)
    customer_name = Column(String(255), nullable=False)
    customer_phone = Column(String(50), nullable=False)
    shipping_address = Column(String(1000), nullable=False)
    notes = Column(String(2000), nullable=True)
    payment_method = Column(String(20), nullable=False)

    expires_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    product = relationship("Product", back_populates="orders")
    items = relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan"
    )
    payments = relationship(
        "Payment", back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    product_name = Column(String(255), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    quantity = Column(Integer, nullable=False)
    subtotal = Column(Numeric(12, 2), nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_transaction_id",
            name="uq_payments_provider_trans_id",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)

    provider = Column(String(50), nullable=False, default="paddle")
    provider_transaction_id = Column(String(100), nullable=True)

    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(10), nullable=False, default="VND")
    status = Column(String(50), nullable=False, default="pending", index=True)

    checkout_url = Column(String(500), nullable=True)

    paid_at = Column(DateTime, nullable=True)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    order = relationship("Order", back_populates="payments")
