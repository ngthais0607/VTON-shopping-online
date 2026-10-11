import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user
from app.features.orders import schema
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.model import Order
from app.features.orders.service import (
    InsufficientStockError,
    InvalidCartItemError,
    InvalidOrderTransition,
    ProductNotFoundError,
    create_cart_orders,
    transition_order,
)
from app.features.users.model import User
from app.integrations.queue import get_task_queue
from app.integrations.vietqr import generate_vietqr_url, get_vietqr_bank_config

logger = logging.getLogger(__name__)


async def enqueue_task(task_name: str, *args: object) -> None:
    await get_task_queue().enqueue(task_name, *args)


router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post(
    "/checkout-cart",
    status_code=status.HTTP_201_CREATED,
    summary="Checkout multi-item cart",
)
async def checkout_cart(
    checkout_data: schema.CheckoutCartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not checkout_data.items:
        raise HTTPException(status_code=400, detail="Cart items cannot be empty")

    try:
        created_orders = create_cart_orders(db, current_user, checkout_data)
    except InvalidCartItemError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ProductNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InsufficientStockError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    db.commit()
    for o in created_orders:
        db.refresh(o)
        try:
            await enqueue_task("send_order_confirmation_email_task", o.id)
        except Exception:
            logger.exception("Failed to enqueue confirmation email for order %s", o.id)

    total_amount = sum(order.total_amount for order in created_orders)
    response = {
        "message": "Checkout created successfully",
        "orders": [order_to_json(o) for o in created_orders],
        "total_amount": total_amount,
        "payment_method": checkout_data.payment_method,
    }
    if checkout_data.payment_method == OrderPaymentMethod.VIETQR:
        order_ids_str = "_".join(str(order.id) for order in created_orders)
        memo = f"LUXESTORE_{order_ids_str}"
        bank_config = get_vietqr_bank_config()
        vietqr_url = generate_vietqr_url(
            bank_id=bank_config["bank_id"],
            account_no=bank_config["account_no"],
            account_name=bank_config["account_name"],
            amount=total_amount,
            memo=memo,
        )
        response["vietqr"] = {
            "qr_url": vietqr_url,
            "bank_id": bank_config["bank_id"],
            "bank_name": bank_config["bank_name"],
            "account_no": bank_config["account_no"],
            "account_name": bank_config["account_name"],
            "memo": memo,
            "amount": total_amount,
        }
    return response


def order_to_json(order: Order):
    payment = order.payments[-1] if order.payments else None
    if payment:
        payment_status = payment.status
    elif order.status == "paid":
        payment_status = "paid"
    elif order.status == "expired":
        payment_status = "failed"
    else:
        payment_status = "pending"

    return {
        "id": order.id,
        "user_id": order.user_id,
        "product_id": order.product_id,
        "product_name": order.product_name,
        "unit_price": order.unit_price,
        "quantity": order.quantity,
        "total_amount": order.total_amount,
        "total": order.total_amount,
        "currency": order.currency,
        "status": order.status,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "shipping_address": order.shipping_address,
        "notes": order.notes,
        "payment_method": order.payment_method,
        "payment_status": payment_status,
        "expires_at": order.expires_at,
        "paid_at": order.paid_at,
        "created_at": order.created_at,
    }


@router.get("/", summary="Get all orders")
def get_orders(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    orders = (
        db.query(Order)
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [order_to_json(order) for order in orders]


@router.get("/{order_id:int}", summary="Get order by ID")
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.role != "admin" and order.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="You do not have permission to access this order"
        )
    return order_to_json(order)


@router.put("/{order_id}/status", summary="Update order status")
async def update_order_status(
    order_id: int,
    status_data: schema.OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    order = db.query(Order).filter(Order.id == order_id).with_for_update().first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    new_status = status_data.status
    try:
        transition_order(order, new_status)
    except InvalidOrderTransition as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    db.commit()
    db.refresh(order)

    if new_status == OrderStatus.PAID:
        try:
            await enqueue_task("send_payment_received_email_task", order.id)
        except Exception:
            logger.exception("Failed to enqueue payment email for order %s", order.id)

    return order_to_json(order)


@router.get("/user/{user_id}", summary="Get orders by user ID")
def get_orders_by_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(
            status_code=403, detail="You do not have permission to access these orders"
        )
    orders = (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .order_by(Order.created_at.desc())
        .all()
    )

    return [order_to_json(order) for order in orders]


@router.get("/track/{order_id}", summary="Track order status by order ID")
def track_order_public(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or (current_user.role != "admin" and order.user_id != current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found"
        )

    steps = [
        {
            "step": 1,
            "title": "Order Placed",
            "description": "Order submitted and awaiting payment confirmation.",
            "completed": True,
            "timestamp": order.created_at,
        },
        {
            "step": 2,
            "title": "Payment Verified",
            "description": "VietQR bank transfer verified by an administrator.",
            "completed": order.status == "paid",
            "timestamp": order.paid_at if order.status == "paid" else None,
        },
        {
            "step": 3,
            "title": "Processing & Packing",
            "description": "Item certified and packed for express dispatch.",
            "completed": order.status == "paid",
            "timestamp": None,
        },
        {
            "step": 4,
            "title": "Delivered",
            "description": "Order fulfilled and delivered to recipient.",
            "completed": False,
            "timestamp": None,
        },
    ]

    res = order_to_json(order)
    if order.payment_method == OrderPaymentMethod.VIETQR:
        bank_config = get_vietqr_bank_config()
        memo = f"LUXESTORE_{order.id}"
        vietqr_url = generate_vietqr_url(
            bank_id=bank_config["bank_id"],
            account_no=bank_config["account_no"],
            account_name=bank_config["account_name"],
            amount=order.total_amount,
            memo=memo,
        )
        res["vietqr"] = {
            "qr_url": vietqr_url,
            "bank_id": bank_config["bank_id"],
            "bank_name": bank_config["bank_name"],
            "account_no": bank_config["account_no"],
            "account_name": bank_config["account_name"],
            "memo": memo,
            "amount": order.total_amount,
        }
    res["timeline"] = steps
    return res
