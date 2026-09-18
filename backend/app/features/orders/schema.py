from pydantic import BaseModel
from typing import List, Optional

class OrderCreate(BaseModel):
    product_id: int
    quantity: int = 1
    user_id: Optional[int] = None

class OrderStatusUpdate(BaseModel):
    status: str 

class CartItemRequest(BaseModel):
    product_id: int
    quantity: int = 1

class CheckoutCartRequest(BaseModel):
    items: List[CartItemRequest]
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    shipping_address: Optional[str] = None
    notes: Optional[str] = None
    payment_method: str = "vietqr"

class VietQRWebhookPayload(BaseModel):
    content: str
    amount: float
    transaction_id: Optional[str] = None
    bank_account: Optional[str] = None