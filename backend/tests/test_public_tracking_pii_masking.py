
from app.features.orders.model import Order, OrderItem
from app.features.orders.schemas import mask_customer_name, mask_customer_phone
from app.features.users.model import User
from tests.factories import make_product


def persist_order(
    db_session,
    user_id: int,
    customer_name: str = "Nguyen Van B",
    customer_phone: str = "0912345678",
    shipping_address: str = "123 Nguyen Trai, Quan 1, TP Ho Chi Minh",
    notes: str = "Leave with security",
    payment_method: str = "vietqr",
    status: str = "pending",
) -> Order:
    product = make_product(db_session, name="Tracking Test Shirt", price=250000.0)
    db_session.flush()

    order = Order(
        public_code="trk-pub-code-1234567890abcdef",
        user_id=user_id,
        product_id=product.id,
        product_name=product.name,
        quantity=2,
        unit_price=250000.0,
        total_amount=500000.0,
        currency="VND",
        status=status,
        customer_name=customer_name,
        customer_phone=customer_phone,
        shipping_address=shipping_address,
        notes=notes,
        payment_method=payment_method,
    )
    db_session.add(order)
    db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=product.id,
        product_name=product.name,
        unit_price=250000.0,
        quantity=2,
        subtotal=500000.0,
        variant_id=product.variants[0].id,
        sku="SHIRT-BLK-M",
        size="M",
        color_name="Black",
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(order)
    return order


def test_mask_customer_name_helper():
    assert mask_customer_name("Nguyen Van B") == "Nguyen V. B."
    assert mask_customer_name("Nguyễn Văn") == "Nguyễn V."
    assert mask_customer_name("John") == "J***"
    assert mask_customer_name("Le") == "L***"
    assert mask_customer_name("A") == "A***"
    assert mask_customer_name("") == ""
    assert mask_customer_name("   ") == ""


def test_mask_customer_phone_helper():
    assert mask_customer_phone("0912345678") == "09******78"
    assert mask_customer_phone("+84912345678") == "09******78"
    assert mask_customer_phone("+84 912 345 678") == "09******78"
    assert mask_customer_phone("0912.345-678") == "09******78"


def test_public_tracking_allowlist_keys_and_no_pii(client, db_session, mock_user_auth):
    order = persist_order(
        db_session,
        user_id=mock_user_auth.id,
        customer_name="Nguyen Van B",
        customer_phone="0912345678",
        shipping_address="Secret Address 404",
        notes="Secret Note 123",
        payment_method="vietqr",
        status="pending",
    )

    # Anonymous tracking request (no Authorization header)
    resp = client.get(f"/api/v1/orders/track/{order.public_code}")
    assert resp.status_code == 200
    data = resp.json()

    # Exact top-level allowed keys
    allowed_keys = {
        "public_code",
        "status",
        "payment_status",
        "payment_method",
        "total_amount",
        "currency",
        "created_at",
        "expires_at",
        "paid_at",
        "timeline",
        "items",
        "vietqr",
        "customer_name",
        "customer_phone",
    }
    assert set(data.keys()).issubset(allowed_keys)

    # Verify absence of internal IDs, address, email, notes
    assert "id" not in data
    assert "user_id" not in data
    assert "shipping_address" not in data
    assert "notes" not in data
    assert "email" not in data

    # Verify PII masking
    assert data["customer_name"] == "Nguyen V. B."
    assert data["customer_phone"] == "09******78"

    # Verify minimal item keys (no item IDs or product/order IDs)
    assert len(data["items"]) == 1
    item_data = data["items"][0]
    allowed_item_keys = {"product_name", "size", "color_name", "quantity"}
    assert set(item_data.keys()) == allowed_item_keys
    assert item_data["product_name"] == "Tracking Test Shirt"
    assert item_data["size"] == "M"
    assert item_data["color_name"] == "Black"
    assert item_data["quantity"] == 2

    # Verify VietQR details present for pending VietQR order without PII
    assert data["vietqr"] is not None
    assert "account_no" in data["vietqr"]
    assert "bank_id" in data["vietqr"]
    assert "memo" in data["vietqr"]


def test_public_tracking_single_token_names(client, db_session, mock_user_auth):
    order = persist_order(
        db_session,
        user_id=mock_user_auth.id,
        customer_name="Cuong",
        customer_phone="+84 987 654 321",
    )

    resp = client.get(f"/api/v1/orders/track/{order.public_code}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["customer_name"] == "C***"
    assert data["customer_phone"] == "09******21"


def test_public_tracking_numeric_id_requires_auth(client, db_session):
    owner = User(
        username="order_owner",
        email="owner@example.com",
        password_hash="pw",
        role="customer",
    )
    other_user = User(
        username="other_track_user",
        email="other_track@example.com",
        password_hash="pw",
        role="customer",
    )
    db_session.add_all([owner, other_user])
    db_session.commit()
    order = persist_order(db_session, user_id=owner.id)

    # 1. Anonymous access to numeric ID route must be rejected with 401
    anon_resp = client.get(f"/api/v1/orders/track/{order.id}")
    assert anon_resp.status_code == 401
    assert anon_resp.json()["code"] == "invalid_token"

    from app.core.security import get_current_user_optional
    from app.main import app

    # 2. Another user access to numeric ID route must be 404
    app.dependency_overrides[get_current_user_optional] = lambda: other_user
    try:
        forbidden_resp = client.get(f"/api/v1/orders/track/{order.id}")
        assert forbidden_resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user_optional, None)

    # 3. Authenticated owner access via numeric ID returns masked PublicTrackingResponse
    app.dependency_overrides[get_current_user_optional] = lambda: owner
    try:
        owner_resp = client.get(f"/api/v1/orders/track/{order.id}")
        assert owner_resp.status_code == 200
        owner_data = owner_resp.json()
        assert "shipping_address" not in owner_data
        assert "user_id" not in owner_data
        assert owner_data["customer_phone"] == "09******78"
    finally:
        app.dependency_overrides.pop(get_current_user_optional, None)


def test_private_order_endpoint_preserves_full_order(client, db_session, mock_user_auth):
    order = persist_order(
        db_session,
        user_id=mock_user_auth.id,
        customer_name="Nguyen Van B",
        customer_phone="0912345678",
        shipping_address="123 Nguyen Trai, Quan 1, TP Ho Chi Minh",
    )

    resp = client.get(f"/api/v1/orders/{order.id}")
    assert resp.status_code == 200
    full_data = resp.json()

    # Private endpoint for owner contains full details
    assert full_data["id"] == order.id
    assert full_data["user_id"] == mock_user_auth.id
    assert full_data["customer_name"] == "Nguyen Van B"
    assert full_data["customer_phone"] == "0912345678"
    assert full_data["shipping_address"] == "123 Nguyen Trai, Quan 1, TP Ho Chi Minh"
