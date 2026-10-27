"""Test factories for creating Products and ProductVariants cleanly."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.slug import generate_unique_slug, slugify
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant


def make_product(
    db: Session,
    *,
    name: str = "Test Product",
    price: float = 100.0,
    currency: str = "VND",
    is_active: bool = True,
    stock_quantity: int = 10,
    reserved_quantity: int = 0,
    sold_quantity: int = 0,
    auto_create_variant: bool = True,
    **kwargs,
) -> Product:
    existing_slugs = set(s[0] for s in db.query(Product.slug).all())
    slug = kwargs.pop("slug", None)
    if not slug:
        base = slugify(name) or f"prod-{uuid.uuid4().hex[:6]}"
        slug = generate_unique_slug(base, existing_slugs)

    product = Product(
        name=name,
        slug=slug,
        price=price,
        currency=currency,
        is_active=is_active,
        **kwargs,
    )
    db.add(product)
    db.flush()

    if auto_create_variant:
        make_variant(
            db,
            product_id=product.id,
            sku=f"P{product.id}-DEFAULT",
            size="ONE_SIZE",
            color_name="Default",
            price=price,
            stock_quantity=stock_quantity,
            reserved_quantity=reserved_quantity,
            sold_quantity=sold_quantity,
            is_active=is_active,
        )
        db.refresh(product)

    return product


def make_variant(
    db: Session,
    *,
    product_id: int,
    sku: str | None = None,
    size: str = "ONE_SIZE",
    color_name: str = "Default",
    color_hex: str | None = None,
    price: float | None = None,
    stock_quantity: int = 10,
    reserved_quantity: int = 0,
    sold_quantity: int = 0,
    is_active: bool = True,
    **kwargs,
) -> ProductVariant:
    if not sku:
        sku = f"VAR-{uuid.uuid4().hex[:8].upper()}"

    variant = ProductVariant(
        product_id=product_id,
        sku=sku,
        size=size,
        color_name=color_name,
        color_hex=color_hex,
        price=price,
        stock_quantity=stock_quantity,
        reserved_quantity=reserved_quantity,
        sold_quantity=sold_quantity,
        is_active=is_active,
        **kwargs,
    )
    db.add(variant)
    db.flush()
    return variant
