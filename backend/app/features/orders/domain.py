"""Order rules that do not access the database or external integrations."""

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Protocol

from app.core.errors import BusinessRuleError, ConflictError
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.model import Order
from app.features.products.model import Product


class CartLine(Protocol):
    product_id: int
    quantity: int


class InvalidCartItemError(BusinessRuleError):
    code = "invalid_cart_item"


class InvalidOrderTransition(ConflictError):
    code = "invalid_order_transition"


def available_stock(product: Product) -> int:
    return product.stock_quantity - product.reserved_quantity - product.sold_quantity


def aggregate_cart_items(items: Sequence[CartLine]) -> dict[int, int]:
    if not items:
        raise InvalidCartItemError("Cart items cannot be empty")
    aggregated: dict[int, int] = {}
    for item in items:
        if item.quantity <= 0:
            raise InvalidCartItemError(
                f"Invalid quantity {item.quantity} for product ID {item.product_id}"
            )
        aggregated[item.product_id] = aggregated.get(item.product_id, 0) + item.quantity
    return aggregated


_ALLOWED_TRANSITIONS = {
    (OrderPaymentMethod.VIETQR, OrderStatus.PENDING): {
        OrderStatus.PAID,
        OrderStatus.CANCELLED,
        OrderStatus.EXPIRED,
    },
    (OrderPaymentMethod.COD, OrderStatus.CONFIRMED): {
        OrderStatus.PAID,
        OrderStatus.CANCELLED,
    },
}


def apply_order_transition(
    order: Order, new_status: OrderStatus, now: datetime | None = None
) -> None:
    current_status = OrderStatus(order.status)
    payment_method = OrderPaymentMethod(order.payment_method)
    if new_status not in _ALLOWED_TRANSITIONS.get(
        (payment_method, current_status), set()
    ):
        raise InvalidOrderTransition(
            f"Cannot transition {payment_method.value} order from "
            f"{current_status.value} to {new_status.value}"
        )

    if order.product is not None:
        order.product.reserved_quantity = max(
            0, order.product.reserved_quantity - order.quantity
        )
        if new_status == OrderStatus.PAID:
            order.product.sold_quantity += order.quantity

    order.status = new_status.value
    if new_status == OrderStatus.PAID:
        order.paid_at = now or datetime.now(timezone.utc)
    elif new_status == OrderStatus.EXPIRED:
        for payment in order.payments:
            if payment.status == "pending":
                payment.status = "expired"
