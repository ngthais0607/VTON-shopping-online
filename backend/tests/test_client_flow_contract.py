"""Exercise the client contract across real HTTP routes with isolated adapters."""

from unittest.mock import AsyncMock

from app.core.rate_limiter import limiter
from app.core.security import create_access_token
from app.features.users.model import User
from app.integrations.queue import get_task_queue
from app.main import app


def test_customer_checkout_tracking_and_admin_payment_contract(
    client, db_session, monkeypatch
):
    monkeypatch.setattr(limiter, "enabled", False)
    app.dependency_overrides[get_task_queue] = lambda: AsyncMock()
    customer = client.post(
        "/api/v1/users/register",
        json={
            "username": "flow-customer",
            "email": "flow@example.com",
            "password": "FlowTest123!",
        },
    )
    assert customer.status_code == 201
    logged_in = client.post(
        "/api/v1/users/login",
        json={"identifier": "flow@example.com", "password": "FlowTest123!"},
    )
    assert logged_in.status_code == 200
    headers = {"Authorization": f"Bearer {logged_in.json()['access_token']}"}
    admin = User(
        username="flow-admin",
        email="flow-admin@example.com",
        password_hash="unused",
        role="admin",
    )
    db_session.add(admin)
    db_session.commit()
    admin_headers = {
        "Authorization": f"Bearer {create_access_token({'sub': str(admin.id)})}"
    }
    product_ids = []
    for name in ("Flow shirt", "Flow jacket"):
        response = client.post(
            "/api/v1/products",
            headers=admin_headers,
            json={"name": name, "price": 25, "stock_quantity": 3, "currency": "VND"},
        )
        assert response.status_code == 201
        product_ids.append(response.json()["id"])
    checkout = client.post(
        "/api/v1/orders/checkout-cart",
        headers=headers,
        json={
            "items": [
                {"product_id": product_id, "quantity": 1} for product_id in product_ids
            ],
            "customer_name": "Flow Customer",
            "customer_phone": "0987654321",
            "shipping_address": "123 Test Street",
            "payment_method": "cod",
        },
    )
    assert checkout.status_code == 201
    body = checkout.json()
    assert body["total_amount"] == 50
    assert len(body["orders"]) == 2
    order_id = body["orders"][0]["id"]
    assert (
        client.get(f"/api/v1/orders/track/{order_id}", headers=headers).json()["status"]
        == "confirmed"
    )
    assert (
        client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=headers,
            json={"status": "paid"},
        ).status_code
        == 403
    )
    paid = client.put(
        f"/api/v1/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "paid"},
    )
    assert paid.status_code == 200
    tracked = client.get(f"/api/v1/orders/track/{order_id}", headers=headers).json()
    assert tracked["status"] == "paid"
    assert tracked["paid_at"] is not None
    assert (
        client.patch(
            "/api/v1/users/me", headers=headers, json={"first_name": "Updated"}
        ).json()["first_name"]
        == "Updated"
    )
    assert client.post("/api/v1/users/logout").status_code == 204
