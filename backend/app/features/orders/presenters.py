import logging
from decimal import Decimal

from app.core.errors import (
    BusinessRuleError,
)
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.model import Order
from app.features.orders.schemas import (
    OrderItemResponse,
    OrderResponse,
    PublicTrackingItem,
    PublicTrackingResponse,
    TrackingStep,
    VietQRResponse,
    mask_customer_name,
    mask_customer_phone,
)
from app.features.orders.vietqr_memo import generate_order_payment_memo
from app.integrations.vietqr import build_vietqr_instructions

logger = logging.getLogger(__name__)


def order_to_response(order: Order) -> OrderResponse:
    payments = getattr(order, "payments", []) or []
    payment = payments[-1] if payments else None
    if payment and payment.status == "paid":
        payment_status = "paid"
    elif order.status == OrderStatus.PAID.value or (
        hasattr(order, "paid_at") and order.paid_at is not None
    ):
        payment_status = "paid"
    elif order.status == OrderStatus.CANCELLED.value:
        payment_status = "cancelled"
    elif order.status == OrderStatus.EXPIRED.value:
        payment_status = "expired"
    elif payment:
        payment_status = payment.status
    else:
        payment_status = "pending"

    order_items = getattr(order, "items", []) or []
    items_res = [
        OrderItemResponse(
            id=item.id,
            order_id=item.order_id,
            product_id=item.product_id,
            product_name=item.product_name,
            unit_price=item.unit_price,
            quantity=item.quantity,
            subtotal=item.subtotal,
            variant_id=item.variant_id,
            sku=item.sku,
            size=item.size,
            color_name=item.color_name,
        )
        for item in order_items
    ]

    if order_items:
        first_item = order_items[0]
        product_id = first_item.product_id
        if len(order_items) == 1:
            product_name = first_item.product_name
        else:
            product_name = (
                f"{first_item.product_name} và {len(order_items) - 1} sản phẩm khác"
            )
        unit_price = first_item.unit_price
        quantity = sum(i.quantity for i in order_items)
    else:
        product_id = order.product_id if order.product_id is not None else 0
        product_name = order.product_name or ""
        unit_price = order.unit_price if order.unit_price is not None else Decimal(0)
        quantity = order.quantity if order.quantity is not None else 0

    public_code = getattr(order, "public_code", None)
    if not public_code:
        raise BusinessRuleError(
            f"Order {order.id} is missing a required public_code",
            code="order_missing_public_code",
        )

    return OrderResponse(
        id=order.id,
        public_code=public_code,
        user_id=order.user_id,
        product_id=product_id,
        product_name=product_name,
        unit_price=unit_price,
        quantity=quantity,
        total_amount=order.total_amount,
        total=order.total_amount,
        currency=order.currency,
        status=OrderStatus(order.status),
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        shipping_address=order.shipping_address,
        notes=order.notes,
        payment_method=OrderPaymentMethod(order.payment_method),
        payment_status=payment_status,
        expires_at=order.expires_at,
        paid_at=order.paid_at,
        created_at=order.created_at,
        items=items_res,
    )


def _vietqr_response(order: Order) -> VietQRResponse:
    memo = generate_order_payment_memo(order.id)
    instructions = build_vietqr_instructions(order.total_amount, memo)
    return VietQRResponse(**vars(instructions))


def _build_public_tracking_response(order: Order) -> PublicTrackingResponse:
    paid = (
        order.status == OrderStatus.PAID.value
        or (hasattr(order, "status") and order.status == OrderStatus.PAID)
        or (getattr(order, "paid_at", None) is not None)
    )
    is_confirmed = order.status == OrderStatus.CONFIRMED.value
    is_shipped = order.status in {
        OrderStatus.SHIPPED.value,
        OrderStatus.DELIVERED.value,
    }
    is_delivered = order.status == OrderStatus.DELIVERED.value

    timeline = [
        TrackingStep(
            step=1,
            title="Order Placed",
            description="Order submitted and awaiting payment confirmation.",
            completed=True,
            timestamp=order.created_at,
        ),
        TrackingStep(
            step=2,
            title=(
                "Payment Verified"
                if order.payment_method != OrderPaymentMethod.COD.value
                else "Order Confirmed"
            ),
            description=(
                "VietQR bank transfer verified by an administrator."
                if order.payment_method != OrderPaymentMethod.COD.value
                else "Cash on delivery order confirmed for fulfillment."
            ),
            completed=paid or is_confirmed or is_shipped or is_delivered,
            timestamp=order.paid_at
            if paid
            else (
                order.created_at
                if (is_confirmed or is_shipped or is_delivered)
                else None
            ),
        ),
        TrackingStep(
            step=3,
            title="Processing & Packing",
            description="Item certified and packed for express dispatch.",
            completed=is_shipped or is_delivered,
            timestamp=None,
        ),
        TrackingStep(
            step=4,
            title="Delivered",
            description="Order fulfilled and delivered to recipient.",
            completed=is_delivered,
            timestamp=None,
        ),
    ]

    items = []
    order_items = getattr(order, "items", []) or []
    for item in order_items:
        items.append(
            PublicTrackingItem(
                product_name=item.product_name,
                size=item.size,
                color_name=item.color_name,
                quantity=item.quantity,
            )
        )
    if not items and getattr(order, "product_name", None):
        items.append(
            PublicTrackingItem(
                product_name=order.product_name,
                size=None,
                color_name=None,
                quantity=getattr(order, "quantity", 1) or 1,
            )
        )

    payments = getattr(order, "payments", []) or []
    payment = payments[-1] if payments else None
    if payment:
        payment_status = payment.status
    elif order.status == OrderStatus.PAID.value:
        payment_status = "paid"
    elif order.status == OrderStatus.EXPIRED.value:
        payment_status = "failed"
    else:
        payment_status = "pending"

    vietqr_data = None
    if (
        order.payment_method == OrderPaymentMethod.VIETQR.value
        and order.status == OrderStatus.PENDING.value
    ):
        vietqr_data = _vietqr_response(order)

    payload = {
        "public_code": order.public_code,
        "status": order.status,
        "payment_status": payment_status,
        "payment_method": order.payment_method,
        "total_amount": order.total_amount,
        "currency": order.currency,
        "created_at": order.created_at,
        "expires_at": order.expires_at,
        "paid_at": order.paid_at,
        "timeline": timeline,
        "items": items,
        "customer_name": mask_customer_name(order.customer_name),
        "customer_phone": mask_customer_phone(order.customer_phone),
    }
    if vietqr_data is not None:
        payload["vietqr"] = vietqr_data

    return PublicTrackingResponse(**payload)
