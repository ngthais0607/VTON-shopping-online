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
    UniqueConstraint,
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
    __table_args__ = (Index("ix_products_gender_active", "gender", "is_active"),)

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

    @property
    def total_stock(self) -> int:
        if getattr(self, "variants", None):
            return sum(
                v.stock_quantity for v in self.variants if v.is_active is not False
            )
        return 0

    @property
    def stock_quantity(self) -> int:
        return self.total_stock

    @property
    def reserved_quantity(self) -> int:
        if getattr(self, "variants", None):
            return sum(
                v.reserved_quantity for v in self.variants if v.is_active is not False
            )
        return 0

    @property
    def sold_quantity(self) -> int:
        if getattr(self, "variants", None):
            return sum(
                v.sold_quantity for v in self.variants if v.is_active is not False
            )
        return 0

    @property
    def price_min(self) -> float:
        if getattr(self, "variants", None):
            active_variants = [v for v in self.variants if v.is_active is not False]
            if active_variants:
                return float(
                    min(
                        v.price if v.price is not None else self.price
                        for v in active_variants
                    )
                )
        return float(self.price or 0.0)

    @property
    def price_max(self) -> float:
        if getattr(self, "variants", None):
            active_variants = [v for v in self.variants if v.is_active is not False]
            if active_variants:
                return float(
                    max(
                        v.price if v.price is not None else self.price
                        for v in active_variants
                    )
                )
        return float(self.price or 0.0)

    @property
    def total_available(self) -> int:
        if getattr(self, "variants", None):
            return sum(
                v.available_stock for v in self.variants if v.is_active is not False
            )
        return 0

    @property
    def available_stock(self) -> int:
        return self.total_available

    @property
    def in_stock(self) -> bool:
        return self.available_stock > 0

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

    @property
    def rating_avg(self) -> float | None:
        if getattr(self, "reviews", None):
            revs = self.reviews
            if revs:
                return round(sum(r.rating for r in revs) / len(revs), 1)
        return None

    @property
    def review_count(self) -> int:
        if getattr(self, "reviews", None):
            return len(self.reviews)
        return 0

    variants = relationship(
        "ProductVariant", back_populates="product", cascade="all, delete-orphan"
    )
    images = relationship(
        "ProductImage",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="(ProductImage.is_primary.desc(), ProductImage.sort_order.asc(), ProductImage.id.asc())",
    )
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
    __table_args__ = (
        UniqueConstraint(
            "user_id", "product_id", name="uq_product_reviews_user_product"
        ),
    )

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
