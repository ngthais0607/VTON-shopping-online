from pydantic import BaseModel, ConfigDict, Field

from app.core.schemas import UtcDatetime
from app.features.orders.constants import OrderPaymentMethod, OrderStatus


class CartItemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variant_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=99)


class CheckoutCommand(BaseModel):
    items: list[CartItemRequest] = Field(min_length=1)
    customer_name: str = Field(min_length=1, max_length=255)
    customer_phone: str = Field(min_length=1, max_length=50)
    shipping_address: str = Field(min_length=1, max_length=1000)
    notes: str | None = Field(default=None, max_length=2000)
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
    amount: int


class VietQRWebhookPayload(BaseModel):
    transaction_id: str = Field(min_length=1, max_length=100)
    amount: float = Field(gt=0)
    content: str = Field(min_length=1, max_length=500)
    account_number: str | None = None
    bank_code: str | None = None
    transacted_at: UtcDatetime | None = None


class VietQRWebhookResponse(BaseModel):
    status: str
    message: str
    order_ids: list[int]


class LatePaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    provider: str
    provider_transaction_id: str | None = None
    amount: float
    currency: str
    status: str
    paid_at: UtcDatetime | None = None
    created_at: UtcDatetime | None = None
    order_status: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None


class OrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    product_id: int
    product_name: str
    unit_price: float
    quantity: int
    subtotal: float
    variant_id: int | None = None
    sku: str | None = None
    size: str | None = None
    color_name: str | None = None


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    public_code: str
    user_id: int | None
    product_id: int | None = None
    product_name: str | None = None
    unit_price: float | None = None
    quantity: int | None = None
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
    expires_at: UtcDatetime | None
    paid_at: UtcDatetime | None
    created_at: UtcDatetime | None
    items: list[OrderItemResponse] = []


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
    timestamp: UtcDatetime | None


class TrackingResponse(OrderResponse):
    timeline: list[TrackingStep]
    vietqr: VietQRResponse | None = None
