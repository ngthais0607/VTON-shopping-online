from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query 
from sqlalchemy.orm import Session
from app.features.orders import schema
from app.features.orders.model import Order, Payment 
from app.features.products.model import Product
from app.core.database import get_db, save_to_db
from app.core.security import get_current_user, get_current_admin
from app.features.users.model import User
from app.integrations.vietqr import generate_vietqr_url, get_vietqr_bank_config
from app.core.queue import enqueue_task

router = APIRouter(
    prefix="/orders",
    tags=["Orders"]
)

@router.post(
    "/checkout-cart",
    status_code=status.HTTP_201_CREATED,
    summary="Checkout multi-item cart"
)
async def checkout_cart(
    checkout_data: schema.CheckoutCartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not checkout_data.items:
        raise HTTPException(
            status_code=400,
            detail="Cart items cannot be empty"
        )

    created_orders: List[Order] = []
    total_amount = 0.0

    # Verify stock for all items first
    for item in checkout_data.items:
        if item.quantity <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid quantity {item.quantity} for product ID {item.product_id}"
            )
        product = db.query(Product).filter(
            Product.id == item.product_id,
            Product.is_deleted == False,
            Product.is_active == True
        ).first()

        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Product ID {item.product_id} not found"
            )

        available_stock = product.stock_quantity - product.reserved_quantity - product.sold_quantity
        if available_stock < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock available for product '{product.name}'. Requested: {item.quantity}, Available: {available_stock}"
            )

    # Process order creation
    for item in checkout_data.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            continue
        item_total = product.price * item.quantity
        total_amount += item_total

        new_order = Order(
            user_id=current_user.id,
            product_id=product.id,
            product_name=product.name,
            unit_price=product.price,
            quantity=item.quantity,
            total_amount=item_total,
            currency=product.currency,
            status="pending",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)
        )

        product.reserved_quantity += item.quantity
        db.add(new_order)
        created_orders.append(new_order)

    db.commit()
    for o in created_orders:
        db.refresh(o)
        await enqueue_task("send_order_confirmation_email_task", o.id)

    order_ids_str = "_".join(str(o.id) for o in created_orders)
    memo = f"LUXESTORE_{order_ids_str}"
    
    bank_config = get_vietqr_bank_config()
    vietqr_url = generate_vietqr_url(
        bank_id=bank_config["bank_id"],
        account_no=bank_config["account_no"],
        account_name=bank_config["account_name"],
        amount=total_amount,
        memo=memo
    )

    return {
        "message": "Checkout created successfully",
        "orders": [order_to_json(o) for o in created_orders],
        "total_amount": total_amount,
        "payment_method": checkout_data.payment_method,
        "vietqr": {
            "qr_url": vietqr_url,
            "bank_id": bank_config["bank_id"],
            "bank_name": bank_config["bank_name"],
            "account_no": bank_config["account_no"],
            "account_name": bank_config["account_name"],
            "memo": memo,
            "amount": total_amount
        }
    }

def expire_order_if_needed(order: Order) -> bool:
    if order.status != "pending":
        return False
    
    if not order.expires_at:
        return False
    
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    if now_naive < order.expires_at:
        return False
    
    product = order.product
    if product:
        product.reserved_quantity = max(0, product.reserved_quantity - order.quantity)
    order.status = "expired"

    for payment in order.payments:
        if payment.status == "pending":
            payment.status = "expired"
    return True

def order_to_json(order: Order):
    payment = order.payments[-1] if order.payments else None
    if payment:
        payment_status = payment.status
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
        "payment_status": payment_status,
        "expires_at": order.expires_at,
        "paid_at": order.paid_at,
        "created_at": order.created_at,
    }

@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    summary="Create order"
)
def create_order(
    order_data: schema.OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if order_data.quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity must be greater than 0"
        )
   
    product = db.query(Product).filter(
        Product.id == order_data.product_id,
        Product.is_deleted == False,
        Product.is_active == True
    ).first()
   
    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )
   
    available_stock = product.stock_quantity - product.reserved_quantity - product.sold_quantity

    if available_stock < order_data.quantity:
        raise HTTPException(
            status_code=400,
            detail="Not enough stock available"
        )

    total_amount = product.price * order_data.quantity

    new_order = Order(
        user_id=current_user.id,
        product_id=product.id,
        product_name=product.name,
        unit_price=product.price,
        quantity=order_data.quantity,
        total_amount=total_amount,
        currency=product.currency,
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15)
    )
   
    product.reserved_quantity += order_data.quantity
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    return order_to_json(new_order)

@router.get(
    "/",
    summary="Get all orders"
)
def get_orders(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    orders = db.query(Order).order_by(Order.created_at.desc()).offset(offset).limit(limit).all()
    return [order_to_json(order) for order in orders]

@router.get(
    "/{order_id}",
    summary="Get order by ID"
)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = db.query(Order).filter(
        Order.id == order_id
    ).first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )
    if current_user.role != "admin" and order.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access this order"
        )
    return order_to_json(order)

@router.post(
    "/{order_id}/expire",
    summary="Expire an order"
)
def expire_order(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(
        Order.id == order_id
    ).first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )
    
    expired = expire_order_if_needed(order)
    if not expired:
        return {
            "message": "Order is not expired",
            "order": order_to_json(order)
        }
    db.commit()
    return {
        "message": "Order expired successfully",
        "order": order_to_json(order)
    }

@router.put("/{order_id}/status", summary="Update order status")
async def update_order_status(
    order_id: int,
    status_data: schema.OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    order = db.query(Order).filter(
        Order.id == order_id
    ).first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    old_status = order.status
    new_status = status_data.status.lower()

    if old_status == new_status:
        return order_to_json(order)
    
    product = order.product

    if new_status == "paid":
        if old_status == "pending" and product:
            product.reserved_quantity = max(0, product.reserved_quantity - order.quantity)
        if product:
            product.sold_quantity += order.quantity
        order.paid_at = datetime.now(timezone.utc)
    elif new_status == "cancelled":
        if old_status == "pending" and product:
            product.reserved_quantity = max(0, product.reserved_quantity - order.quantity)
        elif old_status == "paid" and product:
            product.sold_quantity = max(0, product.sold_quantity - order.quantity)
    elif new_status == "pending" and old_status != "pending":
        if product:
            product.reserved_quantity += order.quantity
        if old_status == "paid" and product:
            product.sold_quantity = max(0, product.sold_quantity - order.quantity)
    
    order.status = new_status
    db.commit()
    db.refresh(order)

    if new_status == "paid":
        await enqueue_task("send_payment_received_email_task", order.id)

    return order_to_json(order)


@router.get(
    "/user/{user_id}",
    summary="Get orders by user ID"
)
def get_orders_by_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access these orders"
        )
    orders = db.query(Order).filter(
        Order.user_id == user_id
    ).order_by(Order.created_at.desc()).all()

    return [order_to_json(order) for order in orders]


@router.get(
    "/track/{order_id}",
    summary="Track order status publicly by order ID"
)
def track_order_public(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    expire_order_if_needed(order)

    bank_config = get_vietqr_bank_config()
    memo = f"LUXESTORE_{order.id}"
    vietqr_url = generate_vietqr_url(
        bank_id=bank_config["bank_id"],
        account_no=bank_config["account_no"],
        account_name=bank_config["account_name"],
        amount=order.total_amount,
        memo=memo
    )

    steps = [
        {
            "step": 1,
            "title": "Order Placed",
            "description": "Order submitted and awaiting payment confirmation.",
            "completed": True,
            "timestamp": order.created_at
        },
        {
            "step": 2,
            "title": "Payment Verified",
            "description": "Automated VietQR bank transfer reconciled successfully.",
            "completed": order.status == "paid",
            "timestamp": order.paid_at if order.status == "paid" else None
        },
        {
            "step": 3,
            "title": "Processing & Packing",
            "description": "Item certified and packed for express dispatch.",
            "completed": order.status == "paid",
            "timestamp": None
        },
        {
            "step": 4,
            "title": "Delivered",
            "description": "Order fulfilled and delivered to recipient.",
            "completed": False,
            "timestamp": None
        }
    ]

    res = order_to_json(order)
    res["vietqr"] = {
        "qr_url": vietqr_url,
        "bank_id": bank_config["bank_id"],
        "bank_name": bank_config["bank_name"],
        "account_no": bank_config["account_no"],
        "account_name": bank_config["account_name"],
        "memo": memo,
        "amount": order.total_amount
    }
    res["timeline"] = steps
    return res


@router.post(
    "/vietqr-webhook",
    summary="VietQR bank transfer webhook listener for automated payment reconciliation"
)
async def vietqr_webhook(
    payload: schema.VietQRWebhookPayload,
    db: Session = Depends(get_db)
):
    import re
    order_ids = [int(num) for num in re.findall(r'\d+', payload.content)]
    reconciled_ids = []

    for oid in order_ids:
        order = db.query(Order).filter(Order.id == oid).first()
        if order and order.status == "pending":
            product = order.product
            if product:
                product.reserved_quantity = max(0, product.reserved_quantity - order.quantity)
                product.sold_quantity += order.quantity
            
            order.status = "paid"
            order.paid_at = datetime.now(timezone.utc)

            payment = Payment(
                order_id=order.id,
                provider="vietqr",
                provider_transaction_id=payload.transaction_id or f"TXN_{order.id}",
                amount=order.total_amount,
                currency=order.currency,
                status="paid",
                paid_at=datetime.now(timezone.utc)
            )
            db.add(payment)
            reconciled_ids.append(order.id)
            await enqueue_task("send_payment_received_email_task", order.id)

    db.commit()
    return {
        "status": "success",
        "message": f"Successfully reconciled {len(reconciled_ids)} orders",
        "reconciled_orders": reconciled_ids
    }