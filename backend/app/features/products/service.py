from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session, joinedload, selectinload

from app.core.errors import BusinessRuleError, ResourceNotFoundError
from app.core.schemas import Page
from app.features.categories import service as category_service
from app.features.categories.model import Category
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.products.schemas import (
    ProductCreate,
    ProductFilters,
    ProductPatch,
    ProductSort,
    ProductStockAdjustment,
    StockStatus,
)


def create_product(db: Session, command: ProductCreate) -> Product:
    category = None
    if command.category_id is not None:
        category = category_service.get_category(db, command.category_id)

    data = command.model_dump()
    stock_qty = data.get("stock_quantity", 0)
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



def list_products(db: Session, filters: ProductFilters) -> Page[Product]:
    query = _active_products_query(db)

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
        query = query.filter(Product.category_id == filters.category_id)
    if filters.is_active is not None:
        query = query.filter(Product.is_active.is_(filters.is_active))

    available = (
        Product.stock_quantity - Product.reserved_quantity - Product.sold_quantity
    )
    if filters.stock_status == StockStatus.IN_STOCK:
        query = query.filter(available > 0)
    elif filters.stock_status == StockStatus.LOW_STOCK:
        query = query.filter(available > 0, available < 20)
    elif filters.stock_status == StockStatus.OUT_OF_STOCK:
        query = query.filter(available <= 0)

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


def get_product(db: Session, product_id: int) -> Product:
    return _get_active_product(db, product_id)


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
    changes = command.model_dump(exclude_unset=True)

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
    if hasattr(product, "stock_quantity"):
        product.stock_quantity = command.stock_quantity
    if product.variants:
        first_v = product.variants[0]
        first_v.stock_quantity = command.stock_quantity
    db.commit()
    return _get_active_product(db, product_id)


def delete_product(db: Session, product_id: int) -> None:
    product = _get_active_product(db, product_id)
    product.is_deleted = True
    product.deleted_at = datetime.now(timezone.utc)
    db.commit()


def _active_products_query(db: Session) -> Query:
    return (
        db.query(Product)
        .outerjoin(Category, Product.category_id == Category.id)
        .options(
            joinedload(Product.category),
            selectinload(Product.images),
        )
        .filter(

            Product.is_deleted.is_(False),
            or_(
                Product.category_id.is_(None),
                Category.is_deleted.is_(False),
            ),
        )
    )



def _get_active_product(db: Session, product_id: int) -> Product:
    product = (
        _active_products_query(db)
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
    sort_columns = {
        ProductSort.LATEST: (Product.created_at.desc(), Product.id.desc()),
        ProductSort.PRICE_ASC: (Product.price.asc(), Product.id.desc()),
        ProductSort.PRICE_DESC: (Product.price.desc(), Product.id.desc()),
        ProductSort.STOCK_ASC: (Product.stock_quantity.asc(), Product.id.desc()),
        ProductSort.STOCK_DESC: (Product.stock_quantity.desc(), Product.id.desc()),
        ProductSort.SOLD_DESC: (Product.sold_quantity.desc(), Product.id.desc()),
        ProductSort.NAME_ASC: (Product.name.asc(), Product.id.desc()),
    }
    return query.order_by(*sort_columns[sort])
