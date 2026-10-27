from decimal import Decimal

import redis.exceptions
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.rate_limiter import limiter
from app.core.security import hash_password
from app.features.orders.model import Order, OrderItem
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User


def test_rate_limiter_configured_with_resilience():
    assert getattr(limiter, "_swallow_errors", False) is True
    assert getattr(limiter, "_in_memory_fallback_enabled", False) is True


def test_standalone_endpoint_resilience_on_redis_outage(monkeypatch):
    def mock_fail_hit(*args, **kwargs):
        raise redis.exceptions.ConnectionError("Redis connection refused")

    monkeypatch.setattr(limiter._limiter, "hit", mock_fail_hit)

    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.get("/test-resilience")
    @limiter.limit("5/minute")
    def limited_endpoint(request: Request):
        return {"status": "ok"}

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/test-resilience")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_register_route_survives_redis_outage(client, db_session, monkeypatch):
    def mock_fail_hit(*args, **kwargs):
        raise redis.exceptions.ConnectionError("Redis connection refused")

    monkeypatch.setattr(limiter._limiter, "hit", mock_fail_hit)

    response = client.post(
        "/api/v1/users/register",
        json={
            "username": "resilience_user",
            "email": "resilience@example.com",
            "password": "Password123!",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "resilience_user"
    assert data["email"] == "resilience@example.com"


def test_login_route_survives_redis_outage(client, db_session, monkeypatch):
    user = User(
        username="login_resilience",
        email="login_resilience@example.com",
        password_hash=hash_password("Password123!"),
        role="customer",
    )
    db_session.add(user)
    db_session.commit()

    def mock_fail_hit(*args, **kwargs):
        raise redis.exceptions.ConnectionError("Redis connection refused")

    monkeypatch.setattr(limiter._limiter, "hit", mock_fail_hit)

    response = client.post(
        "/api/v1/users/login",
        json={"identifier": "login_resilience", "password": "Password123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data


def test_webhook_route_survives_redis_outage(client, db_session, monkeypatch):
    secret = get_settings().vietqr_webhook_secret

    product = Product(
        name="Resilience Item",
        slug="resilience-item",
        price=Decimal("150000.00"),
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="RES-M",
        size="M",
        color_name="Black",
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
        total_amount=Decimal("150000.00"),
        currency="VND",
        status="pending",
        payment_method="vietqr",
    )
    db_session.add(order)
    db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=product.id,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        product_name=product.name,
        quantity=1,
        unit_price=Decimal("150000.00"),
        subtotal=Decimal("150000.00"),
    )
    db_session.add(item)
    db_session.commit()

    def mock_fail_hit(*args, **kwargs):
        raise redis.exceptions.ConnectionError("Redis connection refused")

    monkeypatch.setattr(limiter._limiter, "hit", mock_fail_hit)

    response = client.post(
        "/api/v1/orders/vietqr-webhook",
        json={
            "transaction_id": "TXN_RESILIENCE_1",
            "amount": 150000.0,
            "content": f"TRUELOOK_{order.id}",
        },
        headers={"X-Webhook-Secret": secret},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_rate_limiting_enforcement_and_memory_fallback():
    # Verify limiter correctly enforces 429 when threshold is reached
    isolated_limiter = Limiter(
        key_func=get_remote_address,
        storage_uri="memory://",
        swallow_errors=True,
        in_memory_fallback_enabled=True,
    )

    app = FastAPI()
    app.state.limiter = isolated_limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.get("/limited")
    @isolated_limiter.limit("2/minute")
    def _endpoint(request: Request):
        return {"ok": True}

    client = TestClient(app)
    assert client.get("/limited").status_code == 200
    assert client.get("/limited").status_code == 200
    # Third request within the minute exceeds limit
    resp3 = client.get("/limited")
    assert resp3.status_code == 429
