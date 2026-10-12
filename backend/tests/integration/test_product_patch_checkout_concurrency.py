"""MariaDB gate for product PATCH racing the cart's final unit."""

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.features.orders.schemas import CheckoutCommand
from app.features.orders.service import InsufficientStockError, checkout_cart
from app.features.products.model import Product
from app.features.products.schemas import ProductPatch
from app.features.products.service import update_product
from app.features.users.model import User

pytestmark = pytest.mark.integration


def test_product_patch_serializes_with_checkout():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required")

    engine = create_engine(database_url, pool_pre_ping=True)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    suffix = uuid4().hex
    with sessions() as setup:
        user = User(
            username=f"patch-{suffix}",
            email=f"patch-{suffix}@example.com",
            password_hash="unused",
        )
        product = Product(
            name=f"Patch race {suffix}", price=10, currency="VND", stock_quantity=1
        )
        setup.add_all([user, product])
        setup.commit()
        user_id, product_id = user.id, product.id

    patch_locked = Event()
    checkout_reading = Event()

    def patch():
        with sessions() as session:

            def hold_after_lock(
                _conn, _cursor, statement, _parameters, _context, _executemany
            ):
                if (
                    "FOR UPDATE" in statement.upper()
                    and "products" in statement.lower()
                ):
                    patch_locked.set()
                    assert checkout_reading.wait(10), (
                        "checkout did not reach product read"
                    )

            event.listen(session.bind, "after_cursor_execute", hold_after_lock)
            try:
                update_product(session, product_id, ProductPatch(stock_quantity=0))
            finally:
                event.remove(session.bind, "after_cursor_execute", hold_after_lock)

    def checkout():
        assert patch_locked.wait(10), "PATCH did not acquire its product lock"
        with sessions() as session:
            user = session.get(User, user_id)
            command = CheckoutCommand(
                items=[{"product_id": product_id, "quantity": 1}],
                customer_name="Buyer",
                customer_phone="123",
                shipping_address="Home",
                payment_method="vietqr",
            )

            def signal_read(state):
                if state.is_select and state.bind_mapper.class_ is Product:
                    checkout_reading.set()

            event.listen(session, "do_orm_execute", signal_read)
            try:
                with pytest.raises(InsufficientStockError):
                    asyncio.run(checkout_cart(session, user, command, AsyncMock()))
            finally:
                event.remove(session, "do_orm_execute", signal_read)

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            patch_future = executor.submit(patch)
            checkout_future = executor.submit(checkout)
            patch_future.result(timeout=20)
            checkout_future.result(timeout=20)
        with sessions() as verify:
            current = verify.get(Product, product_id)
            assert (current.stock_quantity, current.reserved_quantity) == (0, 0)
    finally:
        engine.dispose()
