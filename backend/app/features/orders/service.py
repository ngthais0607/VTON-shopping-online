import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    ForbiddenError,
    ResourceNotFoundError,
    TooManyRequestsError,
)
from app.core.schemas import Page
from app.features.categories.model import Category
from app.features.dashboard.service import invalidate_dashboard_cache
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.domain import (
    CUSTOMER_CANCELLABLE,
    apply_order_transition,
    available_stock,
)
from app.features.orders.model import Order, OrderItem
from app.features.orders.presenters import (  # noqa: F401  (re-exported)
    _build_public_tracking_response,
    _vietqr_response,
    order_to_response,
)
from app.features.orders.schemas import (
    CartItemRequest,
    CheckoutCommand,
    CheckoutResponse,
    OrderResponse,
    PublicTrackingResponse,
)
from app.features.orders.transitions import (  # noqa: F401  (re-exported)
    _lock_transition_variants,
    _record_paid,
    _resolve_and_lock_order_inventory,
)
from app.features.orders.vietqr_memo import (  # noqa: F401  (re-exported)
    _ANY_PREFIX_REGEX,
    _MEMO_TOKEN_REGEX,
    generate_order_payment_memo,
    parse_order_ids_from_memo,
)
from app.features.orders.webhook import (  # noqa: F401  (re-exported)
    _is_payment_transaction_uniqueness_error,
    list_late_payments,
    process_vietqr_webhook,
)
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User
from app.integrations.queue import TaskQueue

logger = logging.getLogger(__name__)


# Unpaid VietQR orders hold reserved stock until they expire, so one shopper may only
# have a few open at a time.
MAX_OPEN_PENDING_ORDERS = 5


class ProductNotFoundError(ResourceNotFoundError):
    code = "product_not_found"


class OrderNotFoundError(ResourceNotFoundError):
    code = "order_not_found"


class InsufficientStockError(ConflictError):
    code = "insufficient_stock"


async def _enqueue_best_effort(queue: TaskQueue, task_name: str, order_id: int) -> None:
    try:
        await queue.enqueue(task_name, order_id)
    except Exception as exc:
        logger.error(
            "Failed to enqueue email task %s for order %s: %s",
            task_name,
            order_id,
            exc,
            extra={
                "order_id": order_id,
                "task_name": task_name,
                "error": str(exc),
            },
            exc_info=True,
        )


def demo_auto_pay_delay() -> int | None:
    """Seconds before a demo order is auto-paid, or None when disabled."""
    settings = get_settings()
    if settings.app_env == "production" or settings.demo_auto_pay_seconds <= 0:
        return None
    return settings.demo_auto_pay_seconds


async def _enqueue_demo_auto_pay(queue: TaskQueue, order_id: int, delay: int) -> None:
    try:
        await queue.enqueue("demo_auto_pay_order_task", order_id, defer_seconds=delay)
    except Exception:
        logger.exception("Failed to schedule demo auto-pay for order %s", order_id)


def _dispatch_email(
    queue: TaskQueue,
    task_name: str,
    order_id: int,
    background_tasks: BackgroundTasks,
) -> None:
    background_tasks.add_task(_enqueue_best_effort, queue, task_name, order_id)


def checkout_cart(
    db: Session,
    user: User,
    command: CheckoutCommand,
    queue: TaskQueue,
    background_tasks: BackgroundTasks,
    now: datetime | None = None,
) -> CheckoutResponse:
    # 1. Resolve variant ID for each cart item
    variant_quantities: dict[int, int] = {}
    for item in command.items:
        if item.quantity <= 0:
            raise BusinessRuleError(
                "Quantity must be greater than zero", code="invalid_cart_item"
            )
        vid = item.variant_id
        if vid is None:
            raise BusinessRuleError(
                "Each cart item must have a valid variant_id", code="missing_variant_id"
            )
        variant_quantities[vid] = variant_quantities.get(vid, 0) + item.quantity

    if command.payment_method == OrderPaymentMethod.VIETQR:
        open_pending = (
            db.query(Order)
            .filter(
                Order.user_id == user.id,
                Order.status == OrderStatus.PENDING.value,
            )
            .count()
        )
        if open_pending >= MAX_OPEN_PENDING_ORDERS:
            raise TooManyRequestsError(
                "Too many unpaid orders. Pay or cancel one before placing another.",
                code="too_many_pending_orders",
            )

    variant_ids = sorted(variant_quantities.keys())
    by_variant_id: dict[int, ProductVariant] = {}
    for vid in variant_ids:
        variant = (
            db.query(ProductVariant)
            .filter(
                ProductVariant.id == vid,
                ProductVariant.is_active.is_(True),
            )
            .populate_existing()
            .with_for_update()
            .first()
        )
        if variant is None:
            raise ProductNotFoundError(f"Product variant ID {vid} not found")

        parent_product = (
            db.query(Product)
            .filter(
                Product.id == variant.product_id,
                Product.is_deleted.is_(False),
                Product.is_active.is_(True),
                (
                    Product.category_id.is_(None)
                    | Product.category.has(Category.is_deleted.is_(False))
                ),
            )
            .populate_existing()
            .with_for_update(read=True)
            .first()
        )
        if parent_product is None:
            raise ProductNotFoundError(
                f"Product for variant ID {vid} not found or inactive"
            )

        variant.product = parent_product
        by_variant_id[vid] = variant

        quantity = variant_quantities[vid]
        available = available_stock(variant)
        if available < quantity:
            raise InsufficientStockError(
                f"Not enough stock available for variant '{variant.sku}' of product '{parent_product.name}'. "
                f"Requested: {quantity}, Available: {available}"
            )

    currencies = {v.product.currency.upper() for v in by_variant_id.values()}
    if len(currencies) != 1:
        raise BusinessRuleError(
            "Cart must use one currency", code="mixed_cart_currency"
        )
    currency = currencies.pop()
    if command.payment_method == OrderPaymentMethod.VIETQR and currency != "VND":
        raise BusinessRuleError(
            "VietQR requires VND", code="unsupported_payment_currency"
        )

    settings = get_settings()
    checkout_time = now or datetime.now(timezone.utc)
    if checkout_time.tzinfo is None:
        checkout_time = checkout_time.replace(tzinfo=timezone.utc)
    is_vietqr = command.payment_method == OrderPaymentMethod.VIETQR

    # Atomic inventory reservation on variants
    for vid in variant_ids:
        quantity = variant_quantities[vid]
        v = by_variant_id[vid]
        v.reserved_quantity += quantity

    total_amount = sum(
        Decimal(
            str(
                by_variant_id[vid].price
                if by_variant_id[vid].price is not None
                else by_variant_id[vid].product.price
            )
        )
        * qty
        for vid, qty in variant_quantities.items()
    )

    order = Order(
        user_id=user.id,
        product_id=None,
        product_name=None,
        unit_price=None,
        quantity=None,
        total_amount=total_amount,
        currency=currency,
        status=OrderStatus.PENDING.value if is_vietqr else OrderStatus.CONFIRMED.value,
        customer_name=command.customer_name,
        customer_phone=command.customer_phone,
        shipping_address=command.shipping_address,
        notes=command.notes,
        payment_method=command.payment_method.value,
        expires_at=checkout_time + timedelta(minutes=settings.order_expire_minutes)
        if is_vietqr
        else None,
    )
    db.add(order)
    db.flush()

    for vid, qty in variant_quantities.items():
        v = by_variant_id[vid]
        prod = v.product
        price = v.price if v.price is not None else prod.price
        item_subtotal = Decimal(str(price)) * qty
        item = OrderItem(
            order_id=order.id,
            product_id=prod.id,
            product_name=prod.name,
            unit_price=price,
            quantity=qty,
            subtotal=item_subtotal,
            variant_id=v.id,
            sku=v.sku,
            size=v.size,
            color_name=v.color_name,
        )
        db.add(item)
        order.items.append(item)

    db.commit()
    db.refresh(order)
    invalidate_dashboard_cache()

    _dispatch_email(
        queue,
        "send_order_confirmation_email_task",
        order.id,
        background_tasks=background_tasks,
    )

    if is_vietqr and (delay := demo_auto_pay_delay()) is not None:
        background_tasks.add_task(_enqueue_demo_auto_pay, queue, order.id, delay)

    order_resp = order_to_response(order)
    response = CheckoutResponse(
        message="Checkout created successfully",
        orders=[order_resp],
        total_amount=order.total_amount,
        payment_method=command.payment_method,
    )
    if is_vietqr:
        response.vietqr = _vietqr_response(order)
    return response


# Alias for centralized interface
create_checkout = checkout_cart


def reorder_order(
    db: Session,
    public_code: str,
    user: User,
    queue: TaskQueue,
    background_tasks: BackgroundTasks,
) -> CheckoutResponse:
    """Place a brand-new VietQR order from an expired or cancelled one.

    Goes through checkout_cart, so price, stock and locking are re-checked.
    """
    order = db.query(Order).filter(Order.public_code == public_code).first()
    if order is None:
        raise OrderNotFoundError("Order not found")
    if user.role != "admin" and order.user_id != user.id:
        raise ForbiddenError("You do not have permission to reorder this order")
    if order.status not in (OrderStatus.EXPIRED.value, OrderStatus.CANCELLED.value):
        raise BusinessRuleError(
            "Only expired or cancelled orders can be ordered again",
            code="order_not_reorderable",
        )
    if not order.items or any(item.variant_id is None for item in order.items):
        raise BusinessRuleError(
            "This order cannot be reordered", code="order_not_reorderable"
        )
    command = CheckoutCommand(
        items=[
            CartItemRequest(variant_id=item.variant_id, quantity=item.quantity)
            for item in order.items
        ],
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        shipping_address=order.shipping_address,
        notes=order.notes,
        payment_method=OrderPaymentMethod.VIETQR,
    )
    # The new order belongs to the original customer even when an admin reorders.
    owner = user if order.user_id == user.id else db.get(User, order.user_id)
    if owner is None or owner.is_deleted:
        raise BusinessRuleError(
            "This order cannot be reordered", code="order_not_reorderable"
        )
    return checkout_cart(db, owner, command, queue, background_tasks=background_tasks)


def list_orders(db: Session, limit: int, offset: int) -> Page[OrderResponse]:
    total = db.query(Order).count()
    orders = (
        db.query(Order)
        .options(selectinload(Order.items), selectinload(Order.payments))
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


def change_order_status(
    db: Session,
    order_id: int,
    new_status: OrderStatus,
    queue: TaskQueue,
    background_tasks: BackgroundTasks,
    allowed_from: set[OrderStatus] | None = None,
) -> OrderResponse:
    order_exists = db.query(Order.id).filter(Order.id == order_id).scalar()
    if order_exists is None:
        raise OrderNotFoundError("Order not found")

    # 1. Lock inventory FIRST
    locked_variants = _resolve_and_lock_order_inventory(db, [order_id])

    # 2. Lock order row NEXT
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if order is None:
        raise OrderNotFoundError("Order not found")

    if allowed_from is not None and OrderStatus(order.status) not in allowed_from:
        raise BusinessRuleError(
            "Order cannot be cancelled by customers in its current state",
            code="order_not_cancellable",
        )

    for item in order.items:
        if item.variant_id:
            item.variant = locked_variants.get(item.variant_id)

    if new_status == OrderStatus.PAID:
        provider = (
            "cod" if order.payment_method == OrderPaymentMethod.COD.value else "manual"
        )
        _record_paid(db, order, provider, None, datetime.now(timezone.utc))
    else:
        apply_order_transition(order, new_status)
    db.commit()
    db.refresh(order)
    invalidate_dashboard_cache()
    if new_status == OrderStatus.PAID:
        _dispatch_email(
            queue,
            "send_payment_received_email_task",
            order.id,
            background_tasks=background_tasks,
        )
    return order_to_response(order)


def mark_paid(
    db: Session,
    order_id: int,
    queue: TaskQueue,
    background_tasks: BackgroundTasks,
) -> OrderResponse:
    return change_order_status(
        db, order_id, OrderStatus.PAID, queue, background_tasks=background_tasks
    )


def cancel_order(
    db: Session,
    order_id: int,
    queue: TaskQueue,
    background_tasks: BackgroundTasks,
) -> OrderResponse:
    return change_order_status(
        db, order_id, OrderStatus.CANCELLED, queue, background_tasks=background_tasks
    )


def cancel_customer_order(
    db: Session,
    order_id: int,
    user: User,
    queue: TaskQueue,
    background_tasks: BackgroundTasks,
) -> OrderResponse:
    order = db.get(Order, order_id)
    if order is None:
        raise OrderNotFoundError("Order not found")
    if user.role != "admin" and order.user_id != user.id:
        raise ForbiddenError("You do not have permission to cancel this order")
    allowed_from = (
        None
        if user.role == "admin"
        else CUSTOMER_CANCELLABLE.get(OrderPaymentMethod(order.payment_method), set())
    )
    return change_order_status(
        db,
        order_id,
        OrderStatus.CANCELLED,
        queue,
        background_tasks=background_tasks,
        allowed_from=allowed_from,
    )


def expire_order(
    db: Session,
    order_id: int,
    queue: TaskQueue,
    background_tasks: BackgroundTasks,
) -> OrderResponse:
    return change_order_status(
        db, order_id, OrderStatus.EXPIRED, queue, background_tasks=background_tasks
    )


def confirm_cod(
    db: Session,
    order_id: int,
    queue: TaskQueue,
    background_tasks: BackgroundTasks,
) -> OrderResponse:
    return change_order_status(
        db, order_id, OrderStatus.CONFIRMED, queue, background_tasks=background_tasks
    )


def list_user_orders(
    db: Session,
    user_id: int,
    current_user: User,
    limit: int = 10,
    offset: int = 0,
) -> Page[OrderResponse]:
    if current_user.role != "admin" and current_user.id != user_id:
        raise ForbiddenError("You do not have permission to access these orders")
    base_query = db.query(Order).filter(Order.user_id == user_id)
    total = base_query.count()
    orders = (
        base_query.options(selectinload(Order.items), selectinload(Order.payments))
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


def track_order_by_public_code(db: Session, public_code: str) -> PublicTrackingResponse:
    order = db.query(Order).filter(Order.public_code == public_code).first()
    if order is None:
        raise OrderNotFoundError("Order not found")
    return _build_public_tracking_response(order)


def expire_pending_orders(
    db: Session,
    now: datetime | None = None,
    batch_size: int = 50,
) -> int:
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    candidates = (
        db.query(Order.id)
        .filter(
            Order.status == OrderStatus.PENDING.value,
            Order.payment_method == OrderPaymentMethod.VIETQR.value,
            Order.expires_at <= current_time,
        )
        .order_by(Order.id)
        .limit(batch_size)
        .all()
    )
    if not candidates:
        return 0

    order_ids = [row.id for row in candidates]

    # 1. Lock inventory FIRST
    locked_variants = _resolve_and_lock_order_inventory(db, order_ids)

    # 2. Lock exact order rows in loop (with skip_locked if supported by dialect)
    supports_skip_locked = bool(
        db.bind and db.bind.dialect.name in ("mysql", "mariadb", "postgresql")
    )
    expired_count = 0
    for order_id in order_ids:
        order = (
            db.query(Order)
            .filter(Order.id == order_id)
            .populate_existing()
            .with_for_update(skip_locked=supports_skip_locked)
            .first()
        )
        if (
            order is None
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

        for item in order.items:
            if item.variant_id:
                item.variant = locked_variants.get(item.variant_id)

        apply_order_transition(order, OrderStatus.EXPIRED, current_time)
        expired_count += 1
    db.commit()
    if expired_count > 0:
        invalidate_dashboard_cache()
    return expired_count
