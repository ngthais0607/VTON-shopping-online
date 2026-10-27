from pydantic import BaseModel

from app.core.schemas import UtcDatetime
from app.features.orders.constants import OrderStatus
from app.features.products.schemas import CategorySummary


class DashboardMetrics(BaseModel):
    total_products: int
    active_products: int
    low_stock: int
    pending_orders: int
    revenue: float


class RecentOrderSummary(BaseModel):
    id: int
    product_name: str
    quantity: int
    total: float
    currency: str
    status: OrderStatus
    payment_status: str
    created_at: UtcDatetime | None


class LowStockProductSummary(BaseModel):
    id: int
    name: str
    stock_quantity: int
    reserved_quantity: int
    sold_quantity: int
    available_stock: int
    category: CategorySummary | None
