from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.schemas import Page
from app.core.security import get_current_admin, get_current_user
from app.features.orders import service
from app.features.orders.schemas import (
    CheckoutCommand,
    CheckoutResponse,
    OrderPatchStatus,
    OrderResponse,
    TrackingResponse,
)
from app.features.users.model import User
from app.integrations.queue import TaskQueue, get_task_queue

router = APIRouter(prefix="/api/v1/orders", tags=["Orders"])


@router.post(
    "/checkout-cart",
    response_model=CheckoutResponse,
    response_model_exclude_unset=True,
    status_code=status.HTTP_201_CREATED,
    summary="Checkout multi-item cart",
)
async def checkout_cart(
    command: CheckoutCommand,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    queue: TaskQueue = Depends(get_task_queue),
):
    return await service.checkout_cart(db, current_user, command, queue)


@router.get("", response_model=Page[OrderResponse], summary="Get all orders")
def get_orders(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    return service.list_orders(db, limit, offset)


@router.get("/{order_id:int}", response_model=OrderResponse, summary="Get order by ID")
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_order_for_user(db, order_id, current_user)


@router.put(
    "/{order_id}/status",
    response_model=OrderResponse,
    summary="Update order status",
)
async def update_order_status(
    order_id: int,
    command: OrderPatchStatus,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
    queue: TaskQueue = Depends(get_task_queue),
):
    return await service.change_order_status(db, order_id, command.status, queue)


@router.get(
    "/user/{user_id}",
    response_model=list[OrderResponse],
    summary="Get orders by user ID",
)
def get_orders_by_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_user_orders(db, user_id, current_user)


@router.get(
    "/track/{order_id}",
    response_model=TrackingResponse,
    response_model_exclude_unset=True,
    summary="Track order status by order ID",
)
def track_order_public(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.track_order(db, order_id, current_user)
