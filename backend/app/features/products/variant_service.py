from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    ResourceNotFoundError,
)
from app.features.products.model import Product
from app.features.products.service import invalidate_catalog_cache
from app.features.products.variant_model import (
    InventoryAdjustment,
    ProductVariant,
)
from app.features.products.variant_schemas import (
    BulkVariantCreate,
    VariantItem,
    VariantPatch,
    VariantStockAdjustment,
)


def bulk_create_variants(
    db: Session,
    product_id: int,
    command: BulkVariantCreate,
) -> list[ProductVariant]:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.is_deleted.is_(False))
        .first()
    )
    if product is None:
        raise ResourceNotFoundError(
            f"Product {product_id} was not found",
            code="product_not_found",
        )

    existing = (
        db.query(ProductVariant).filter(ProductVariant.product_id == product_id).all()
    )
    existing_pairs = {
        (v.size.strip().lower(), v.color_name.strip().lower()): v for v in existing
    }
    existing_skus = set(s[0] for s in db.query(ProductVariant.sku).all())

    candidates: list[VariantItem] = list(command.variants)
    if command.sizes and command.colors:
        for s in command.sizes:
            for c in command.colors:
                candidates.append(
                    VariantItem(
                        size=s,
                        color_name=c.name,
                        color_hex=c.hex,
                        price=command.default_price,
                        stock_quantity=command.default_stock,
                    )
                )

    for cand in candidates:
        pair_key = (cand.size.strip().lower(), cand.color_name.strip().lower())
        if pair_key in existing_pairs:
            continue  # Idempotent skip

        if cand.sku:
            sku = cand.sku
            if sku in existing_skus:
                raise ConflictError(
                    f"Variant with SKU '{sku}' already exists",
                    code="duplicate_sku",
                )
        else:
            clean_color = re.sub(r"[^A-Za-z0-9]+", "", cand.color_name).upper() or "DEF"
            clean_size = re.sub(r"[^A-Za-z0-9]+", "", cand.size).upper() or "STD"
            base_sku = f"{product.slug}-{clean_color}-{clean_size}"[:55]
            sku = base_sku
            counter = 2
            while sku in existing_skus:
                sku = f"{base_sku}-{counter}"
                counter += 1

        existing_skus.add(sku)
        new_variant = ProductVariant(
            product_id=product.id,
            sku=sku,
            size=cand.size.strip(),
            color_name=cand.color_name.strip(),
            color_hex=cand.color_hex,
            price=cand.price if cand.price is not None else command.default_price,
            stock_quantity=(
                cand.stock_quantity
                if cand.stock_quantity is not None
                else command.default_stock
            ),
            reserved_quantity=0,
            sold_quantity=0,
            is_active=True,
        )
        db.add(new_variant)
        existing_pairs[pair_key] = new_variant

    try:
        db.commit()
        invalidate_catalog_cache()
    except IntegrityError as e:
        db.rollback()
        raise ConflictError(
            "Variant with specified SKU or options already exists",
            code="duplicate_sku",
        ) from e

    return (
        db.query(ProductVariant)
        .filter(ProductVariant.product_id == product_id)
        .order_by(ProductVariant.id.asc())
        .all()
    )


def update_variant(
    db: Session,
    variant_id: int,
    command: VariantPatch,
) -> ProductVariant:
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if variant is None:
        raise ResourceNotFoundError(
            f"Variant {variant_id} was not found",
            code="variant_not_found",
        )

    patch_data = command.model_dump(exclude_unset=True)
    if "sku" in patch_data and patch_data["sku"] and patch_data["sku"] != variant.sku:
        existing_with_sku = (
            db.query(ProductVariant)
            .filter(ProductVariant.sku == patch_data["sku"])
            .first()
        )
        if existing_with_sku is not None:
            raise ConflictError(
                f"Variant with SKU '{patch_data['sku']}' already exists",
                code="duplicate_sku",
            )

    for field, value in patch_data.items():
        setattr(variant, field, value)
    variant.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
        invalidate_catalog_cache()
    except IntegrityError as e:
        db.rollback()
        raise ConflictError(
            "Variant with specified SKU already exists",
            code="duplicate_sku",
        ) from e

    db.refresh(variant)
    return variant


def adjust_variant_stock(
    db: Session,
    variant_id: int,
    command: VariantStockAdjustment,
    user_id: int | None = None,
) -> ProductVariant:
    variant = (
        db.query(ProductVariant)
        .filter(ProductVariant.id == variant_id)
        .with_for_update()
        .first()
    )
    if variant is None:
        raise ResourceNotFoundError(
            f"Variant {variant_id} was not found",
            code="variant_not_found",
        )

    old_stock = variant.stock_quantity or 0
    if command.stock_quantity is not None:
        new_stock = command.stock_quantity
        delta = new_stock - old_stock
    elif command.delta is not None:
        new_stock = old_stock + command.delta
        delta = command.delta
    else:
        raise BusinessRuleError(
            "Either stock_quantity or delta must be provided",
            code="invalid_variant_inventory",
        )

    committed_stock = (variant.reserved_quantity or 0) + (variant.sold_quantity or 0)
    if new_stock < committed_stock:
        raise BusinessRuleError(
            "Stock cannot be set lower than reserved and sold quantities",
            code="invalid_variant_inventory",
        )

    adjustment = InventoryAdjustment(
        variant_id=variant.id,
        old_stock=old_stock,
        new_stock=new_stock,
        delta=delta,
        reason=command.reason,
        user_id=user_id,
    )
    db.add(adjustment)

    variant.stock_quantity = new_stock
    variant.updated_at = datetime.now(timezone.utc)
    db.commit()
    invalidate_catalog_cache()
    db.refresh(variant)
    return variant


def get_variant_adjustments(
    db: Session,
    variant_id: int,
) -> list[InventoryAdjustment]:
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if variant is None:
        raise ResourceNotFoundError(
            f"Variant {variant_id} was not found",
            code="variant_not_found",
        )

    return (
        db.query(InventoryAdjustment)
        .filter(InventoryAdjustment.variant_id == variant_id)
        .order_by(
            InventoryAdjustment.created_at.desc(),
            InventoryAdjustment.id.desc(),
        )
        .all()
    )


def delete_variant(db: Session, variant_id: int) -> None:
    variant = (
        db.query(ProductVariant)
        .options(selectinload(ProductVariant.order_items))
        .filter(ProductVariant.id == variant_id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if variant is None:
        raise ResourceNotFoundError(
            f"Variant {variant_id} was not found",
            code="variant_not_found",
        )

    if variant.order_items and len(variant.order_items) > 0:
        variant.is_active = False
        variant.updated_at = datetime.now(timezone.utc)
        db.commit()
        invalidate_catalog_cache()
    else:
        db.delete(variant)
        db.commit()
        invalidate_catalog_cache()
