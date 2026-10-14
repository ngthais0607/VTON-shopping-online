import inspect
from decimal import Decimal
from unittest.mock import AsyncMock

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.features.orders import router as order_router
from app.features.orders.constants import OrderStatus
from app.features.orders.model import Order, OrderItem
from app.features.orders.schemas import CheckoutCommand
from app.features.orders.service import change_order_status, checkout_cart
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.users import router as user_router
from app.features.users.model import User
from app.features.users.schemas import UserCreate
from app.features.users.service import register_user


def test_db_lock_endpoints_are_synchronous():
    # Endpoints with synchronous DB transactions must be 'def' (not 'async def')
    # so FastAPI executes them in the worker threadpool instead of blocking the main event loop.
    assert not inspect.iscoroutinefunction(order_router.checkout_cart)
    assert not inspect.iscoroutinefunction(order_router.update_order_status)
    assert not inspect.iscoroutinefunction(user_router.register_user)


def test_checkout_enqueue_failure_preserves_order_and_response(db_session: Session):
    user = User(
        username="cartuser",
        email="cartuser@test.com",
        password_hash="pw",
        role="customer",
    )
    prod = Product(
        name="Shirt", slug="shirt", price=Decimal("100"), currency="VND", is_active=True
    )
    db_session.add_all([user, prod])
    db_session.flush()

    variant = ProductVariant(
        product_id=prod.id,
        sku="SHIRT-S",
        color_name="White",
        size="S",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(variant)
    db_session.commit()

    failing_queue = AsyncMock()
    failing_queue.enqueue.side_effect = RuntimeError("Redis broker unreachable")

    bg_tasks = BackgroundTasks()
    command = CheckoutCommand(
        items=[{"variant_id": variant.id, "quantity": 1}],
        customer_name="Cart User",
        customer_phone="0912345678",
        shipping_address="123 Street",
        payment_method="vietqr",
    )

    resp = checkout_cart(
        db_session, user, command, failing_queue, background_tasks=bg_tasks
    )
    assert len(resp.orders) == 1
    order_id = resp.orders[0].id
    assert resp.orders[0].status == "pending"

    # Execute background tasks and ensure exception is caught and logged, not re-raised
    for task in bg_tasks.tasks:
        import asyncio

        asyncio.run(task())

    db_session.expire_all()
    created_order = db_session.get(Order, order_id)
    assert created_order is not None
    assert created_order.status == "pending"


def test_order_status_change_enqueue_failure_preserves_status(db_session: Session):
    prod = Product(
        name="Item", slug="item", price=Decimal("100"), currency="VND", is_active=True
    )
    db_session.add(prod)
    db_session.flush()

    variant = ProductVariant(
        product_id=prod.id,
        sku="ITEM-M",
        color_name="Black",
        size="M",
        stock_quantity=10,
        reserved_quantity=1,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(variant)
    db_session.flush()

    order = Order(
        customer_name="Buyer",
        customer_phone="0912345678",
        shipping_address="123 Street",
        total_amount=Decimal("100"),
        currency="VND",
        status="pending",
        payment_method="vietqr",
    )
    db_session.add(order)
    db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=prod.id,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        product_name=prod.name,
        quantity=1,
        unit_price=Decimal("100"),
        subtotal=Decimal("100"),
    )
    db_session.add(item)
    db_session.commit()

    failing_queue = AsyncMock()
    failing_queue.enqueue.side_effect = RuntimeError("Queue connection timed out")

    bg_tasks = BackgroundTasks()
    updated = change_order_status(
        db_session, order.id, OrderStatus.PAID, failing_queue, background_tasks=bg_tasks
    )
    assert updated.status == "paid"

    for task in bg_tasks.tasks:
        import asyncio

        asyncio.run(task())

    db_session.expire_all()
    refreshed = db_session.get(Order, order.id)
    assert refreshed.status == "paid"


def test_register_user_enqueue_failure_preserves_user(db_session: Session):
    failing_queue = AsyncMock()
    failing_queue.enqueue.side_effect = RuntimeError("Broker connection refused")

    bg_tasks = BackgroundTasks()
    command = UserCreate(
        username="newuser_bg",
        email="newuser_bg@example.com",
        password="ValidPassword123!",
    )

    created_user = register_user(
        db_session, command, failing_queue, background_tasks=bg_tasks
    )
    assert created_user.id is not None
    assert created_user.username == "newuser_bg"

    for task in bg_tasks.tasks:
        import asyncio

        asyncio.run(task())

    db_session.expire_all()
    refreshed = db_session.get(User, created_user.id)
    assert refreshed is not None


def test_background_callbacks_receive_scalar_ids_only(db_session: Session):
    user = User(
        username="cbuser", email="cbuser@test.com", password_hash="pw", role="customer"
    )
    prod = Product(
        name="Jeans", slug="jeans", price=Decimal("200"), currency="VND", is_active=True
    )
    db_session.add_all([user, prod])
    db_session.flush()

    variant = ProductVariant(
        product_id=prod.id,
        sku="JEANS-30",
        color_name="Blue",
        size="30",
        stock_quantity=5,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(variant)
    db_session.commit()

    mock_queue = AsyncMock()
    bg_tasks = BackgroundTasks()
    command = CheckoutCommand(
        items=[{"variant_id": variant.id, "quantity": 1}],
        customer_name="CB User",
        customer_phone="0912345678",
        shipping_address="123 Street",
        payment_method="vietqr",
    )

    checkout_cart(db_session, user, command, mock_queue, background_tasks=bg_tasks)

    # Check arguments in bg_tasks
    assert len(bg_tasks.tasks) == 1
    task = bg_tasks.tasks[0]
    # Task args: (queue, task_name, order_id)
    for arg in task.args:
        # None of the args should be Session or ORM instances
        assert not isinstance(arg, Session)
        assert not isinstance(arg, (User, Product, ProductVariant, Order, OrderItem))
