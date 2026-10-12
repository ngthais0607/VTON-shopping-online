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
    (OrderPaymentMethod.VIETQR, OrderStatus.PAID): {
        OrderStatus.CANCELLED,
    },
    (OrderPaymentMethod.COD, OrderStatus.PENDING): {
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
    },
    (OrderPaymentMethod.COD, OrderStatus.CONFIRMED): {
        OrderStatus.PAID,
        OrderStatus.CANCELLED,
    },
    (OrderPaymentMethod.COD, OrderStatus.PAID): {
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

    # If the order has OrderItem lines, adjust each item's product stock
    items = getattr(order, "items", None)
    if items:
        for item in items:
            prod = getattr(item, "product", None)
            if prod is not None:
                qty = item.quantity or 0
                if current_status in {OrderStatus.PENDING, OrderStatus.CONFIRMED}:
                    prod.reserved_quantity = max(0, prod.reserved_quantity - qty)
                    if new_status == OrderStatus.PAID:
                        prod.sold_quantity += qty
                elif (
                    current_status == OrderStatus.PAID
                    and new_status == OrderStatus.CANCELLED
                ):
                    prod.sold_quantity = max(0, prod.sold_quantity - qty)
    elif getattr(order, "product", None) is not None:
        prod = order.product
        qty = order.quantity or 0
        if current_status in {OrderStatus.PENDING, OrderStatus.CONFIRMED}:
            prod.reserved_quantity = max(0, prod.reserved_quantity - qty)
            if new_status == OrderStatus.PAID:
                prod.sold_quantity += qty
        elif (
            current_status == OrderStatus.PAID
            and new_status == OrderStatus.CANCELLED
        ):
            prod.sold_quantity = max(0, prod.sold_quantity - qty)

    order.status = new_status.value
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)

    if new_status == OrderStatus.PAID:
        order.paid_at = current_time
    elif new_status == OrderStatus.EXPIRED:
        for payment in getattr(order, "payments", []):
            if payment.status == "pending":
                payment.status = "expired"
