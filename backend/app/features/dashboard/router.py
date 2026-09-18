from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.features.products.model import Product
from app.features.orders.model import Order
from app.core.database import get_db
from app.features.products.router import product_to_json
from app.features.orders.router import order_to_json, expire_order_if_needed
from app.core.security import get_current_admin
from app.features.users.model import User

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"]
)

@router.get("/metrics")
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    available_stock = (Product.stock_quantity - Product.reserved_quantity - Product.sold_quantity)

    total_products = db.query(Product).filter(Product.is_deleted == False).count()

    active_products = db.query(Product).filter(
        Product.is_deleted == False,
        Product.is_active == True
    ).count()

    low_stock = db.query(Product).filter(
        Product.is_deleted == False,
        available_stock < 20
    ).count()

    pending_orders = db.query(Order).filter(Order.status == "pending").count()
    
    revenue = db.query(
        func.coalesce(func.sum(Order.total_amount),0)
    ).filter(
        Order.status == "paid"
    ).scalar()

    return {
        "total_products": total_products,
        "active_products": active_products,
        "low_stock": low_stock,
        "pending_orders": pending_orders,
        "revenue": revenue 
    }

@router.get("/recent-orders")
def get_recent_orders(
    db: Session = Depends(get_db),
    limit: int = Query(default=5, ge=1, le=20),
    current_admin: User = Depends(get_current_admin)
):
    orders = db.query(Order).order_by(Order.created_at.desc()).limit(limit).all()
    return [order_to_json(order) for order in orders]

@router.get("/low-stock-products")
def get_low_stock_products(
    db: Session = Depends(get_db),
    limit: int = Query(default=5, ge=1, le=20),
    current_admin: User = Depends(get_current_admin)
):
    available_stock = (Product.stock_quantity - Product.reserved_quantity - Product.sold_quantity)
    products = db.query(Product).filter(
        Product.is_deleted == False,
        available_stock < 20
    ).order_by(available_stock.asc()).limit(limit).all()


    return [product_to_json(product) for product in products]