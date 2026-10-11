"""Read-only aggregates and projections for the admin dashboard."""

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.features.categories.model import Category
from app.features.dashboard.schemas import (
    DashboardMetrics,
    LowStockProductSummary,
    RecentOrderSummary,
)
from app.features.orders.constants import OrderStatus
from app.features.orders.model import Order, Payment
from app.features.products.model import Product
from app.features.products.schemas import CategorySummary


def _available_stock():
    return Product.stock_quantity - Product.reserved_quantity - Product.sold_quantity


def get_metrics(db: Session) -> DashboardMetrics:
    available = _available_stock()
    total_products, active_products, low_stock = db.execute(
        select(
            func.count(Product.id),
            func.coalesce(func.sum(case((Product.is_active.is_(True), 1), else_=0)), 0),
            func.coalesce(
                func.sum(case(((available >= 0) & (available < 20), 1), else_=0)),
                0,
            ),
        ).where(Product.is_deleted.is_(False))
    ).one()
    pending_orders, revenue = db.execute(
        select(
            func.coalesce(
                func.sum(case((Order.status == OrderStatus.PENDING.value, 1), else_=0)),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (Order.status == OrderStatus.PAID.value, Order.total_amount),
                        else_=0,
                    )
                ),
                0,
            ),
        )
    ).one()
    return DashboardMetrics(
        total_products=total_products,
        active_products=active_products,
        low_stock=low_stock,
        pending_orders=pending_orders,
        revenue=revenue,
    )


def get_recent_orders(db: Session, limit: int) -> list[RecentOrderSummary]:
    latest_payment_status = (
        select(Payment.status)
        .where(Payment.order_id == Order.id)
        .order_by(Payment.id.desc())
        .limit(1)
        .correlate(Order)
        .scalar_subquery()
    )
    rows = db.execute(
        select(
            Order.id,
            Order.product_name,
            Order.quantity,
            Order.total_amount,
            Order.currency,
            Order.status,
            Order.created_at,
            latest_payment_status.label("payment_status"),
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(limit)
    ).all()
    summaries = []
    for row in rows:
        if row.payment_status is not None:
            payment_status = row.payment_status
        elif row.status == OrderStatus.PAID.value:
            payment_status = "paid"
        elif row.status == OrderStatus.EXPIRED.value:
            payment_status = "failed"
        else:
            payment_status = "pending"
        summaries.append(
            RecentOrderSummary(
                id=row.id,
                product_name=row.product_name,
                quantity=row.quantity,
                total=row.total_amount,
                currency=row.currency,
                status=row.status,
                payment_status=payment_status,
                created_at=row.created_at,
            )
        )
    return summaries


def get_low_stock_products(db: Session, limit: int) -> list[LowStockProductSummary]:
    available = _available_stock()
    rows = db.execute(
        select(
            Product.id,
            Product.name,
            Product.stock_quantity,
            Product.reserved_quantity,
            Product.sold_quantity,
            available.label("available_stock"),
            Category.id.label("category_id"),
            Category.name.label("category_name"),
        )
        .outerjoin(Category, Product.category_id == Category.id)
        .where(
            Product.is_deleted.is_(False),
            available >= 0,
            available < 20,
        )
        .order_by(available.asc(), Product.id.asc())
        .limit(limit)
    ).all()
    return [
        LowStockProductSummary(
            id=row.id,
            name=row.name,
            stock_quantity=row.stock_quantity,
            reserved_quantity=row.reserved_quantity,
            sold_quantity=row.sold_quantity,
            available_stock=row.available_stock,
            category=(
                CategorySummary(id=row.category_id, name=row.category_name)
                if row.category_id is not None
                else None
            ),
        )
        for row in rows
    ]
