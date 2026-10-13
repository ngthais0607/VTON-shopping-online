from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

import uuid

from app.core.database import Base
from app.core.slug import slugify


def _generate_default_category_slug(context):
    params = context.get_current_parameters() if context else {}
    name = params.get("name") if params else None
    if name:
        base = slugify(name)
        if base:
            return f"{base}-{uuid.uuid4().hex[:8]}"
    return f"category-{uuid.uuid4().hex[:8]}"


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    slug = Column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
        default=_generate_default_category_slug,
    )
    parent_id = Column(
        Integer, ForeignKey("categories.id"), nullable=True, index=True
    )
    description = Column(String(1000), nullable=True)

    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")
    products = relationship("Product", back_populates="category")

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    deleted_by = Column(Integer, ForeignKey("users.id"), nullable=True)

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
