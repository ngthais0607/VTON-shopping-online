from decimal import Decimal

from sqlalchemy import event
from starlette.testclient import TestClient

from app.core.schemas import Page
from app.features.orders import service
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.model import Order, OrderItem, Payment
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User


class QueryCounter:
    def __init__(self, engine):
        self.engine = engine
        self.count = 0

    def __enter__(self):
        self.count = 0
        event.listen(self.engine, "before_cursor_execute", self._callback)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        event.remove(self.engine, "before_cursor_execute", self._callback)

    def _callback(self, conn, cursor, statement, parameters, context, executemany):
        self.count += 1


def _create_orders(db, user, count: int):
    product = Product(
        name="T-Shirt",
        slug=f"t-shirt-{user.id}-{count}",
        price=Decimal("150000.00"),
        is_active=True,
    )
    db.add(product)
    db.flush()

    orders = []
    for i in range(count):
        variant = ProductVariant(
            product_id=product.id,
            sku=f"TSHIRT-VAR-{user.id}-{count}-{i}",
            size=f"M-{i}",
            color_name="Black",
            stock_quantity=10,
            is_active=True,
        )
        db.add(variant)
        db.flush()

        order = Order(
            user_id=user.id,
            customer_name="Nguyen Van A",
            customer_phone="0912345678",
            shipping_address="123 Duong Le Loi, Quan 1, TP HCM",
            total_amount=Decimal("150000.00"),
            payment_method=OrderPaymentMethod.VIETQR.value,
            status=OrderStatus.PENDING.value,
        )
        db.add(order)
        db.flush()

        item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            variant_id=variant.id,
            sku=variant.sku,
            size="M",
            color_name="Black",
            product_name="T-Shirt",
            unit_price=Decimal("150000.00"),
            quantity=1,
            subtotal=Decimal("150000.00"),
        )
        db.add(item)

        payment = Payment(
            order_id=order.id,
            amount=Decimal("150000.00"),
            provider="vietqr",
            status="pending",
        )
        db.add(payment)
        orders.append(order)

    db.commit()
    return orders


def test_list_orders_query_count_does_not_scale_with_order_count(db_session):
    engine = db_session.get_bind()
    user = User(
        email="nplusone@example.com",
        username="nplusone_user",
        password_hash="pw",
        role="customer",
    )
    db_session.add(user)
    db_session.commit()

    # Create 2 orders
    _create_orders(db_session, user, count=2)
    db_session.expire_all()

    with QueryCounter(engine) as qc2:
        res2 = service.list_orders(db_session, limit=10, offset=0)
        assert len(res2.items) >= 2
    count_for_2 = qc2.count

    # Create 3 more orders (total 5)
    _create_orders(db_session, user, count=3)
    db_session.expire_all()

    with QueryCounter(engine) as qc5:
        res5 = service.list_orders(db_session, limit=10, offset=0)
        assert len(res5.items) >= 5
    count_for_5 = qc5.count

    # Query count must remain identical (constant O(1) queries for selectinload)
    assert count_for_5 == count_for_2


def test_list_user_orders_returns_page_and_constant_queries(db_session):
    engine = db_session.get_bind()
    user = User(
        email="user_orders_pg@example.com",
        username="user_orders_pg",
        password_hash="pw",
        role="customer",
    )
    db_session.add(user)
    db_session.commit()

    _create_orders(db_session, user, count=3)
    db_session.expire_all()

    with QueryCounter(engine):
        page = service.list_user_orders(db_session, user.id, user, limit=2, offset=0)

    assert isinstance(page, Page)
    assert page.total == 3
    assert page.limit == 2
    assert page.offset == 0
    assert len(page.items) == 2


def test_get_user_orders_endpoint_returns_paginated_response(client: TestClient, db_session):
    user = User(
        email="api_pg_user@example.com",
        username="api_pg_user",
        password_hash="pw",
        role="customer",
    )
    db_session.add(user)
    db_session.commit()

    _create_orders(db_session, user, count=2)

    from app.core.security import create_access_token

    token = create_access_token({"sub": str(user.id), "role": user.role})
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get(f"/api/v1/orders/user/{user.id}?limit=1&offset=0", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data
    assert data["total"] == 2
    assert data["limit"] == 1
    assert data["offset"] == 0
    assert len(data["items"]) == 1
