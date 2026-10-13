from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class ProductVariant(Base):
    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint(
            "product_id", "size", "color_name", name="uq_variants_product_size_color"
        ),
        CheckConstraint(
            "stock_quantity >= 0", name="ck_variants_stock_non_negative"
        ),
        CheckConstraint(
            "reserved_quantity >= 0", name="ck_variants_reserved_non_negative"
        ),
        CheckConstraint(
            "sold_quantity >= 0", name="ck_variants_sold_non_negative"
        ),
        CheckConstraint(
            "reserved_quantity + sold_quantity <= stock_quantity",
            name="ck_variants_reserved_sold_lte_stock",
        ),
        Index("ix_product_variants_product_active", "product_id", "is_active"),
        Index("ix_product_variants_sku", "sku"),
    )

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(
        Integer, ForeignKey("products.id"), nullable=False, index=True
    )
    sku = Column(String(64), unique=True, nullable=False)
    size = Column(String(20), nullable=False, default="ONE_SIZE")
    color_name = Column(String(50), nullable=False, default="Default")
    color_hex = Column(String(7), nullable=True)
    price = Column(Numeric(12, 2), nullable=True)

    stock_quantity = Column(Integer, nullable=False, default=0)
    reserved_quantity = Column(Integer, nullable=False, default=0)
    sold_quantity = Column(Integer, nullable=False, default=0)

    @property
    def available_stock(self) -> int:
        return max(0, (self.stock_quantity or 0) - (self.reserved_quantity or 0) - (self.sold_quantity or 0))

    is_active = Column(Boolean, default=True, index=True)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    product = relationship("Product", back_populates="variants")
    order_items = relationship("OrderItem", back_populates="variant")
