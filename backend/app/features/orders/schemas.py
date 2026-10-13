from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.features.orders.constants import OrderPaymentMethod, OrderStatus


class CartItemRequest(BaseModel):
    variant_id: int | None = Field(default=None, gt=0)
    product_id: int | None = Field(default=None, gt=0)
    quantity: int = 1

    @model_validator(mode="after")
    def check_variant_or_product(self) -> "CartItemRequest":
        if self.variant_id is None and self.product_id is None:
            raise ValueError("Either variant_id or product_id must be provided")
        return self


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
    transacted_at: datetime | None = None


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
    paid_at: datetime | None = None
    created_at: datetime | None = None
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
    expires_at: datetime | None
    paid_at: datetime | None
    created_at: datetime | None
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
    timestamp: datetime | None


class TrackingResponse(OrderResponse):
    timeline: list[TrackingStep]
    vietqr: VietQRResponse | None = None
