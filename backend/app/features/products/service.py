from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Query, Session, joinedload, selectinload
from sqlalchemy.orm.attributes import set_committed_value

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
    ProductStockAdjustment,
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
    stock_qty = data.pop("stock_quantity", 0)

    existing_slugs = set(s[0] for s in db.query(Product.slug).all())
    base_slug = slugify(data.get("slug")) if data.get("slug") else slugify(data["name"])
    data["slug"] = generate_unique_slug(base_slug or "product", existing_slugs)

    product = Product(**data)
    if category is not None:
        product.category = category
    product.images = []

    db.add(product)
    db.flush()

    default_variant = ProductVariant(
        product_id=product.id,
        sku=f"P{product.id}-DEFAULT",
        size="ONE_SIZE",
        color_name="Default",
        stock_quantity=stock_qty,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db.add(default_variant)

    product_id = product.id
    db.commit()
    return _get_active_product(db, product_id)


def list_products(db: Session, filters: ProductFilters, is_admin: bool = False) -> Page[Product]:
    query = _active_products_query(db, is_admin=is_admin)

    if filters.search:
        query = query.filter(
            or_(
                Product.name.ilike(f"%{filters.search}%"),
                Product.description.ilike(f"%{filters.search}%"),
            )
        )
    if filters.min_price is not None:
        query = query.filter(Product.price >= filters.min_price)
    if filters.max_price is not None:
        query = query.filter(Product.price <= filters.max_price)
    if filters.category_id is not None:
        category_service.get_category(db, filters.category_id)
        cat_ids = category_service.get_category_and_descendant_ids(db, filters.category_id)
        query = query.filter(Product.category_id.in_(cat_ids))
    if is_admin and filters.is_active is not None:
        query = query.filter(Product.is_active.is_(filters.is_active))
    if filters.gender:
        query = query.filter(Product.gender == filters.gender)
    if filters.brand:
        query = query.filter(Product.brand.ilike(f"%{filters.brand}%"))
    if filters.size:
        query = query.filter(
            Product.variants.any(
                (ProductVariant.size == filters.size) & (ProductVariant.is_active.is_(True))
            )
        )
    if filters.color:
        query = query.filter(
            Product.variants.any(
                (ProductVariant.color_name.ilike(filters.color)) & (ProductVariant.is_active.is_(True))
            )
        )

    variant_available = (
        ProductVariant.stock_quantity - ProductVariant.reserved_quantity - ProductVariant.sold_quantity
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
                (ProductVariant.is_active.is_(True)) & (variant_available > 0) & (variant_available < 20)
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
    db: Session, ids: list[int], is_admin: bool = False
) -> list[VariantLookupPublicItem | VariantLookupAdminItem]:
    if len(ids) > 50:
        raise BusinessRuleError(
            "Cannot lookup more than 50 variants at once",
            code="too_many_variant_ids",
        )
    if not ids:
        return []

    variants = (
        db.query(ProductVariant)
        .options(
            joinedload(ProductVariant.product).joinedload(Product.category),
            joinedload(ProductVariant.product).selectinload(Product.images),
        )
        .filter(
            ProductVariant.id.in_(ids),
        )
        .all()
    )
    found_map = {v.id: v for v in variants}

    settings = get_settings()
    base_url = settings.minio_external_url.rstrip("/")

    items: list[VariantLookupPublicItem | VariantLookupAdminItem] = []
    for var_id in ids:
        v = found_map.get(var_id)
        if v is None:
            continue

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
            matching = next((img for img in product.images if img.color_name == v.color_name), None)
            primary = next((img for img in product.images if img.is_primary), None)
            chosen = matching or primary or product.images[0]
            if chosen.object_name.startswith(("http://", "https://")):
                image_url = chosen.object_name
            else:
                image_url = f"{base_url}/{settings.minio_bucket}/{chosen.object_name}"

        effective_price = float(v.price if v.price is not None else (product.price if product else 0.0))
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


def get_product_facets(db: Session) -> ProductFacetsResponse:
    products = (
        _active_products_query(db, is_admin=False)
        .all()
    )

    genders_set = set()
    brands_set = set()
    sizes_set = set()
    colors_map: dict[str, str | None] = {}
    all_prices: list[float] = []

    for p in products:
        if p.gender:
            genders_set.add(p.gender)
        if p.brand:
            brands_set.add(p.brand)
        all_prices.append(float(p.price))

        for v in p.variants:
            if v.is_active:
                sizes_set.add(v.size)
                if v.color_name not in colors_map:
                    colors_map[v.color_name] = v.color_hex
                if v.price is not None:
                    all_prices.append(float(v.price))

    colors = [
        FacetColor(name=name, hex=hex_val)
        for name, hex_val in sorted(colors_map.items(), key=lambda x: x[0])
    ]

    return ProductFacetsResponse(
        genders=sorted(list(genders_set)),
        brands=sorted(list(brands_set)),
        sizes=sorted(list(sizes_set)),
        colors=colors,
        price_min=min(all_prices) if all_prices else 0.0,
        price_max=max(all_prices) if all_prices else 0.0,
    )


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

    stock_quantity = changes.get("stock_quantity")
    if stock_quantity is not None:
        if (
            (product.reserved_quantity or 0) + (product.sold_quantity or 0)
            > stock_quantity
        ):
            raise BusinessRuleError(
                "Reserved and sold quantities cannot exceed total stock",
                code="invalid_product_inventory",
            )
        if product.variants:
            first_v = product.variants[0]
            first_v.stock_quantity = stock_quantity

    if "slug" in changes and changes["slug"]:
        existing_slugs = set(
            s[0]
            for s in db.query(Product.slug)
            .filter(Product.id != product_id)
            .all()
        )
        changes["slug"] = generate_unique_slug(
            slugify(changes["slug"]) or "product", existing_slugs
        )

    for field, value in changes.items():
        setattr(product, field, value)
    if "category_id" in changes:
        product.category = category

    db.commit()
    return _get_active_product(db, product_id)


def adjust_product_stock(
    db: Session, product_id: int, command: ProductStockAdjustment
) -> Product:
    product = _get_active_product(db, product_id)
    if (product.reserved_quantity or 0) + (product.sold_quantity or 0) > command.stock_quantity:
        raise BusinessRuleError(
            "Reserved and sold quantities cannot exceed total stock",
            code="invalid_product_inventory",
        )
    if product.variants:
        first_v = product.variants[0]
        first_v.stock_quantity = command.stock_quantity
    product.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _get_active_product(db, product_id)


def delete_product(db: Session, product_id: int) -> None:
    product = _get_active_product(db, product_id)
    product.is_deleted = True
    product.is_active = False
    product.deleted_at = datetime.now(timezone.utc)
    db.commit()


def _active_products_query(db: Session, is_admin: bool = False) -> Query:
    query = (
        db.query(Product)
        .outerjoin(Category, Product.category_id == Category.id)
        .options(
            joinedload(Product.category),
            selectinload(Product.images),
            selectinload(Product.variants),
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


def _get_active_product(db: Session, product_id: int, is_admin: bool = False) -> Product:
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


def _apply_sort(query: Query, sort: ProductSort) -> Query:
    stock_sum = func.coalesce(
        select(func.sum(ProductVariant.stock_quantity))
        .where(ProductVariant.product_id == Product.id, ProductVariant.is_active.is_(True))
        .scalar_subquery(),
        0,
    )
    sold_sum = func.coalesce(
        select(func.sum(ProductVariant.sold_quantity))
        .where(ProductVariant.product_id == Product.id, ProductVariant.is_active.is_(True))
        .scalar_subquery(),
        0,
    )

    sort_columns = {
        ProductSort.LATEST: (Product.created_at.desc(), Product.id.desc()),
        ProductSort.PRICE_ASC: (Product.price.asc(), Product.id.desc()),
        ProductSort.PRICE_DESC: (Product.price.desc(), Product.id.desc()),
        ProductSort.STOCK_ASC: (stock_sum.asc(), Product.id.desc()),
        ProductSort.STOCK_DESC: (stock_sum.desc(), Product.id.desc()),
        ProductSort.SOLD_DESC: (sold_sum.desc(), Product.id.desc()),
        ProductSort.NAME_ASC: (Product.name.asc(), Product.id.desc()),
    }
    return query.order_by(*sort_columns[sort])
