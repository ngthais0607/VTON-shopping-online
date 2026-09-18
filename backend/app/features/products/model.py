from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    price = Column(Float, nullable=False, index=True)
    description = Column(String(1000), nullable=True)

    stock_quantity = Column(Integer, nullable=False, default=0)
    reserved_quantity = Column(Integer, nullable=False, default=0)
    sold_quantity = Column(Integer, nullable=False, default=0)

    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, index=True)
    category = relationship("Category", back_populates="products")

    currency = Column(String(10), nullable=False, default="USD")
    paddle_product_id = Column(String(100), nullable=True)
    paddle_price_id = Column(String(100), nullable=True) 
    is_active = Column(Boolean, default=True, index=True)

    images = relationship("ProductImage", back_populates="product")
    orders = relationship("Order", back_populates="product")
    reviews = relationship("ProductReview", back_populates="product", cascade="all, delete-orphan")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)

class ProductImage(Base):
    __tablename__ = "product_images"

    id = Column(String(100), primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    object_name = Column(String(255), nullable=False)

    product = relationship("Product", back_populates="images")

class ProductReview(Base):
    __tablename__ = "product_reviews"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    rating = Column(Integer, nullable=False, default=5)
    title = Column(String(255), nullable=True)
    comment = Column(String(1000), nullable=True)
    is_verified_purchase = Column(Boolean, default=False, index=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    product = relationship("Product", back_populates="reviews")
    user = relationship("User")