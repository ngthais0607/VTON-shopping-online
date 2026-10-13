import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.core.slug import slugify
from app.features.products.variant_model import ProductVariant  # noqa: F401


def _generate_default_product_slug(context):
    params = context.get_current_parameters() if context else {}
    name = params.get("name") if params else None
    if name:
        base = slugify(name)
        if base:
            return f"{base}-{uuid.uuid4().hex[:8]}"
    return f"product-{uuid.uuid4().hex[:8]}"


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_gender_active", "gender", "is_active"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    slug = Column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
        default=_generate_default_product_slug,
    )
    price = Column(Numeric(12, 2), nullable=False, index=True)
    description = Column(String(1000), nullable=True)

    brand = Column(String(100), nullable=True)
    gender = Column(String(20), nullable=False, default="unisex")
    material = Column(String(255), nullable=True)
    fit = Column(String(50), nullable=True)
    care_instructions = Column(String(500), nullable=True)
    size_chart = Column(JSON, nullable=True)

    category_id = Column(
        Integer, ForeignKey("categories.id"), nullable=True, index=True
    )
    category = relationship("Category", back_populates="products")

    currency = Column(String(10), nullable=False, default="VND")
    is_active = Column(Boolean, default=True, index=True)

    def __init__(self, **kwargs):
        stock = kwargs.pop("stock_quantity", None)
        reserved = kwargs.pop("reserved_quantity", None)
        sold = kwargs.pop("sold_quantity", None)
        super().__init__(**kwargs)
        if stock is not None or reserved is not None or sold is not None:
            if not getattr(self, "variants", None):
                base_slug = getattr(self, "slug", None) or f"p-{uuid.uuid4().hex[:6]}"
                self.variants = [
                    ProductVariant(
                        sku=f"{base_slug}-DEF".upper()[:64],
                        size="ONE_SIZE",
                        color_name="Default",
                        stock_quantity=stock or 0,
                        reserved_quantity=reserved or 0,
                        sold_quantity=sold or 0,
                        is_active=True,
                    )
                ]

    @property
    def stock_quantity(self) -> int:
        if getattr(self, "variants", None):
            return sum(v.stock_quantity for v in self.variants if v.is_active)
        return getattr(self, "_stock_quantity", 0) or 0

    @stock_quantity.setter
    def stock_quantity(self, value: int):
        if getattr(self, "variants", None) and len(self.variants) > 0:
            self.variants[0].stock_quantity = value
        else:
            self._stock_quantity = value

    @property
    def reserved_quantity(self) -> int:
        if getattr(self, "variants", None):
            return sum(v.reserved_quantity for v in self.variants if v.is_active)
        return getattr(self, "_reserved_quantity", 0) or 0

    @reserved_quantity.setter
    def reserved_quantity(self, value: int):
        if getattr(self, "variants", None) and len(self.variants) > 0:
            self.variants[0].reserved_quantity = value
        else:
            self._reserved_quantity = value

    @property
    def sold_quantity(self) -> int:
        if getattr(self, "variants", None):
            return sum(v.sold_quantity for v in self.variants if v.is_active)
        return getattr(self, "_sold_quantity", 0) or 0

    @sold_quantity.setter
    def sold_quantity(self, value: int):
        if getattr(self, "variants", None) and len(self.variants) > 0:
            self.variants[0].sold_quantity = value
        else:
            self._sold_quantity = value

    @property
    def price_min(self) -> float:
        if getattr(self, "variants", None):
            active_variants = [v for v in self.variants if v.is_active]
            if active_variants:
                return float(min(v.price if v.price is not None else self.price for v in active_variants))
        return float(self.price or 0.0)

    @property
    def price_max(self) -> float:
        if getattr(self, "variants", None):
            active_variants = [v for v in self.variants if v.is_active]
            if active_variants:
                return float(max(v.price if v.price is not None else self.price for v in active_variants))
        return float(self.price or 0.0)

    @property
    def available_sizes(self) -> list[str]:
        if getattr(self, "variants", None):
            sizes = []
            for v in self.variants:
                if v.is_active and v.size not in sizes:
                    sizes.append(v.size)
            return sizes
        return []

    @property
    def available_colors(self) -> list[dict[str, str | None]]:
        if getattr(self, "variants", None):
            colors = []
            seen = set()
            for v in self.variants:
                if v.is_active and v.color_name not in seen:
                    seen.add(v.color_name)
                    colors.append({"name": v.color_name, "hex": v.color_hex})
            return colors
        return []

    variants = relationship(
        "ProductVariant", back_populates="product", cascade="all, delete-orphan"
    )
    images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="product")
    order_items = relationship("OrderItem", back_populates="product")
    reviews = relationship(
        "ProductReview", back_populates="product", cascade="all, delete-orphan"
    )

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)


class ProductImage(Base):
    __tablename__ = "product_images"

    id = Column(String(100), primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    object_name = Column(String(255), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    is_primary = Column(Boolean, default=False, nullable=False)
    color_name = Column(String(50), nullable=True)
    kind = Column(String(30), default="model_photo", nullable=False)

    product = relationship("Product", back_populates="images")


class ProductReview(Base):
    __tablename__ = "product_reviews"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    rating = Column(Integer, nullable=False, default=5)
    title = Column(String(255), nullable=True)
    comment = Column(String(1000), nullable=True)
    fit_feedback = Column(String(20), nullable=True)
    is_verified_purchase = Column(Boolean, default=False, index=True)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )

    product = relationship("Product", back_populates="reviews")
    user = relationship("User")
