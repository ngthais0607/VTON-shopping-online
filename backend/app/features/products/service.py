from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Query, Session, joinedload, selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.cache import get_cache
from app.core.config import get_settings
from app.core.errors import BusinessRuleError, ConflictError, ResourceNotFoundError
from app.core.schemas import Page
from app.core.slug import generate_unique_slug, slugify
from app.features.categories import service as category_service
from app.features.categories.model import Category
from app.features.products.model import Product
from app.features.products.schemas import (
    FacetColor,
    ProductCreate,
    ProductFacetsResponse,
    ProductFilters,
    ProductPatch,
    ProductSort,
    StockStatus,
    VariantLookupAdminItem,
    VariantLookupPublicItem,
)
from app.features.products.variant_model import ProductVariant


def create_product(db: Session, command: ProductCreate) -> Product:
    category = None
    if command.category_id is not None:
        category = category_service.get_category(db, command.category_id)

    data = command.model_dump()
    variants_input = data.pop("variants", None)

    existing_slugs = set(s[0] for s in db.query(Product.slug).all())
    base_slug = slugify(data.get("slug")) if data.get("slug") else slugify(data["name"])
    data["slug"] = generate_unique_slug(base_slug or "product", existing_slugs)

    requested_active = data.pop("is_active", False)
    data["is_active"] = False

    product = Product(**data)
    if category is not None:
        product.category = category
    product.images = []

    db.add(product)
    db.flush()

    created_variants = []
    if variants_input and len(variants_input) > 0:
        existing_skus = set(s[0] for s in db.query(ProductVariant.sku).all())
        for cand in variants_input:
            sku = (
                cand.get("sku")
                if isinstance(cand, dict)
                else getattr(cand, "sku", None)
            )
            color_name = (
                cand.get("color_name")
                if isinstance(cand, dict)
                else getattr(cand, "color_name", "Default")
            )
            size = (
                cand.get("size")
                if isinstance(cand, dict)
                else getattr(cand, "size", "ONE_SIZE")
            )
            color_hex = (
                cand.get("color_hex")
                if isinstance(cand, dict)
                else getattr(cand, "color_hex", None)
            )
            cand_price = (
                cand.get("price")
                if isinstance(cand, dict)
                else getattr(cand, "price", None)
            )
            cand_stock = (
                cand.get("stock_quantity", 0)
                if isinstance(cand, dict)
                else getattr(cand, "stock_quantity", 0)
            )

            if not sku:
                clean_color = re.sub(r"[^A-Za-z0-9]+", "", color_name).upper() or "DEF"
                clean_size = re.sub(r"[^A-Za-z0-9]+", "", size).upper() or "STD"
                base_sku = f"{product.slug}-{clean_color}-{clean_size}"[:55]
                sku = base_sku
                counter = 2
                while sku in existing_skus:
                    sku = f"{base_sku}-{counter}"
                    counter += 1
            existing_skus.add(sku)
            v = ProductVariant(
                product_id=product.id,
                sku=sku,
                size=size.strip(),
                color_name=color_name.strip(),
                color_hex=color_hex,
                price=cand_price if cand_price is not None else product.price,
                stock_quantity=cand_stock or 0,
                reserved_quantity=0,
                sold_quantity=0,
                is_active=True,
            )
            db.add(v)
            created_variants.append(v)
        db.flush()

    if created_variants and any(v.is_active for v in created_variants):
        product.is_active = requested_active

    product_id = product.id
    db.commit()
    invalidate_catalog_cache()
    return _get_active_product(db, product_id, is_admin=True)


def list_products(
    db: Session, filters: ProductFilters, is_admin: bool = False
) -> Page[Product]:
    query = _active_products_query(db, is_admin=is_admin)

    if filters.search:
        query = query.filter(
            or_(
                Product.name.ilike(f"%{filters.search}%"),
                Product.description.ilike(f"%{filters.search}%"),
            )
        )
    effective_price = _effective_product_price()
    if filters.min_price is not None:
        query = query.filter(effective_price >= filters.min_price)
    if filters.max_price is not None:
        query = query.filter(effective_price <= filters.max_price)
    if filters.category_id is not None:
        category_service.get_category(db, filters.category_id)
        cat_ids = category_service.get_category_and_descendant_ids(
            db, filters.category_id
        )
        query = query.filter(Product.category_id.in_(cat_ids))
    if is_admin and filters.is_active is not None:
        query = query.filter(Product.is_active.is_(filters.is_active))
    if filters.gender:
        query = query.filter(Product.gender.in_(filters.gender))
    if filters.brand:
        query = query.filter(
            or_(*(Product.brand.ilike(f"%{b}%") for b in filters.brand))
        )
    if filters.size:
        query = query.filter(
            Product.variants.any(
                (ProductVariant.size.in_(filters.size))
                & (ProductVariant.is_active.is_(True))
            )
        )
    if filters.color:
        query = query.filter(
            Product.variants.any(
                or_(*(ProductVariant.color_name.ilike(f"%{c}%") for c in filters.color))
                & (ProductVariant.is_active.is_(True))
            )
        )

    settings = get_settings()
    low_stock_threshold = settings.low_stock_threshold
    variant_available = (
        ProductVariant.stock_quantity
        - ProductVariant.reserved_quantity
        - ProductVariant.sold_quantity
    )
    if filters.stock_status == StockStatus.IN_STOCK:
        query = query.filter(
            Product.variants.any(
                (ProductVariant.is_active.is_(True)) & (variant_available > 0)
            )
        )
    elif filters.stock_status == StockStatus.LOW_STOCK:
        query = query.filter(
            Product.variants.any(
                (ProductVariant.is_active.is_(True))
                & (variant_available > 0)
                & (variant_available < low_stock_threshold)
            )
        )
    elif filters.stock_status == StockStatus.OUT_OF_STOCK:
        query = query.filter(
            ~Product.variants.any(
                (ProductVariant.is_active.is_(True)) & (variant_available > 0)
            )
        )

    total = query.count()
    products = (
        _apply_sort(query, filters.sort)
        .offset(filters.offset)
        .limit(filters.limit)
        .all()
    )
    return Page(
        items=products,
        total=total,
        limit=filters.limit,
        offset=filters.offset,
    )


def get_product(db: Session, product_id: int, is_admin: bool = False) -> Product:
    return _get_active_product(db, product_id, is_admin=is_admin)


def get_product_by_slug(db: Session, slug: str, is_admin: bool = False) -> Product:
    query = _active_products_query(db, is_admin=is_admin)
    product = query.filter(Product.slug == slug).first()
    if product is None:
        raise ResourceNotFoundError(
            f"Product with slug '{slug}' was not found",
            code="product_not_found",
        )
    return product


def lookup_variants(
    db: Session,
    ids: list[int] | None = None,
    skus: list[str] | None = None,
    is_admin: bool = False,
    storage: Any | None = None,
) -> list[VariantLookupPublicItem | VariantLookupAdminItem]:
    ids = ids or []
    skus = [s.strip() for s in (skus or []) if s.strip()]
    if len(ids) + len(skus) > 50:
        raise BusinessRuleError(
            "Cannot lookup more than 50 variants at once",
            code="too_many_variant_ids",
        )
    if not ids and not skus:
        return []

    conditions = []
    if ids:
        conditions.append(ProductVariant.id.in_(ids))
    if skus:
        conditions.append(ProductVariant.sku.in_(skus))

    variants = (
        db.query(ProductVariant)
        .options(
            joinedload(ProductVariant.product).joinedload(Product.category),
            joinedload(ProductVariant.product).selectinload(Product.images),
        )
        .filter(or_(*conditions))
        .all()
    )
    found_map_id = {v.id: v for v in variants}
    found_map_sku = {v.sku: v for v in variants}

    settings = get_settings()
    base_url = settings.minio_external_url.rstrip("/")

    ordered_variants: list[ProductVariant] = []
    seen_ids = set()
    for var_id in ids:
        v = found_map_id.get(var_id)
        if v is not None and v.id not in seen_ids:
            seen_ids.add(v.id)
            ordered_variants.append(v)
    for var_sku in skus:
        v = found_map_sku.get(var_sku)
        if v is not None and v.id not in seen_ids:
            seen_ids.add(v.id)
            ordered_variants.append(v)

    items: list[VariantLookupPublicItem | VariantLookupAdminItem] = []
    for v in ordered_variants:
        product = v.product
        cat_deleted = bool(product and product.category and product.category.is_deleted)
        is_active = bool(
            v.is_active
            and product
            and not product.is_deleted
            and product.is_active
            and not cat_deleted
        )

        image_url = None
        if product and product.images:
            matching = next(
                (img for img in product.images if img.color_name == v.color_name), None
            )
            primary = next((img for img in product.images if img.is_primary), None)
            chosen = matching or primary or product.images[0]
            if chosen.object_name.startswith(("http://", "https://")):
                image_url = chosen.object_name
            elif storage is not None:
                image_url = storage.public_url(chosen.object_name)
            else:
                image_url = f"{base_url}/{settings.minio_bucket}/{chosen.object_name}"

        effective_price = float(
            v.price if v.price is not None else (product.price if product else 0.0)
        )
        prod_name = product.name if product else "Unavailable"
        prod_slug = product.slug if product else ""
        prod_id = product.id if product else 0
        avail_stock = v.available_stock if is_active else 0
        has_stock = (avail_stock > 0) if is_active else False

        if is_admin:
            items.append(
                VariantLookupAdminItem(
                    id=v.id,
                    product_id=prod_id,
                    product_name=prod_name,
                    product_slug=prod_slug,
                    sku=v.sku,
                    size=v.size,
                    color_name=v.color_name,
                    color_hex=v.color_hex,
                    price=effective_price,
                    stock_quantity=v.stock_quantity,
                    reserved_quantity=v.reserved_quantity,
                    sold_quantity=v.sold_quantity,
                    available_stock=avail_stock,
                    in_stock=has_stock,
                    is_active=is_active,
                    image_url=image_url,
                )
            )
        else:
            items.append(
                VariantLookupPublicItem(
                    id=v.id,
                    product_id=prod_id,
                    product_name=prod_name,
                    product_slug=prod_slug,
                    sku=v.sku,
                    size=v.size,
                    color_name=v.color_name,
                    color_hex=v.color_hex,
                    price=effective_price,
                    available_stock=avail_stock,
                    in_stock=has_stock,
                    is_active=is_active,
                    image_url=image_url,
                )
            )
    return items


FACETS_CACHE_KEY = "catalog:facets:v1"
FACETS_CACHE_TTL = 60


def invalidate_catalog_cache() -> None:
    get_cache().delete(FACETS_CACHE_KEY)


def get_product_facets(db: Session, use_cache: bool = True) -> ProductFacetsResponse:
    cache = get_cache() if use_cache else None
    if cache is not None:
        cached = cache.get_json(FACETS_CACHE_KEY)
        if cached is not None:
            try:
                return ProductFacetsResponse(**cached)
            except Exception:
                pass

    active_prod_subq = (
        db.query(Product.id)
        .outerjoin(Category, Product.category_id == Category.id)
        .filter(
            Product.is_deleted.is_(False),
            Product.is_active.is_(True),
            or_(
                Product.category_id.is_(None),
                Category.is_deleted.is_(False),
            ),
            Product.variants.any(ProductVariant.is_active.is_(True)),
        )
        .subquery()
    )

    genders_raw = (
        db.query(Product.gender)
        .filter(
            Product.id.in_(select(active_prod_subq.c.id)),
            Product.gender.isnot(None),
        )
        .distinct()
        .order_by(Product.gender.asc())
        .all()
    )
    genders = [r[0] for r in genders_raw if r[0]]

    brands_raw = (
        db.query(Product.brand)
        .filter(
            Product.id.in_(select(active_prod_subq.c.id)),
            Product.brand.isnot(None),
        )
        .distinct()
        .order_by(Product.brand.asc())
        .all()
    )
    brands = [r[0] for r in brands_raw if r[0]]

    sizes_raw = (
        db.query(ProductVariant.size)
        .filter(
            ProductVariant.product_id.in_(select(active_prod_subq.c.id)),
            ProductVariant.is_active.is_(True),
            ProductVariant.size.isnot(None),
        )
        .distinct()
        .order_by(ProductVariant.size.asc())
        .all()
    )
    sizes = [r[0] for r in sizes_raw if r[0]]

    colors_raw = (
        db.query(ProductVariant.color_name, ProductVariant.color_hex)
        .filter(
            ProductVariant.product_id.in_(select(active_prod_subq.c.id)),
            ProductVariant.is_active.is_(True),
            ProductVariant.color_name.isnot(None),
        )
        .distinct()
        .order_by(ProductVariant.color_name.asc())
        .all()
    )
    seen_colors: dict[str, str | None] = {}
    for name, hex_val in colors_raw:
        if name and name not in seen_colors:
            seen_colors[name] = hex_val
    colors = [
        FacetColor(name=name, hex=hex_val)
        for name, hex_val in sorted(seen_colors.items(), key=lambda x: x[0])
    ]

    price_expr = func.coalesce(ProductVariant.price, Product.price)
    price_stats = (
        db.query(
            func.min(price_expr),
            func.max(price_expr),
        )
        .join(Product, ProductVariant.product_id == Product.id)
        .filter(
            Product.id.in_(select(active_prod_subq.c.id)),
            ProductVariant.is_active.is_(True),
        )
        .first()
    )
    price_min = (
        float(price_stats[0]) if price_stats and price_stats[0] is not None else 0.0
    )
    price_max = (
        float(price_stats[1]) if price_stats and price_stats[1] is not None else 0.0
    )

    response = ProductFacetsResponse(
        genders=genders,
        brands=brands,
        sizes=sizes,
        colors=colors,
        price_min=price_min,
        price_max=price_max,
    )

    if cache is not None:
        cache.set_json(FACETS_CACHE_KEY, response.model_dump(), ex=FACETS_CACHE_TTL)

    return response


def update_product(
    db: Session,
    product_id: int,
    command: ProductPatch,
) -> Product:
    # 1. Lock variants first in ascending order to prevent deadlocks with checkout
    variants = (
        db.query(ProductVariant)
        .filter(ProductVariant.product_id == product_id)
        .order_by(ProductVariant.id.asc())
        .populate_existing()
        .with_for_update()
        .all()
    )

    # 2. Lock product next
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.is_deleted.is_(False))
        .populate_existing()
        .with_for_update()
        .first()
    )
    if product is None or (
        product.category_id is not None
        and db.query(Category.is_deleted)
        .filter(Category.id == product.category_id)
        .scalar()
        is not False
    ):
        raise ResourceNotFoundError(
            f"Product {product_id} was not found", code="product_not_found"
        )
    set_committed_value(product, "variants", variants)
    changes = command.model_dump(exclude_unset=True)

    if changes.get("is_active") is True:
        has_active_variant = any(v.is_active for v in variants)
        if not has_active_variant:
            raise ConflictError(
                "Cannot activate product without active variants",
                code="no_active_variants",
            )

    category = product.category
    if "category_id" in changes:
        category_id = changes["category_id"]
        category = (
            category_service.get_category(db, category_id)
            if category_id is not None
            else None
        )

    if "slug" in changes and changes["slug"]:
        existing_slugs = set(
            s[0] for s in db.query(Product.slug).filter(Product.id != product_id).all()
        )
        changes["slug"] = generate_unique_slug(
            slugify(changes["slug"]) or "product", existing_slugs
        )

    for field, value in changes.items():
        setattr(product, field, value)
    if "category_id" in changes:
        product.category = category

    db.commit()
    invalidate_catalog_cache()
    return _get_active_product(db, product_id, is_admin=True)


def delete_product(db: Session, product_id: int) -> None:
    product = _get_active_product(db, product_id, is_admin=True)
    product.is_deleted = True
    product.is_active = False
    product.deleted_at = datetime.now(timezone.utc)
    db.commit()
    invalidate_catalog_cache()


def _active_products_query(db: Session, is_admin: bool = False) -> Query:
    query = (
        db.query(Product)
        .outerjoin(Category, Product.category_id == Category.id)
        .options(
            joinedload(Product.category),
            selectinload(Product.images),
            selectinload(Product.variants),
            selectinload(Product.reviews),
        )
        .filter(
            Product.is_deleted.is_(False),
            or_(
                Product.category_id.is_(None),
                Category.is_deleted.is_(False),
            ),
        )
    )
    if not is_admin:
        query = query.filter(
            Product.is_active.is_(True),
            Product.variants.any(ProductVariant.is_active.is_(True)),
        )
    return query


def _get_active_product(
    db: Session, product_id: int, is_admin: bool = False
) -> Product:
    product = (
        _active_products_query(db, is_admin=is_admin)
        .filter(Product.id == product_id)
        .populate_existing()
        .first()
    )
    if product is None:
        raise ResourceNotFoundError(
            f"Product {product_id} was not found",
            code="product_not_found",
        )
    return product


def _effective_product_price():
    variant_min_price = (
        select(func.min(func.coalesce(ProductVariant.price, Product.price)))
        .where(
            ProductVariant.product_id == Product.id,
            ProductVariant.is_active.is_(True),
        )
        .scalar_subquery()
    )
    return func.coalesce(variant_min_price, Product.price)


def _apply_sort(query: Query, sort: ProductSort) -> Query:
    effective_price = _effective_product_price()
    stock_sum = func.coalesce(
        select(func.sum(ProductVariant.stock_quantity))
        .where(
            ProductVariant.product_id == Product.id, ProductVariant.is_active.is_(True)
        )
        .scalar_subquery(),
        0,
    )
    sold_sum = func.coalesce(
        select(func.sum(ProductVariant.sold_quantity))
        .where(
            ProductVariant.product_id == Product.id, ProductVariant.is_active.is_(True)
        )
        .scalar_subquery(),
        0,
    )

    sort_columns = {
        ProductSort.LATEST: (Product.created_at.desc(), Product.id.desc()),
        ProductSort.PRICE_ASC: (effective_price.asc(), Product.id.asc()),
        ProductSort.PRICE_DESC: (effective_price.desc(), Product.id.desc()),
        ProductSort.STOCK_ASC: (stock_sum.asc(), Product.id.desc()),
        ProductSort.STOCK_DESC: (stock_sum.desc(), Product.id.desc()),
        ProductSort.SOLD_DESC: (sold_sum.desc(), Product.id.desc()),
        ProductSort.NAME_ASC: (Product.name.asc(), Product.id.desc()),
    }
    return query.order_by(*sort_columns[sort])
