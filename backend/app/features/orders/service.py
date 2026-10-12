import hmac
import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import (
    AuthenticationError,
    BusinessRuleError,
    ConflictError,
    ForbiddenError,
    ResourceNotFoundError,
)
from app.core.schemas import Page
from app.features.categories.model import Category
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.domain import (
    aggregate_cart_items,
    apply_order_transition,
    available_stock,
)
from app.features.orders.model import Order, Payment
from app.features.orders.schemas import (
    CheckoutCommand,
    CheckoutResponse,
    OrderResponse,
    TrackingResponse,
    TrackingStep,
    VietQRResponse,
    VietQRWebhookPayload,
    VietQRWebhookResponse,
)
from app.features.products.model import Product
from app.features.users.model import User
from app.integrations.queue import TaskQueue
from app.integrations.vietqr import build_vietqr_instructions

logger = logging.getLogger(__name__)


class ProductNotFoundError(ResourceNotFoundError):
    code = "product_not_found"


class OrderNotFoundError(ResourceNotFoundError):
    code = "order_not_found"


class InsufficientStockError(ConflictError):
    code = "insufficient_stock"


def order_to_response(order: Order) -> OrderResponse:
    payment = order.payments[-1] if order.payments else None
    if payment:
        payment_status = payment.status
    elif order.status == OrderStatus.PAID.value:
        payment_status = "paid"
    elif order.status == OrderStatus.EXPIRED.value:
        payment_status = "failed"
    else:
        payment_status = "pending"
    return OrderResponse(
        id=order.id,
        public_code=getattr(order, "public_code", None) or uuid4().hex,
        user_id=order.user_id,
        product_id=order.product_id,
        product_name=order.product_name,
        unit_price=order.unit_price,
        quantity=order.quantity,
        total_amount=order.total_amount,
        total=order.total_amount,
        currency=order.currency,
        status=order.status,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        shipping_address=order.shipping_address,
        notes=order.notes,
        payment_method=order.payment_method,
        payment_status=payment_status,
        expires_at=order.expires_at,
        paid_at=order.paid_at,
        created_at=order.created_at,
    )


def _vietqr_response(orders: list[Order]) -> VietQRResponse:
    total = sum(order.total_amount for order in orders)
    memo = f"LUXESTORE_{'_'.join(str(order.id) for order in orders)}"
    instructions = build_vietqr_instructions(total, memo)
    return VietQRResponse(**vars(instructions))


async def _enqueue_best_effort(queue: TaskQueue, task_name: str, order_id: int) -> None:
    try:
        await queue.enqueue(task_name, order_id)
    except Exception:
        logger.exception("Failed to enqueue %s for order %s", task_name, order_id)


async def checkout_cart(
    db: Session,
    user: User,
    command: CheckoutCommand,
    queue: TaskQueue,
    now: datetime | None = None,
) -> CheckoutResponse:
    quantities = aggregate_cart_items(command.items)
    product_ids = sorted(quantities)
    by_id: dict[int, Product] = {}
    for product_id in product_ids:
        product = (
            db.query(Product)
            .filter(
                Product.id == product_id,
                Product.is_deleted.is_(False),
                Product.is_active.is_(True),
                (
                    Product.category_id.is_(None)
                    | Product.category.has(Category.is_deleted.is_(False))
                ),
            )
            .populate_existing()
            .with_for_update()
            .first()
        )
        if product is None:
            raise ProductNotFoundError(f"Product ID {product_id} not found")
        by_id[product_id] = product
        quantity = quantities[product_id]
        available = available_stock(product)
        if available < quantity:
            raise InsufficientStockError(
                f"Not enough stock available for product '{product.name}'. "
                f"Requested: {quantity}, Available: {available}"
            )

    currencies = {product.currency.upper() for product in by_id.values()}
    if len(currencies) != 1:
        raise BusinessRuleError(
            "Cart must use one currency", code="mixed_cart_currency"
        )
    if command.payment_method == OrderPaymentMethod.VIETQR and currencies != {"VND"}:
        raise BusinessRuleError(
            "VietQR requires VND", code="unsupported_payment_currency"
        )

    checkout_time = now or datetime.now(timezone.utc)
    is_vietqr = command.payment_method == OrderPaymentMethod.VIETQR
    orders: list[Order] = []
    for product_id in product_ids:
        product = by_id[product_id]
        quantity = quantities[product_id]
        order = Order(
            user_id=user.id,
            product_id=product.id,
            product_name=product.name,
            unit_price=product.price,
            quantity=quantity,
            total_amount=product.price * quantity,
            currency=product.currency.upper(),
            status=OrderStatus.PENDING.value
            if is_vietqr
            else OrderStatus.CONFIRMED.value,
            customer_name=command.customer_name,
            customer_phone=command.customer_phone,
            shipping_address=command.shipping_address,
            notes=command.notes,
            payment_method=command.payment_method.value,
            expires_at=checkout_time + timedelta(minutes=30) if is_vietqr else None,
        )
        product.reserved_quantity += quantity
        db.add(order)
        orders.append(order)
    db.commit()
    for order in orders:
        db.refresh(order)

    for order in orders:
        await _enqueue_best_effort(
            queue, "send_order_confirmation_email_task", order.id
        )

    response = CheckoutResponse(
        message="Checkout created successfully",
        orders=[order_to_response(order) for order in orders],
        total_amount=sum(order.total_amount for order in orders),
        payment_method=command.payment_method,
    )
    if is_vietqr:
        response.vietqr = _vietqr_response(orders)
    return response


def list_orders(db: Session, limit: int, offset: int) -> Page[OrderResponse]:
    total = db.query(Order).count()
    orders = (
        db.query(Order)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return Page(
        items=[order_to_response(order) for order in orders],
        total=total,
        limit=limit,
        offset=offset,
    )


def get_order_for_user(db: Session, order_id: int, user: User) -> OrderResponse:
    order = db.get(Order, order_id)
    if order is None or (user.role != "admin" and order.user_id != user.id):
        raise OrderNotFoundError("Order not found")
    return order_to_response(order)


async def change_order_status(
    db: Session,
    order_id: int,
    new_status: OrderStatus,
    queue: TaskQueue,
) -> OrderResponse:
    product_id = db.query(Order.product_id).filter(Order.id == order_id).scalar()
    if product_id is None:
        raise OrderNotFoundError("Order not found")
    locked_products = _lock_transition_products(db, {product_id})
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if order is None:
        raise OrderNotFoundError("Order not found")
    if order.product_id != product_id:
        raise ConflictError("Order product changed during transition")
    order.product = locked_products[product_id]
    apply_order_transition(order, new_status)
    db.commit()
    db.refresh(order)
    if new_status == OrderStatus.PAID:
        await _enqueue_best_effort(queue, "send_payment_received_email_task", order.id)
    return order_to_response(order)


def list_user_orders(
    db: Session, user_id: int, current_user: User
) -> list[OrderResponse]:
    if current_user.role != "admin" and current_user.id != user_id:
        raise ForbiddenError("You do not have permission to access these orders")
    orders = (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .all()
    )
    return [order_to_response(order) for order in orders]


def track_order_by_public_code(db: Session, public_code: str) -> TrackingResponse:
    order = db.query(Order).filter(Order.public_code == public_code).first()
    if order is None:
        raise OrderNotFoundError("Order not found")
    return _build_tracking_response(order)


def track_order(db: Session, order_id: int, user: User | None = None) -> TrackingResponse:
    order = db.get(Order, order_id)
    if order is None or (user and user.role != "admin" and order.user_id != user.id):
        raise OrderNotFoundError("Order not found")
    return _build_tracking_response(order)


def _build_tracking_response(order: Order) -> TrackingResponse:
    paid = order.status == OrderStatus.PAID.value
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
            title="Payment Verified",
            description="VietQR bank transfer verified by an administrator.",
            completed=paid,
            timestamp=order.paid_at if paid else None,
        ),
        TrackingStep(
            step=3,
            title="Processing & Packing",
            description="Item certified and packed for express dispatch.",
            completed=paid,
            timestamp=None,
        ),
        TrackingStep(
            step=4,
            title="Delivered",
            description="Order fulfilled and delivered to recipient.",
            completed=False,
            timestamp=None,
        ),
    ]
    response = TrackingResponse(
        **order_to_response(order).model_dump(), timeline=timeline
    )
    if order.payment_method == OrderPaymentMethod.VIETQR.value:
        response.vietqr = _vietqr_response([order])
    return response


def expire_pending_orders(db: Session, now: datetime | None = None) -> int:
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    candidates = (
        db.query(Order.id, Order.product_id)
        .filter(
            Order.status == OrderStatus.PENDING.value,
            Order.payment_method == OrderPaymentMethod.VIETQR.value,
            Order.expires_at <= current_time,
        )
        .order_by(Order.id)
        .all()
    )
    locked_products = _lock_transition_products(
        db, {product_id for _, product_id in candidates}
    )
    expired_count = 0
    for order_id, discovered_product_id in candidates:
        order = (
            db.query(Order)
            .filter(Order.id == order_id)
            .populate_existing()
            .with_for_update()
            .first()
        )
        if (
            order is None
            or order.product_id != discovered_product_id
            or order.status != OrderStatus.PENDING.value
            or order.payment_method != OrderPaymentMethod.VIETQR.value
            or order.expires_at is None
        ):
            continue
        expires_at = order.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at > current_time:
            continue
        order.product = locked_products[discovered_product_id]
        apply_order_transition(order, OrderStatus.EXPIRED, current_time)
        expired_count += 1
    db.commit()
    return expired_count


def _lock_transition_products(db: Session, product_ids: set[int]) -> dict[int, Product]:
    # Checkout, status changes, and expiration acquire product locks first by ID.
    # populate_existing refreshes products already present in this session's identity map.
    locked: dict[int, Product] = {}
    for product_id in sorted(product_ids):
        locked[product_id] = (
            db.query(Product)
            .filter(Product.id == product_id)
            .populate_existing()
            .with_for_update()
            .one()
        )
    return locked


def process_vietqr_webhook(
    db: Session,
    payload: VietQRWebhookPayload,
    secret_header: str | None,
) -> VietQRWebhookResponse:
    settings = get_settings()
    configured_secret = settings.vietqr_webhook_secret
    if (
        not configured_secret
        or not secret_header
        or not hmac.compare_digest(secret_header, configured_secret)
    ):
        raise AuthenticationError(
            "Invalid or missing webhook secret", code="unauthorized_webhook"
        )

    existing_payment = (
        db.query(Payment)
        .filter(
            Payment.provider == "vietqr",
            Payment.provider_transaction_id == payload.transaction_id,
        )
        .first()
    )
    if existing_payment:
        logger.info(
            "VietQR webhook transaction %s already processed for order %s",
            payload.transaction_id,
            existing_payment.order_id,
        )
        return VietQRWebhookResponse(
            status="already_processed",
            message="Transaction already processed",
            order_ids=[existing_payment.order_id],
        )

    pattern = re.compile(r"(?:TRUELOOK|LUXESTORE)_(\d+(?:_\d+)*)", re.IGNORECASE)
    match = pattern.search(payload.content)
    if not match:
        logger.warning(
            "VietQR webhook memo does not match pattern: %s", payload.content
        )
        raise BusinessRuleError("Invalid memo content", code="invalid_webhook_memo")

    order_ids = [int(i) for i in match.group(1).split("_")]
    orders = db.query(Order).filter(Order.id.in_(order_ids)).all()
    if len(orders) != len(order_ids):
        raise ResourceNotFoundError(
            "One or more orders in memo not found", code="orders_not_found"
        )

    total_expected = sum(order.total_amount for order in orders)
    if round(total_expected) != round(payload.amount):
        logger.warning(
            "VietQR webhook amount mismatch: received %s, expected %s for orders %s",
            payload.amount,
            total_expected,
            order_ids,
        )
        raise BusinessRuleError(
            f"Amount mismatch: received {payload.amount}, expected {total_expected}",
            code="amount_mismatch",
        )

    current_time = datetime.now(timezone.utc)
    for order in orders:
        if order.status == OrderStatus.PENDING.value:
            apply_order_transition(order, OrderStatus.PAID, current_time)
            payment = Payment(
                order_id=order.id,
                provider="vietqr",
                provider_transaction_id=payload.transaction_id,
                amount=order.total_amount,
                currency=order.currency,
                status="paid",
                paid_at=current_time,
            )
            db.add(payment)

    db.commit()
    return VietQRWebhookResponse(
        status="success",
        message="Payment processed successfully",
        order_ids=order_ids,
    )
