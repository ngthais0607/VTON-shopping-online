import asyncio
import os
import time
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.core.security import create_access_token
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User
from app.main import app

pytestmark = pytest.mark.integration


def _session_factory():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for integration db lock test")
    engine = create_engine(database_url, pool_pre_ping=True)
    return engine, sessionmaker(bind=engine, expire_on_commit=False)


def _setup_product_and_user(session_factory):
    session = session_factory()
    suffix = uuid4().hex[:8]
    user = User(
        username=f"buyer-{suffix}",
        email=f"buyer-{suffix}@example.com",
        password_hash="unused",
        role="customer",
    )
    product = Product(
        name=f"EventLoop Product {suffix}",
        slug=f"el-prod-{suffix}",
        price=Decimal("100000.00"),
        currency="VND",
        is_active=True,
    )
    session.add_all([user, product])
    session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"EL-{suffix}",
        size="M",
        color_name="Black",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    session.add(variant)
    session.commit()
    u_id, p_id, v_id = user.id, product.id, variant.id
    session.close()
    return u_id, p_id, v_id


@pytest.mark.asyncio
async def test_event_loop_remains_responsive_during_db_lock_wait(monkeypatch):
    engine, session_factory = _session_factory()
    user_id, product_id, variant_id = _setup_product_and_user(session_factory)

    def independent_database():
        with session_factory() as session:
            yield session

    monkeypatch.setitem(app.dependency_overrides, get_db, independent_database)

    # Temporary lightweight async probe endpoint
    probe_path = f"/api/v1/test-probe-{uuid4().hex[:6]}"

    @app.get(probe_path)
    async def _async_probe():
        return {"probe": "responsive"}

    token = create_access_token({"sub": str(user_id)})
    headers = {"Authorization": f"Bearer {token}"}

    # Open independent raw connection and acquire row lock on product_variant
    conn = engine.connect()
    trans = conn.begin()
    try:
        conn.execute(
            text("SELECT id FROM product_variants WHERE id = :vid FOR UPDATE"),
            {"vid": variant_id},
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Start checkout request in background task (will wait on variant lock in worker thread)
            checkout_payload = {
                "items": [{"variant_id": variant_id, "quantity": 1}],
                "customer_name": "Test User",
                "customer_phone": "0912345678",
                "shipping_address": "123 Street",
                "payment_method": "vietqr",
            }

            checkout_task = asyncio.create_task(
                client.post(
                    "/api/v1/orders/checkout-cart",
                    json=checkout_payload,
                    headers=headers,
                )
            )

            # Wait briefly to ensure checkout request has hit the DB lock
            await asyncio.sleep(0.3)

            # Probe the async event loop while checkout is waiting on DB lock
            t0 = time.monotonic()
            probe_resp = await client.get(probe_path)
            duration = time.monotonic() - t0

            assert probe_resp.status_code == 200
            assert probe_resp.json() == {"probe": "responsive"}
            # The async probe must respond quickly without waiting for the DB lock
            assert duration < 1.0, f"Event loop was blocked! Probe took {duration:.2f}s"

            # Now release the lock
            trans.rollback()
            conn.close()

            # Checkout task should complete
            checkout_resp = await asyncio.wait_for(checkout_task, timeout=5.0)
            assert checkout_resp.status_code in (200, 201)
    finally:
        if not conn.closed:
            trans.rollback()
            conn.close()
        app.router.routes[:] = [
            route
            for route in app.router.routes
            if getattr(route, "path", None) != probe_path
        ]
        engine.dispose()
