from datetime import datetime, timezone

from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.model import Order


class InvalidOrderTransition(ValueError):
    pass


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


def transition_order(
    order: Order,
    new_status: OrderStatus,
    now: datetime | None = None,
) -> None:
    current_status = OrderStatus(order.status)
    payment_method = OrderPaymentMethod(order.payment_method)
    allowed = _ALLOWED_TRANSITIONS.get((payment_method, current_status), set())
    if new_status not in allowed:
        raise InvalidOrderTransition(
            f"Cannot transition {payment_method.value} order from "
            f"{current_status.value} to {new_status.value}"
        )

    product = order.product
    if product:
        product.reserved_quantity = max(0, product.reserved_quantity - order.quantity)
        if new_status == OrderStatus.PAID:
            product.sold_quantity += order.quantity

    order.status = new_status.value
    if new_status == OrderStatus.PAID:
        order.paid_at = now or datetime.now(timezone.utc)
    elif new_status == OrderStatus.EXPIRED:
        for payment in order.payments:
            if payment.status == "pending":
                payment.status = "expired"
