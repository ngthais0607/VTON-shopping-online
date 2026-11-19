import hmac
import logging
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import (
    AuthenticationError,
    BusinessRuleError,
    ResourceNotFoundError,
)
from app.core.schemas import Page
from app.features.orders.constants import OrderStatus
from app.features.orders.domain import (
    is_order_paid,
)
from app.features.orders.model import Order, Payment
from app.features.orders.schemas import (
    LatePaymentResponse,
    VietQRWebhookPayload,
    VietQRWebhookResponse,
)
from app.features.orders.transitions import (
    _record_paid,
    _resolve_and_lock_order_inventory,
)
from app.features.orders.vietqr_memo import parse_order_ids_from_memo
from app.integrations.vietqr import to_vnd_amount

logger = logging.getLogger(__name__)


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

    if (
        payload.account_number is not None
        and payload.account_number != settings.vietqr_account_no
    ):
        raise BusinessRuleError(
            "Webhook recipient account does not match the configured account",
            code="account_mismatch",
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
    total_expected = sum(order.total_amount for order in orders)
    if to_vnd_amount(total_expected) != to_vnd_amount(payload.amount):
        db.add(
            Payment(
                order_id=orders[0].id,
                provider="vietqr",
                provider_transaction_id=payload.transaction_id,
                amount=payload.amount,
                currency=orders[0].currency,
                status="amount_mismatch",
                paid_at=payload.transacted_at or current_time,
            )
        )
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            if not _is_payment_transaction_uniqueness_error(exc):
                raise
            recorded = (
                db.query(Payment)
                .filter_by(
                    provider="vietqr", provider_transaction_id=payload.transaction_id
                )
                .first()
            )
            if recorded is None:
                raise
            if recorded.order_id not in order_ids:
                raise BusinessRuleError(
                    "Transaction is already associated with another order",
                    code="transaction_order_mismatch",
                ) from exc
            return VietQRWebhookResponse(
                status="already_processed",
                message="Transaction already recorded",
                order_ids=order_ids,
            )
        return VietQRWebhookResponse(
            status="amount_mismatch",
            message="Received amount recorded for manual reconciliation",
            order_ids=order_ids,
        )
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
            _record_paid(db, order, "vietqr", payload.transaction_id, current_time)
        elif order.status not in (
            OrderStatus.EXPIRED.value,
            OrderStatus.CANCELLED.value,
        ) and is_order_paid(order):
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
        .filter(
            Payment.status.in_(("late_payment", "duplicate_payment", "amount_mismatch"))
        )
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
