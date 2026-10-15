import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.features.orders.model import Order, OrderItem
from app.features.orders.schemas import CheckoutCommand
from app.features.orders.service import InsufficientStockError, checkout_cart
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
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
        name=f"Final unit {suffix}",
        slug=f"final-unit-{suffix}",
        price=100,
        currency="VND",
    )
    setup_session.add_all([user, product])
    setup_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"FINAL-{suffix}",
        size="M",
        color_name="Black",
        stock_quantity=1,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    setup_session.add(variant)
    setup_session.commit()

    user_id = user.id
    variant_id = variant.id
    setup_session.close()

    checkout = CheckoutCommand(
        items=[{"variant_id": variant_id, "quantity": 1}],
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
            checkout_cart(
                session,
                current_user,
                checkout,
                AsyncMock(),
                background_tasks=BackgroundTasks(),
            )
            return "success"
        except InsufficientStockError:
            session.rollback()
            return "conflict"
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: run_checkout(), range(2)))

    verify_session = session_factory()
    final_variant = verify_session.get(ProductVariant, variant_id)
    order_count = (
        verify_session.query(OrderItem)
        .filter(OrderItem.variant_id == variant_id)
        .count()
    )
    assert sorted(results) == ["conflict", "success"]
    assert order_count == 1
    assert final_variant.reserved_quantity == 1
    assert final_variant.sold_quantity == 0
    verify_session.close()


def test_multi_item_checkout_atomicity_under_concurrency():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required")

    engine = create_engine(database_url, pool_pre_ping=True)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    setup_session = session_factory()
    suffix = uuid4().hex
    user = User(
        username=f"multi-concurrency-{suffix}",
        email=f"multi-concurrency-{suffix}@example.com",
        password_hash="unused",
        role="customer",
    )
    product_a = Product(
        name=f"Limited item {suffix}",
        slug=f"limited-item-{suffix}",
        price=50,
        currency="VND",
    )
    product_b = Product(
        name=f"Abundant item {suffix}",
        slug=f"abundant-item-{suffix}",
        price=30,
        currency="VND",
    )
    setup_session.add_all([user, product_a, product_b])
    setup_session.flush()

    variant_a = ProductVariant(
        product_id=product_a.id,
        sku=f"SKU-A-{suffix}",
        size="M",
        color_name="Black",
        stock_quantity=1,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    variant_b = ProductVariant(
        product_id=product_b.id,
        sku=f"SKU-B-{suffix}",
        size="L",
        color_name="White",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    setup_session.add_all([variant_a, variant_b])
    setup_session.commit()

    user_id = user.id
    vid_a = variant_a.id
    vid_b = variant_b.id
    setup_session.close()

    checkout = CheckoutCommand(
        items=[
            {"variant_id": vid_a, "quantity": 1},
            {"variant_id": vid_b, "quantity": 2},
        ],
        customer_name="Multi Item Buyer",
        customer_phone="0987654321",
        shipping_address="456 Multi Cart Ave",
        payment_method="vietqr",
    )
    barrier = Barrier(2)

    def run_checkout():
        session = session_factory()
        try:
            current_user = session.get(User, user_id)
            barrier.wait()
            checkout_cart(
                session,
                current_user,
                checkout,
                AsyncMock(),
                background_tasks=BackgroundTasks(),
            )
            return "success"
        except InsufficientStockError:
            session.rollback()
            return "conflict"
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: run_checkout(), range(2)))

    assert sorted(results) == ["conflict", "success"]

    verify_session = session_factory()
    final_a = verify_session.get(ProductVariant, vid_a)
    final_b = verify_session.get(ProductVariant, vid_b)

    # Variant A: 1 reserved, 0 available
    assert final_a.reserved_quantity == 1
    # Variant B: 2 reserved, 8 available (NOT 4 reserved from a partial reservation leak!)
    assert final_b.reserved_quantity == 2

    # Exactly 1 order created, with 2 order items
    orders = verify_session.query(Order).filter(Order.user_id == user_id).all()
    assert len(orders) == 1
    order = orders[0]
    assert len(order.items) == 2
    verify_session.close()
