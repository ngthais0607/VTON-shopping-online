import asyncio
import gc
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import event, update
from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError
from app.core.rate_limiter import limiter
from app.core.security import hash_password
from app.features.categories.model import Category
from app.features.orders.constants import OrderStatus
from app.features.orders.model import Order, OrderItem
from app.features.orders.service import change_order_status, expire_pending_orders
from app.features.products.model import Product
from app.features.products.schemas import ProductPatch
from app.features.products.service import update_product
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User
from app.integrations.queue import get_task_queue


def product_row(db, **kwargs):
    stock_qty = kwargs.pop("stock_quantity", 10)
    reserved_qty = kwargs.pop("reserved_quantity", 0)
    sold_qty = kwargs.pop("sold_quantity", 0)
    product = Product(
        name="Final regression", price=10.5, currency="VND", **kwargs
    )
    db.add(product)
    db.flush()
    variant = ProductVariant(
        product_id=product.id,
        sku=f"REG-{product.id}-DEF",
        size="ONE_SIZE",
        color_name="Default",
        stock_quantity=stock_qty,
        reserved_quantity=reserved_qty,
        sold_quantity=sold_qty,
        is_active=True,
    )
    db.add(variant)
    db.commit()
    db.refresh(product)
    return product


def checkout_payload(variant_or_product, **kwargs):
    variant_id = variant_or_product.variants[0].id if hasattr(variant_or_product, "variants") and variant_or_product.variants else variant_or_product
    return dict(
        items=[dict(variant_id=variant_id, quantity=1)],
        customer_name="Buyer",
        customer_phone="123",
        shipping_address="Home",
        payment_method="vietqr",
        **kwargs,
    )


def test_product_patch_locks_and_refreshes_before_inventory_merge(db_session):
    product = product_row(db_session, reserved_quantity=1)
    product_id = product.id
    assert product.reserved_quantity == 1
    db_session.execute(
        update(ProductVariant)
        .where(ProductVariant.product_id == product_id)
        .values(reserved_quantity=8)
        .execution_options(synchronize_session=False)
    )
    assert product.reserved_quantity == 1
    reads = []

    def require_lock(state):
        if state.is_select and state.bind_mapper.class_ in (Product, ProductVariant):
            reads.append(state.statement)
            assert state.statement._for_update_arg is not None, (
                "inventory merge read must lock"
            )

    event.listen(db_session, "do_orm_execute", require_lock)
    try:
        with pytest.raises(BusinessRuleError, match="exceed"):
            update_product(db_session, product_id, ProductPatch(stock_quantity=5))
    finally:
        event.remove(db_session, "do_orm_execute", require_lock)
    assert reads
    assert product.reserved_quantity == 8
    assert product.stock_quantity == 10


@pytest.mark.parametrize("expire", [False, True])
def test_transition_retains_locked_product_without_nonlocking_reload(
    db_session, expire
):
    product = product_row(db_session, reserved_quantity=3, sold_quantity=2)
    product_id = product.id
    variant = product.variants[0]
    order = Order(
        product_id=product_id,
        product_name=product.name,
        unit_price=10,
        quantity=1,
        total_amount=10,
        currency="VND",
        status="pending",
        customer_name="Buyer",
        customer_phone="123",
        shipping_address="Home",
        payment_method="vietqr",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    item = OrderItem(
        order=order,
        product_id=product.id,
        product_name=product.name,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        unit_price=10,
        quantity=1,
        subtotal=10,
    )
    order.items = [item]
    db_session.add(order)
    db_session.commit()
    order_id = order.id
    # A separate session has no external Product references to keep weak identity entries alive.
    with Session(
        bind=db_session.connection(), join_transaction_mode="create_savepoint"
    ) as fresh:
        reads = []

        def require_lock(state):
            gc.collect()
            if state.is_select and state.bind_mapper.class_ in (Product, ProductVariant):
                reads.append(state.statement)
                assert state.statement._for_update_arg is not None, (
                    "locked Product was discarded and lazily reloaded"
                )

        event.listen(fresh, "do_orm_execute", require_lock)
        if expire:
            assert expire_pending_orders(fresh) == 1
        else:
            asyncio.run(
                change_order_status(fresh, order_id, OrderStatus.PAID, AsyncMock())
            )
        event.remove(fresh, "do_orm_execute", require_lock)
        assert len(reads) == 1
        current = fresh.get(Product, product_id)
        assert (current.reserved_quantity, current.sold_quantity) == (
            2,
            2 if expire else 3,
        )


def test_checkout_hides_deleted_category(client, db_session, mock_user_auth):
    category = Category(name="Deleted", is_deleted=True)
    db_session.add(category)
    db_session.flush()
    product = product_row(db_session, category_id=category.id)
    response = client.post(
        "/api/v1/orders/checkout-cart", json=checkout_payload(product)
    )
    assert response.status_code == 404
    assert response.json()["code"] == "product_not_found"
    assert db_session.query(Order).count() == 0
    db_session.refresh(product)
    assert product.reserved_quantity == 0


@pytest.mark.parametrize(
    "field,limit",
    [
        ("customer_name", 255),
        ("customer_phone", 50),
        ("shipping_address", 1000),
        ("notes", 2000),
    ],
)
@pytest.mark.parametrize("extra", [0, 1])
def test_checkout_storage_bounds(
    client, db_session, mock_user_auth, field, limit, extra
):
    client.app.dependency_overrides[get_task_queue] = lambda: AsyncMock()
    product = product_row(db_session)
    payload = checkout_payload(product)
    payload[field] = "x" * (limit + extra)
    response = client.post("/api/v1/orders/checkout-cart", json=payload)
    assert response.status_code == (201 if extra == 0 else 422)


@pytest.mark.parametrize("field,limit", [("title", 255), ("comment", 1000)])
@pytest.mark.parametrize("extra", [0, 1])
def test_review_storage_bounds(client, db_session, mock_user_auth, field, limit, extra):
    product = product_row(db_session)
    response = client.post(
        f"/api/v1/products/{product.id}/reviews",
        json={"rating": 5, field: "x" * (limit + extra)},
    )
    assert response.status_code == (201 if extra == 0 else 422)


@pytest.mark.parametrize(
    "method,currencies,code",
    [
        ("cod", ["USD", "VND"], "mixed_cart_currency"),
        ("vietqr", ["USD"], "unsupported_payment_currency"),
    ],
)
def test_invalid_payment_currency_rejected_before_mutation(
    client, db_session, mock_user_auth, method, currencies, code
):
    queue = AsyncMock()
    client.app.dependency_overrides[get_task_queue] = lambda: queue
    products = []
    for currency in currencies:
        product = product_row(db_session)
        product.currency = currency
        db_session.commit()
        products.append(product)
    payload = checkout_payload(products[0])
    payload.update(
        payment_method=method,
        items=[dict(variant_id=p.variants[0].id, quantity=1) for p in products],
    )
    response = client.post("/api/v1/orders/checkout-cart", json=payload)
    assert response.status_code == 400
    assert response.json()["code"] == code
    assert db_session.query(Order).count() == 0
    for product in products:
        db_session.refresh(product)
        assert product.reserved_quantity == 0
    queue.enqueue.assert_not_awaited()


def test_vietqr_amount_matches_rounded_url_and_canonical_currency(
    client, db_session, mock_user_auth
):
    client.app.dependency_overrides[get_task_queue] = lambda: AsyncMock()
    product = product_row(db_session)
    product.currency = "vnd"
    db_session.commit()
    response = client.post(
        "/api/v1/orders/checkout-cart", json=checkout_payload(product)
    )
    assert response.status_code == 201
    body = response.json()
    assert body["orders"][0]["currency"] == "VND"
    for payment in [
        body["vietqr"],
        client.get(f"/api/v1/orders/track/{body['orders'][0]['id']}").json()["vietqr"],
    ]:
        assert payment["amount"] == 11
        assert parse_qs(urlparse(payment["qr_url"]).query)["amount"] == ["11"]
    assert (
        body["total_amount"] == 10.5
    )  # Order totals retain their stored value; payment instructions round once.


@pytest.mark.parametrize("route", ["register", "admin", "change"])
@pytest.mark.parametrize(
    "password,expected", [("é" * 36, True), ("é" * 37, False), ("a" * 73, False)]
)
def test_new_password_bcrypt_byte_limit(
    client, db_session, mock_admin_auth, mock_user_auth, route, password, expected
):
    limiter.reset()
    client.app.dependency_overrides[get_task_queue] = lambda: AsyncMock()
    if route == "change":
        mock_user_auth.password_hash = hash_password("Current123!")
        db_session.commit()
        response = client.patch(
            "/api/v1/users/me/password",
            json={"current_password": "Current123!", "new_password": password},
        )
        success = 204
    else:
        response = client.post(
            "/api/v1/users/register" if route == "register" else "/api/v1/users",
            json={
                "username": "new-bcrypt",
                "email": "new-bcrypt@example.com",
                "password": password,
            },
        )
        success = 201
    assert response.status_code == (success if expected else 422)


def test_login_malformed_password_is_not_server_error(client, db_session):
    limiter.reset()
    db_session.add(
        User(
            username="bcrypt-login",
            email="bcrypt-login@example.com",
            password_hash=hash_password("Valid123!"),
        )
    )
    db_session.commit()
    response = client.post(
        "/api/v1/users/login",
        json={"identifier": "bcrypt-login", "password": "bad\u0000password"},
    )
    assert response.status_code == 401


@pytest.mark.parametrize("secure", [True, False])
def test_refresh_cookie_flags_consistent_for_login_refresh_logout(
    client, db_session, secure
):
    original = client.app.state.settings
    client.app.state.settings = original.model_copy(
        update={"refresh_cookie_secure": secure}
    )
    limiter.reset()
    db_session.add(
        User(
            username="cookie-flags",
            email="cookie-flags@example.com",
            password_hash=hash_password("Valid123!"),
        )
    )
    db_session.commit()
    try:
        login = client.post(
            "/api/v1/users/login",
            json={"identifier": "cookie-flags", "password": "Valid123!"},
        )
        refresh = client.post(
            "/api/v1/users/refresh",
            json={"refresh_token": login.cookies["refresh_token"]},
        )
        logout = client.post("/api/v1/users/logout")
        for response in [login, refresh, logout]:
            cookie = response.headers["set-cookie"]
            assert ("Secure" in cookie) == secure
            assert (
                "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
            )
    finally:
        client.app.state.settings = original


def test_json_login_openapi_advertises_http_bearer(client):
    schema = client.app.openapi()
    security = schema["paths"]["/api/v1/users/me"]["get"]["security"]
    scheme = schema["components"]["securitySchemes"][next(iter(security[0]))]
    assert scheme["type"] == "http" and scheme["scheme"] == "bearer"
    assert (
        "application/json"
        in schema["paths"]["/api/v1/users/login"]["post"]["requestBody"]["content"]
    )


@pytest.mark.parametrize("header", [None, "Basic x", "Bearer", "Bearer not-a-token"])
def test_bearer_auth_errors_keep_common_shape(client, header):
    response = client.get(
        "/api/v1/users/me", headers={} if header is None else {"Authorization": header}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"
