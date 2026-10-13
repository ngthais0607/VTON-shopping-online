"""Order rules that do not access the database or external integrations."""

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any, Protocol

from app.core.errors import BusinessRuleError, ConflictError
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.model import Order
from app.features.products.model import Product


class CartLine(Protocol):
    quantity: int
    variant_id: int | None
    product_id: int | None


class InvalidCartItemError(BusinessRuleError):
    code = "invalid_cart_item"


class InvalidOrderTransition(ConflictError):
    code = "invalid_order_transition"


def available_stock(target: Any) -> int:
    stock = getattr(target, "stock_quantity", 0) or 0
    reserved = getattr(target, "reserved_quantity", 0) or 0
    sold = getattr(target, "sold_quantity", 0) or 0
    return stock - reserved - sold


def aggregate_cart_items(items: Sequence[CartLine]) -> dict[int, int]:
    if not items:
        raise InvalidCartItemError("Cart items cannot be empty")
    aggregated: dict[int, int] = {}
    for item in items:
        if item.quantity <= 0:
            target_id = getattr(item, "variant_id", None) or getattr(item, "product_id", None)
            raise InvalidCartItemError(
                f"Invalid quantity {item.quantity} for item ID {target_id}"
            )
        target_id = getattr(item, "variant_id", None)
        if target_id is None:
            target_id = getattr(item, "product_id", None)
        if target_id is None:
            raise InvalidCartItemError("Cart item must specify variant_id or product_id")
        aggregated[target_id] = aggregated.get(target_id, 0) + item.quantity
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

    # If the order has OrderItem lines, adjust each item's variant or product stock
    items = getattr(order, "items", None)
    if items:
        for item in items:
            target = getattr(item, "variant", None)
            if target is None:
                target = getattr(item, "product", None)
            qty = item.quantity or 0
            if target is not None and getattr(target, "reserved_quantity", None) is not None:
                if current_status in {OrderStatus.PENDING, OrderStatus.CONFIRMED}:
                    target.reserved_quantity = max(0, target.reserved_quantity - qty)
                    if new_status == OrderStatus.PAID:
                        target.sold_quantity = (getattr(target, "sold_quantity", 0) or 0) + qty
                elif (
                    current_status == OrderStatus.PAID
                    and new_status == OrderStatus.CANCELLED
                ):
                    target.sold_quantity = max(0, (getattr(target, "sold_quantity", 0) or 0) - qty)
    elif getattr(order, "product", None) is not None:
        prod = order.product
        qty = order.quantity or 0
        if current_status in {OrderStatus.PENDING, OrderStatus.CONFIRMED}:
            if getattr(prod, "reserved_quantity", None) is not None:
                prod.reserved_quantity = max(0, prod.reserved_quantity - qty)
            if new_status == OrderStatus.PAID and getattr(prod, "sold_quantity", None) is not None:
                prod.sold_quantity = (getattr(prod, "sold_quantity", 0) or 0) + qty
        elif (
            current_status == OrderStatus.PAID
            and new_status == OrderStatus.CANCELLED
        ):
            if getattr(prod, "sold_quantity", None) is not None:
                prod.sold_quantity = max(0, (getattr(prod, "sold_quantity", 0) or 0) - qty)


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

