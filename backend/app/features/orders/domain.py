"""Order rules that do not access the database or external integrations."""

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any, Protocol

from app.core.errors import BusinessRuleError, ConflictError
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.model import Order


class CartLine(Protocol):
    quantity: int
    variant_id: int


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
        target_id = getattr(item, "variant_id", None)
        if target_id is None or target_id <= 0:
            raise InvalidCartItemError("Cart item must specify valid variant_id")
        if item.quantity <= 0:
            raise InvalidCartItemError(
                f"Invalid quantity {item.quantity} for variant ID {target_id}"
            )
        aggregated[target_id] = aggregated.get(target_id, 0) + item.quantity
    return aggregated


_ALLOWED_TRANSITIONS = {
    (OrderPaymentMethod.VIETQR, OrderStatus.PENDING): {
        OrderStatus.PAID,
        OrderStatus.CANCELLED,
        OrderStatus.EXPIRED,
    },
    (OrderPaymentMethod.VIETQR, OrderStatus.PAID): {
        OrderStatus.SHIPPED,
        OrderStatus.CANCELLED,
    },
    (OrderPaymentMethod.VIETQR, OrderStatus.SHIPPED): {
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
    },
    (OrderPaymentMethod.VIETQR, OrderStatus.DELIVERED): {
        OrderStatus.CANCELLED,
    },
    (OrderPaymentMethod.COD, OrderStatus.PENDING): {
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
    },
    (OrderPaymentMethod.COD, OrderStatus.CONFIRMED): {
        OrderStatus.PAID,
        OrderStatus.SHIPPED,
        OrderStatus.CANCELLED,
    },
    (OrderPaymentMethod.COD, OrderStatus.SHIPPED): {
        OrderStatus.PAID,
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
    },
    (OrderPaymentMethod.COD, OrderStatus.PAID): {
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
    },
    (OrderPaymentMethod.COD, OrderStatus.DELIVERED): {
        OrderStatus.PAID,
        OrderStatus.CANCELLED,
    },
}


def is_order_paid(order: Order) -> bool:
    if getattr(order, "paid_at", None) is not None:
        return True
    status = getattr(order, "status", None)
    if status == OrderStatus.PAID.value or status == OrderStatus.PAID:
        return True
    payments = getattr(order, "payments", None) or []
    for payment in payments:
        if getattr(payment, "status", None) == "paid":
            return True
    return False


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

    items = getattr(order, "items", None)
    if not items:
        raise RuntimeError(f"Order {order.id} has no order items")

    # The counters include other orders. Ownership follows the order's payment
    # history, never whichever aggregate counter happens to contain enough stock.
    inventory_sold = current_status == OrderStatus.PAID or order.paid_at is not None
    updates: dict[int, tuple[Any, int, int]] = {}
    for item in items:
        target = getattr(item, "variant", None)
        if target is None:
            raise RuntimeError(f"OrderItem {item.id} missing variant reference")
        qty = item.quantity or 0
        reserved = getattr(target, "reserved_quantity", 0) or 0
        sold = getattr(target, "sold_quantity", 0) or 0
        if id(target) in updates:
            _, reserved, sold = updates[id(target)]
        owned = sold if inventory_sold else reserved
        if (
            owned < qty
            or reserved < 0
            or sold < 0
            or reserved + sold > target.stock_quantity
        ):
            raise ConflictError(
                f"Inconsistent inventory state: variant {target.id} "
                f"{'sold' if inventory_sold else 'reserved'} {owned} < {qty} "
                "or counters outside stock bounds",
                code="inventory_state_inconsistent",
            )
        if new_status in {OrderStatus.CANCELLED, OrderStatus.EXPIRED}:
            if inventory_sold:
                sold -= qty
            else:
                reserved -= qty
        elif new_status == OrderStatus.PAID and not inventory_sold:
            reserved -= qty
            sold += qty
        updates[id(target)] = (target, reserved, sold)

    # Validate every line before changing any inventory, including in-memory callers.
    for target, reserved, sold in updates.values():
        target.reserved_quantity = reserved
        target.sold_quantity = sold

    order.status = new_status.value
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)

    if new_status == OrderStatus.PAID and order.paid_at is None:
        order.paid_at = current_time
    elif new_status == OrderStatus.EXPIRED:
        for payment in getattr(order, "payments", []):
            if payment.status == "pending":
                payment.status = "expired"
    elif new_status == OrderStatus.CANCELLED:
        for payment in getattr(order, "payments", []):
            if payment.status == "pending":
                payment.status = "cancelled"
