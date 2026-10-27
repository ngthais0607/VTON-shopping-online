from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_admin
from app.features.dashboard import service
from app.features.dashboard.schemas import (
    DashboardMetrics,
    LowStockProductSummary,
    RecentOrderSummary,
)
from app.features.users.model import User

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


@router.get("/metrics", response_model=DashboardMetrics)
def get_dashboard_metrics(
    db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)
) -> DashboardMetrics:
    return service.get_metrics(db)


@router.get("/recent-orders", response_model=list[RecentOrderSummary])
def get_recent_orders(
    db: Session = Depends(get_db),
    limit: int = Query(default=5, ge=1, le=20),
    _admin: User = Depends(get_current_admin),
) -> list[RecentOrderSummary]:
    return service.get_recent_orders(db, limit)


@router.get("/low-stock-products", response_model=list[LowStockProductSummary])
def get_low_stock_products(
    db: Session = Depends(get_db),
    limit: int = Query(default=5, ge=1, le=20),
    _admin: User = Depends(get_current_admin),
) -> list[LowStockProductSummary]:
    return service.get_low_stock_products(db, limit)
