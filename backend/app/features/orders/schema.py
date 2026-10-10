from pydantic import BaseModel
from typing import List, Optional
from app.features.orders.constants import OrderPaymentMethod, OrderStatus

class OrderStatusUpdate(BaseModel):
    status: OrderStatus

class CartItemRequest(BaseModel):
    product_id: int
    quantity: int = 1

class CheckoutCartRequest(BaseModel):
    items: List[CartItemRequest]
    customer_name: str
    customer_phone: str
    shipping_address: str
    notes: Optional[str] = None
    payment_method: OrderPaymentMethod = OrderPaymentMethod.VIETQR
