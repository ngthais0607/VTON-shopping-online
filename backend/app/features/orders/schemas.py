from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.features.orders.constants import OrderPaymentMethod, OrderStatus


class CartItemRequest(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = 1


class CheckoutCommand(BaseModel):
    items: list[CartItemRequest] = Field(min_length=1)
    customer_name: str = Field(min_length=1)
    customer_phone: str = Field(min_length=1)
    shipping_address: str = Field(min_length=1)
    notes: str | None = None
    payment_method: OrderPaymentMethod = OrderPaymentMethod.VIETQR


class OrderPatchStatus(BaseModel):
    status: OrderStatus


class VietQRResponse(BaseModel):
    qr_url: str
    bank_id: str
    bank_name: str
    account_no: str
    account_name: str
    memo: str
    amount: float


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    product_id: int
    product_name: str
    unit_price: float
    quantity: int
    total_amount: float
    total: float
    currency: str
    status: OrderStatus
    customer_name: str
    customer_phone: str
    shipping_address: str
    notes: str | None
    payment_method: OrderPaymentMethod
    payment_status: str
    expires_at: datetime | None
    paid_at: datetime | None
    created_at: datetime | None


class CheckoutResponse(BaseModel):
    message: str
    orders: list[OrderResponse]
    total_amount: float
    payment_method: OrderPaymentMethod
    vietqr: VietQRResponse | None = None


class TrackingStep(BaseModel):
    step: int
    title: str
    description: str
    completed: bool
    timestamp: datetime | None


class TrackingResponse(OrderResponse):
    timeline: list[TrackingStep]
    vietqr: VietQRResponse | None = None
