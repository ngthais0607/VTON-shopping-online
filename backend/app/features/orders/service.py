import hmac
import logging
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import BackgroundTasks
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

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
from app.features.dashboard.service import invalidate_dashboard_cache
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.domain import (
    apply_order_transition,
    available_stock,
)
from app.features.orders.model import Order, OrderItem, Payment
from app.features.orders.schemas import (
    CheckoutCommand,
    CheckoutResponse,
    LatePaymentResponse,
    OrderItemResponse,
    OrderResponse,
    PublicTrackingItem,
    PublicTrackingResponse,
    TrackingResponse,
    TrackingStep,
    VietQRResponse,
    VietQRWebhookPayload,
    VietQRWebhookResponse,
    mask_customer_name,
    mask_customer_phone,
)
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
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


def generate_order_payment_memo(order_id: int) -> str:
    if order_id <= 0:
        raise ValueError("order_id must be a positive integer")
    return f"TL{order_id}"


_MEMO_TOKEN_REGEX = re.compile(
    r"(?i)(?<![A-Za-z0-9])(?:TL|TRUELOOK|LUXESTORE)[\s_-]*([1-9]\d*(?:(?:[xX]|_)[1-9]\d*)*)(?![A-Za-z0-9])"
)

_ANY_PREFIX_REGEX = re.compile(
    r"(?i)(?<![A-Za-z0-9])(?:TL|TRUELOOK|LUXESTORE)[\s_-]*([A-Za-z0-9_-]+)"
)


def parse_order_ids_from_memo(content: str) -> list[int]:
    if not content or not content.strip():
        return []

    all_prefix_matches = _ANY_PREFIX_REGEX.findall(content)
    valid_matches = _MEMO_TOKEN_REGEX.findall(content)

    if len(all_prefix_matches) != len(valid_matches) or len(valid_matches) != 1:
        return []

    token_body = valid_matches[0]
    raw_ids = re.split(r"[xX_]", token_body)
    ids = sorted(list({int(i) for i in raw_ids if i and int(i) > 0}))
    return ids


def _vietqr_response(orders: list[Order]) -> VietQRResponse:
    total = sum(order.total_amount for order in orders)
    if len(orders) == 1:
        memo = generate_order_payment_memo(orders[0].id)
    else:
        memo = f"TL{'X'.join(str(order.id) for order in orders)}"
    instructions = build_vietqr_instructions(total, memo)
    return VietQRResponse(**vars(instructions))



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


def _dispatch_email(
    queue: TaskQueue,
    task_name: str,
    order_id: int,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    if background_tasks is not None:
        background_tasks.add_task(_enqueue_best_effort, queue, task_name, order_id)
    else:
        try:
            import anyio

            anyio.from_thread.run(_enqueue_best_effort, queue, task_name, order_id)
        except Exception:
            try:
                import asyncio

                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    loop = None
                if loop and loop.is_running():
                    loop.create_task(_enqueue_best_effort(queue, task_name, order_id))
                else:
                    asyncio.run(_enqueue_best_effort(queue, task_name, order_id))
            except Exception as exc:
                logger.error(
                    "Failed to enqueue email task %s for order %s: %s",
                    task_name,
                    order_id,
                    exc,
                )


def checkout_cart(
    db: Session,
    user: User,
    command: CheckoutCommand,
    queue: TaskQueue,
    now: datetime | None = None,
    background_tasks: BackgroundTasks | None = None,
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

    order_resp = order_to_response(order)
    response = CheckoutResponse(
        message="Checkout created successfully",
        orders=[order_resp],
        total_amount=order.total_amount,
        payment_method=command.payment_method,
    )
    if is_vietqr:
        response.vietqr = _vietqr_response([order])
    return response


# Alias for centralized interface
create_checkout = checkout_cart


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


def _lock_transition_variants(
    db: Session, variant_ids: set[int]
) -> dict[int, ProductVariant]:
    locked: dict[int, ProductVariant] = {}
    for vid in sorted(variant_ids):
        locked[vid] = (
            db.query(ProductVariant)
            .filter(ProductVariant.id == vid)
            .populate_existing()
            .with_for_update()
            .one()
        )
    return locked


def _resolve_and_lock_order_inventory(
    db: Session, order_ids: list[int] | set[int]
) -> dict[int, ProductVariant]:
    items = db.query(OrderItem).filter(OrderItem.order_id.in_(order_ids)).all()
    variant_ids: set[int] = set()

    for item in items:
        if item.variant_id is None:
            raise RuntimeError(f"Order item {item.id} has no variant_id")
        variant_ids.add(item.variant_id)

    return _lock_transition_variants(db, variant_ids)


def change_order_status(
    db: Session,
    order_id: int,
    new_status: OrderStatus,
    queue: TaskQueue,
    background_tasks: BackgroundTasks | None = None,
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

    for item in order.items:
        if item.variant_id:
            item.variant = locked_variants.get(item.variant_id)

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
    background_tasks: BackgroundTasks | None = None,
) -> OrderResponse:
    return change_order_status(
        db, order_id, OrderStatus.PAID, queue, background_tasks=background_tasks
    )


def cancel_order(
    db: Session,
    order_id: int,
    queue: TaskQueue,
    background_tasks: BackgroundTasks | None = None,
) -> OrderResponse:
    return change_order_status(
        db, order_id, OrderStatus.CANCELLED, queue, background_tasks=background_tasks
    )


def expire_order(
    db: Session,
    order_id: int,
    queue: TaskQueue,
    background_tasks: BackgroundTasks | None = None,
) -> OrderResponse:
    return change_order_status(
        db, order_id, OrderStatus.EXPIRED, queue, background_tasks=background_tasks
    )


def confirm_cod(
    db: Session,
    order_id: int,
    queue: TaskQueue,
    background_tasks: BackgroundTasks | None = None,
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


def _build_public_tracking_response(order: Order) -> PublicTrackingResponse:
    paid = order.status == OrderStatus.PAID.value or (
        hasattr(order, "status") and order.status == OrderStatus.PAID
    )
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
        vietqr_data = _vietqr_response([order])

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


def track_order_by_public_code(db: Session, public_code: str) -> PublicTrackingResponse:
    order = db.query(Order).filter(Order.public_code == public_code).first()
    if order is None:
        raise OrderNotFoundError("Order not found")
    return _build_public_tracking_response(order)


def track_order_public_by_id(
    db: Session, order_id: int, user: User | None = None
) -> PublicTrackingResponse:
    order = db.get(Order, order_id)
    if order is None or (user and user.role != "admin" and order.user_id != user.id):
        raise OrderNotFoundError("Order not found")
    return _build_public_tracking_response(order)


def track_order(
    db: Session, order_id: int, user: User | None = None
) -> TrackingResponse:
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


def expire_pending_orders(
    db: Session,
    now: datetime | None = None,
    batch_size: int = 50,
) -> int:
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
        .limit(batch_size)
        .all()
    )
    if not candidates:
        return 0

    order_ids = [cid for cid, _ in candidates]

    # 1. Lock inventory FIRST
    locked_variants = _resolve_and_lock_order_inventory(db, order_ids)

    # 2. Lock exact order rows in loop (with skip_locked if supported by dialect)
    supports_skip_locked = bool(
        db.bind and db.bind.dialect.name in ("mysql", "mariadb", "postgresql")
    )
    expired_count = 0
    for order_id, _discovered_product_id in candidates:
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


def _is_payment_transaction_uniqueness_error(exc: IntegrityError) -> bool:
    msg = str(exc).lower()
    return (
        "uq_payments_provider_trans_id" in msg
        or "payments.provider" in msg
        or ("duplicate entry" in msg and "provider" in msg)
        or ("unique constraint failed" in msg and "provider" in msg)
    )


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

    distinct_order_ids = parse_order_ids_from_memo(payload.content)
    if not distinct_order_ids:
        logger.warning(
            "VietQR webhook memo does not match pattern: %s", payload.content
        )
        raise BusinessRuleError("Invalid memo content", code="invalid_webhook_memo")

    if len(distinct_order_ids) > 1:
        raise BusinessRuleError(
            "Multi-order payments are not supported in this version",
            code="unsupported_multi_order_payment",
        )
    order_ids = distinct_order_ids

    existing_payment = (
        db.query(Payment)
        .filter(
            Payment.provider == "vietqr",
            Payment.provider_transaction_id == payload.transaction_id,
        )
        .first()
    )
    if existing_payment:
        if existing_payment.order_id not in order_ids:
            raise BusinessRuleError(
                f"Transaction {payload.transaction_id} is already associated with order {existing_payment.order_id}",
                code="transaction_order_mismatch",
            )
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

    # 1. Lock variants in ascending order first to avoid deadlocks
    locked_variants = _resolve_and_lock_order_inventory(db, order_ids)

    # 2. Lock orders in ascending order with populate_existing and FOR UPDATE
    orders = (
        db.query(Order)
        .filter(Order.id.in_(order_ids))
        .order_by(Order.id.asc())
        .populate_existing()
        .with_for_update()
        .all()
    )
    if len(orders) != len(order_ids):
        raise ResourceNotFoundError(
            "One or more orders in memo not found", code="orders_not_found"
        )

    total_expected = sum(order.total_amount for order in orders)
    if round(float(total_expected)) != round(payload.amount):
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

    # Check under lock whether this transaction was already processed
    existing_payment = (
        db.query(Payment)
        .filter(
            Payment.provider == "vietqr",
            Payment.provider_transaction_id == payload.transaction_id,
        )
        .first()
    )
    if existing_payment:
        if existing_payment.order_id not in order_ids:
            raise BusinessRuleError(
                f"Transaction {payload.transaction_id} is already associated with order {existing_payment.order_id}",
                code="transaction_order_mismatch",
            )
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

    current_time = datetime.now(timezone.utc)
    has_pending = False
    has_late = False
    has_duplicate = False
    all_paid = True

    for order in orders:
        if order.status == OrderStatus.PENDING.value:
            has_pending = True
            all_paid = False
            for item in order.items:
                if item.variant_id:
                    item.variant = locked_variants.get(item.variant_id)
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
        elif order.status == OrderStatus.PAID.value:
            # Order is already paid. Record duplicate payment without re-decrementing stock.
            all_paid = False
            has_duplicate = True
            logger.warning(
                "VietQR webhook received transaction %s for already-paid order %s",
                payload.transaction_id,
                order.id,
            )
            payment = Payment(
                order_id=order.id,
                provider="vietqr",
                provider_transaction_id=payload.transaction_id,
                amount=order.total_amount,
                currency=order.currency,
                status="duplicate_payment",
                paid_at=current_time,
            )
            db.add(payment)
        elif order.status in (OrderStatus.EXPIRED.value, OrderStatus.CANCELLED.value):
            all_paid = False
            has_late = True
            logger.warning(
                "VietQR webhook received for %s order %s (amount=%s, transaction_id=%s)",
                order.status,
                order.id,
                payload.amount,
                payload.transaction_id,
            )
            payment = Payment(
                order_id=order.id,
                provider="vietqr",
                provider_transaction_id=payload.transaction_id,
                amount=order.total_amount,
                currency=order.currency,
                status="late_payment",
                paid_at=current_time,
            )
            db.add(payment)
        else:
            raise BusinessRuleError(
                f"Cannot process payment for order {order.id} in status '{order.status}'",
                code="invalid_payment_order_status",
            )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _is_payment_transaction_uniqueness_error(exc):
            fresh_payment = (
                db.query(Payment)
                .filter(
                    Payment.provider == "vietqr",
                    Payment.provider_transaction_id == payload.transaction_id,
                )
                .first()
            )
            if fresh_payment:
                if fresh_payment.order_id in order_ids:
                    logger.info(
                        "Resolved uniqueness conflict on transaction %s for order %s",
                        payload.transaction_id,
                        fresh_payment.order_id,
                    )
                    return VietQRWebhookResponse(
                        status="already_processed",
                        message="Transaction already processed",
                        order_ids=order_ids,
                    )
                raise BusinessRuleError(
                    f"Transaction {payload.transaction_id} is already associated with order {fresh_payment.order_id}",
                    code="transaction_order_mismatch",
                )
        logger.error("Unhandled IntegrityError during VietQR webhook: %s", exc)
        raise

    if has_duplicate and not has_pending:
        return VietQRWebhookResponse(
            status="duplicate_payment",
            message="Order has already been paid; recorded as duplicate payment",
            order_ids=order_ids,
        )
    if has_late and not has_pending:
        return VietQRWebhookResponse(
            status="late_payment",
            message="Order is expired or cancelled; recorded as late payment",
            order_ids=order_ids,
        )
    if all_paid:
        return VietQRWebhookResponse(
            status="already_processed",
            message="Order has already been paid",
            order_ids=order_ids,
        )
    return VietQRWebhookResponse(
        status="success",
        message="Payment processed successfully",
        order_ids=order_ids,
    )


def list_late_payments(
    db: Session,
    limit: int = 10,
    offset: int = 0,
) -> Page[LatePaymentResponse]:
    query = (
        db.query(Payment, Order)
        .join(Order, Payment.order_id == Order.id)
        .filter(Payment.status == "late_payment")
        .order_by(Payment.id.desc())
    )
    total = query.count()
    results = query.offset(offset).limit(limit).all()

    items = [
        LatePaymentResponse(
            id=payment.id,
            order_id=payment.order_id,
            provider=payment.provider,
            provider_transaction_id=payment.provider_transaction_id,
            amount=float(payment.amount),
            currency=payment.currency,
            status=payment.status,
            paid_at=payment.paid_at,
            created_at=payment.created_at,
            order_status=order.status,
            customer_name=order.customer_name,
            customer_phone=order.customer_phone,
        )
        for payment, order in results
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)
