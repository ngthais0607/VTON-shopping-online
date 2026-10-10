from collections.abc import Sequence
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.model import Order
from app.features.orders.schema import CartItemRequest, CheckoutCartRequest
from app.features.products.model import Product
from app.features.users.model import User


class InvalidOrderTransition(ValueError):
    pass


class InvalidCartItemError(ValueError):
    pass


class ProductNotFoundError(LookupError):
    pass


class InsufficientStockError(ValueError):
    pass


def aggregate_cart_items(items: Sequence[CartItemRequest]) -> dict[int, int]:
    aggregated: dict[int, int] = {}
    for item in items:
        if item.quantity <= 0:
            raise InvalidCartItemError(
                f"Invalid quantity {item.quantity} for product ID {item.product_id}"
            )
        aggregated[item.product_id] = aggregated.get(item.product_id, 0) + item.quantity
    return aggregated


def create_cart_orders(
    db: Session,
    user: User,
    checkout: CheckoutCartRequest,
    now: datetime | None = None,
) -> list[Order]:
    quantities = aggregate_cart_items(checkout.items)
    product_ids = sorted(quantities)
    products = (
        db.query(Product)
        .filter(
            Product.id.in_(product_ids),
            Product.is_deleted == False,
            Product.is_active == True,
        )
        .order_by(Product.id)
        .with_for_update()
        .all()
    )
    products_by_id = {product.id: product for product in products}

    for product_id in product_ids:
        product = products_by_id.get(product_id)
        if product is None:
            raise ProductNotFoundError(f"Product ID {product_id} not found")
        quantity = quantities[product_id]
        available = product.stock_quantity - product.reserved_quantity - product.sold_quantity
        if available < quantity:
            raise InsufficientStockError(
                f"Not enough stock available for product '{product.name}'. "
                f"Requested: {quantity}, Available: {available}"
            )

    checkout_time = now or datetime.now(timezone.utc)
    is_vietqr = checkout.payment_method == OrderPaymentMethod.VIETQR
    orders: list[Order] = []
    for product_id in product_ids:
        product = products_by_id[product_id]
        quantity = quantities[product_id]
        order = Order(
            user_id=user.id,
            product_id=product.id,
            product_name=product.name,
            unit_price=product.price,
            quantity=quantity,
            total_amount=product.price * quantity,
            currency=product.currency,
            status=OrderStatus.PENDING.value if is_vietqr else OrderStatus.CONFIRMED.value,
            customer_name=checkout.customer_name,
            customer_phone=checkout.customer_phone,
            shipping_address=checkout.shipping_address,
            notes=checkout.notes,
            payment_method=checkout.payment_method.value,
            expires_at=checkout_time + timedelta(minutes=30) if is_vietqr else None,
        )
        product.reserved_quantity += quantity
        db.add(order)
        orders.append(order)
    return orders


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
