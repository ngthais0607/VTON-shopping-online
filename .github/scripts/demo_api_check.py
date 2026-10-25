"""Exercise only a disposable seeded local shop. Creates demo orders."""

import json
import secrets
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]


def main():
    values = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip("\"'")
    base = values.get("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8000")
    assert base.startswith(("http://localhost:", "http://127.0.0.1:")), (
        "Local demo only"
    )
    base = (
        base.replace("http://localhost:", "http://127.0.0.1:").rstrip("/") + "/api/v1"
    )

    def call(path, data=None, token=None, method=None, headers=None):
        hdr = {"Content-Type": "application/json", **(headers or {})}
        if token:
            hdr["Authorization"] = "Bearer " + token
        request = Request(
            base + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers=hdr,
            method=method or ("POST" if data is not None else "GET"),
        )
        with urlopen(request, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else None

    customer = call(
        "/users/login",
        {
            "identifier": "user@example.com",
            "password": values["SEED_CUSTOMER_PASSWORD"],
        },
    )["access_token"]
    admin = call(
        "/users/login",
        {"identifier": "admin@example.com", "password": values["SEED_ADMIN_PASSWORD"]},
    )["access_token"]
    catalog = call("/products?limit=100")
    assert catalog["total"] == 12
    assert all(p["available_stock"] > 0 for p in catalog["items"])
    categories = call("/categories?limit=100")
    assert not {c["slug"] for c in categories["items"]} & {
        "giay",
        "phu-kien",
        "tui-xach",
    }
    product = call("/products/by-slug/ao-thun-cotton-compact-basic")
    variant = next(
        v for v in product["variants"] if v["is_active"] and v["available_stock"] > 5
    )
    initial_stock = variant["available_stock"]
    image = product["images"][0]["url"]
    with urlopen(image, timeout=20) as response:
        assert response.status == 200 and response.read().startswith(b"<svg")

    def checkout(method):
        return call(
            "/orders/checkout-cart",
            {
                "items": [{"variant_id": variant["id"], "quantity": 1}],
                "customer_name": "Demo Verification",
                "customer_phone": "0912345678",
                "shipping_address": "72 Le Thanh Ton, Quan 1, TP Ho Chi Minh",
                "payment_method": method,
            },
            customer,
        )

    def stock():
        detail = call("/products/by-slug/ao-thun-cotton-compact-basic")
        return next(
            v["available_stock"] for v in detail["variants"] if v["id"] == variant["id"]
        )

    cod = checkout("cod")["orders"][0]
    assert cod["status"] == "confirmed" and stock() == initial_stock - 1
    call(f"/orders/{cod['id']}/cancel", {}, customer)
    assert stock() == initial_stock
    fulfillment = checkout("cod")["orders"][0]
    for status in ("shipped", "delivered", "paid"):
        updated = call(
            f"/orders/{fulfillment['id']}/status", {"status": status}, admin, "PUT"
        )
        assert updated["status"] == status

    qr = checkout("vietqr")
    payload = {
        "transaction_id": "demo-" + secrets.token_hex(8),
        "amount": qr["vietqr"]["amount"],
        "content": qr["vietqr"]["memo"],
    }
    try:
        call("/orders/vietqr-webhook", payload)
    except HTTPError as error:
        assert error.code == 401
    else:
        raise AssertionError("Webhook accepted without a secret")
    hdr = {"X-Webhook-Secret": values["VIETQR_WEBHOOK_SECRET"]}
    call("/orders/vietqr-webhook", payload, headers=hdr)
    call("/orders/vietqr-webhook", payload, headers=hdr)
    qr_id = qr["orders"][0]["id"]
    assert call(f"/orders/{qr_id}", token=customer)["status"] == "paid"
    call("/dashboard/metrics", token=admin)
    print(
        json.dumps(
            {
                "catalog": 12,
                "image": "MinIO reachable",
                "cod_cancel_stock_restored": True,
                "cod_fulfillment": "shipped -> delivered -> paid",
                "webhook_without_secret": 401,
                "vietqr": "paid; duplicate transaction accepted idempotently",
                "created_order_ids": [cod["id"], fulfillment["id"], qr_id],
            }
        )
    )


if __name__ == "__main__":
    main()
