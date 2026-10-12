import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.features.orders.model import Order
from app.features.orders.schemas import CheckoutCommand
from app.features.orders.service import InsufficientStockError, checkout_cart
from app.features.products.model import Product
from app.features.users.model import User

pytestmark = pytest.mark.integration


def test_checkout_final_unit_cannot_be_oversold():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required")

    engine = create_engine(database_url, pool_pre_ping=True)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    setup_session = session_factory()
    suffix = uuid4().hex
    user = User(
        username=f"concurrency-{suffix}",
        email=f"concurrency-{suffix}@example.com",
        password_hash="unused",
        role="customer",
    )
    product = Product(
        name=f"Final unit {suffix}", price=100, currency="VND", stock_quantity=1
    )
    setup_session.add_all([user, product])
    setup_session.commit()
    user_id = user.id
    product_id = product.id
    setup_session.close()

    checkout = CheckoutCommand(
        items=[{"product_id": product_id, "quantity": 1}],
        customer_name="Concurrent Buyer",
        customer_phone="0123456789",
        shipping_address="123 Concurrency Street",
        payment_method="vietqr",
    )
    barrier = Barrier(2)

    def run_checkout():
        session = session_factory()
        try:
            current_user = session.get(User, user_id)
            barrier.wait()
            asyncio.run(checkout_cart(session, current_user, checkout, AsyncMock()))
            return "success"
        except InsufficientStockError:
            session.rollback()
            return "conflict"
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: run_checkout(), range(2)))

    verify_session = session_factory()
    final_product = verify_session.get(Product, product_id)
    order_count = (
        verify_session.query(Order).filter(Order.product_id == product_id).count()
    )
    assert sorted(results) == ["conflict", "success"]
    assert order_count == 1
    assert final_product.reserved_quantity == 1
    assert final_product.sold_quantity == 0
    verify_session.close()
