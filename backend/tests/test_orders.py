from app.features.products.model import Product
from app.core.database import save_to_db
from app.core.security import get_current_user
from app.features.orders.model import Order
from app.features.orders.constants import OrderStatus
from app.features.orders.schema import CheckoutCartRequest
from app.features.orders.service import (
    InvalidOrderTransition,
    ProductNotFoundError,
    create_cart_orders,
    transition_order,
)
from app.features.users.model import User
from app.main import app
from unittest.mock import AsyncMock, patch
import pytest


def _checkout(client, product_id, quantity=1, payment_method="vietqr", **overrides):
    payload = {
        "items": [{"product_id": product_id, "quantity": quantity}],
        "customer_name": "Test Customer",
        "customer_phone": "0123456789",
        "shipping_address": "123 Test Street",
        "notes": "Leave at reception",
        "payment_method": payment_method,
    }
    payload.update(overrides)
    return client.post("/orders/checkout-cart", json=payload)

def test_create_order_success(client, db_session, mock_user_auth):
    """Kiểm tra luồng đặt hàng thành công và tự động giữ chỗ kho hàng"""
    # 1. Tạo một sản phẩm mẫu trong database kiểm thử
    product = Product(
        name="Mũ bảo hiểm Test",
        price=50.0,
        currency="USD",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True
    )
    save_to_db(db_session, product)

    # 2. Gửi yêu cầu đặt hàng sản phẩm này với số lượng là 2
    response = _checkout(client, product.id, quantity=2)

    # 3. Kiểm tra kết quả trả về
    assert response.status_code == 201
    order_data = response.json()["orders"][0]
    assert order_data["product_name"] == "Mũ bảo hiểm Test"
    assert order_data["quantity"] == 2
    assert order_data["status"] == "pending"

    # 4. Truy vấn lại sản phẩm từ DB để kiểm tra xem kho giữ chỗ đã tăng lên 2 chưa
    db_session.refresh(product)
    assert product.reserved_quantity == 2


def test_create_order_out_of_stock(client, db_session, mock_user_auth):
    """Kiểm tra đặt hàng thất bại khi vượt quá số lượng trong kho"""
    # Tạo sản phẩm chỉ có 1 sản phẩm trong kho
    product = Product(
        name="Sản phẩm hiếm",
        price=10.0,
        currency="USD",
        stock_quantity=1,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True
    )
    save_to_db(db_session, product)

    # Cố tình mua 2 sản phẩm (vượt quá tồn kho 1)
    response = _checkout(client, product.id, quantity=2)

    # Hệ thống phải báo lỗi 400 Bad Request do hết hàng
    assert response.status_code == 409
    assert response.json()["detail"].startswith("Not enough stock available")

def test_update_order_status_to_paid(client, db_session, mock_user_auth, mock_admin_auth):
    """Kiểm tra: Khi đơn hàng chuyển sang 'paid', kho reserved giảm và sold tăng"""
    # 1. Tạo sản phẩm mẫu có sẵn
    product = Product(
        name="Áo khoác Test",
        price=100.0,
        currency="USD",
        stock_quantity=5,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True
    )
    save_to_db(db_session, product)

    # 2. User đặt hàng (sẽ giữ chỗ 2 sản phẩm trong kho)
    resp_create = _checkout(client, product.id, quantity=2)
    order_id = resp_create.json()["orders"][0]["id"]

    # 3. Admin cập nhật trạng thái đơn hàng sang "paid"
    # Lưu ý: Cần sử dụng mock_admin_auth vì API update status yêu cầu quyền Admin
    payload_status = {"status": "paid"}
    resp_update = client.put(f"/orders/{order_id}/status", json=payload_status)

    # 4. Xác nhận phản hồi thành công
    assert resp_update.status_code == 200
    assert resp_update.json()["status"] == "paid"

    # 5. Kiểm tra kho của sản phẩm: reserved phải giảm về 0 và sold phải tăng lên 2
    db_session.refresh(product)
    assert product.reserved_quantity == 0
    assert product.sold_quantity == 2


def test_update_order_status_to_cancelled(client, db_session, mock_user_auth, mock_admin_auth):
    """Kiểm tra: Khi đơn hàng chuyển sang 'cancelled', kho reserved được giải phóng"""
    # 1. Tạo sản phẩm
    product = Product(
        name="Giày thể thao Test",
        price=80.0,
        currency="USD",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True
    )
    save_to_db(db_session, product)

    # 2. Đặt hàng 3 đôi giày (reserved = 3)
    resp_create = _checkout(client, product.id, quantity=3)
    order_id = resp_create.json()["orders"][0]["id"]

    # 3. Admin cập nhật đơn hàng thành "cancelled"
    payload_status = {"status": "cancelled"}
    resp_update = client.put(f"/orders/{order_id}/status", json=payload_status)

    assert resp_update.status_code == 200
    assert resp_update.json()["status"] == "cancelled"

    # 4. Kiểm tra kho: reserved phải trả về 0 và sold giữ nguyên là 0
    db_session.refresh(product)
    assert product.reserved_quantity == 0
    assert product.sold_quantity == 0


def _create_trackable_order(client, db_session, mock_user_auth):
    product = Product(name="Track Watch", price=150.0, currency="USD", stock_quantity=5)
    save_to_db(db_session, product)

    resp_create = _checkout(client, product.id)
    assert resp_create.status_code == 201
    return resp_create.json()["orders"][0]["id"]


def test_track_order_requires_authentication(client, db_session, mock_user_auth):
    order_id = _create_trackable_order(client, db_session, mock_user_auth)
    app.dependency_overrides.pop(get_current_user, None)

    response = client.get(f"/orders/track/{order_id}")

    assert response.status_code == 401


def test_track_order_owner_can_view(client, db_session, mock_user_auth):
    order_id = _create_trackable_order(client, db_session, mock_user_auth)

    response = client.get(f"/orders/track/{order_id}")

    assert response.status_code == 200
    assert response.json()["id"] == order_id
    timeline_copy = " ".join(step["description"] for step in response.json()["timeline"])
    assert "Automated" not in timeline_copy
    assert "administrator" in timeline_copy


def test_track_order_admin_can_view_any_order(client, db_session, mock_user_auth):
    order_id = _create_trackable_order(client, db_session, mock_user_auth)
    admin = User(
        username="tracking_admin",
        email="tracking-admin@example.com",
        password_hash="unused",
        role="admin",
    )
    db_session.add(admin)
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: admin

    response = client.get(f"/orders/track/{order_id}")

    assert response.status_code == 200
    assert response.json()["id"] == order_id


def test_track_order_hides_order_from_other_customer(client, db_session, mock_user_auth):
    order_id = _create_trackable_order(client, db_session, mock_user_auth)
    other_customer = User(
        username="other_customer",
        email="other-customer@example.com",
        password_hash="unused",
        role="customer",
    )
    db_session.add(other_customer)
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: other_customer

    response = client.get(f"/orders/track/{order_id}")

    assert response.status_code == 404


def test_vietqr_webhook_route_is_removed(client, db_session, mock_user_auth):
    order_id = _create_trackable_order(client, db_session, mock_user_auth)
    app.dependency_overrides.pop(get_current_user, None)

    response = client.post("/orders/vietqr-webhook", json={
        "content": f"LUXESTORE_{order_id}",
        "amount": 150.0,
        "transaction_id": "TXN_TEST_999",
    })

    assert response.status_code == 404
    order = db_session.query(Order).filter(Order.id == order_id).one()
    assert order.status == "pending"


def test_public_expire_route_is_removed(client, db_session, mock_user_auth):
    order_id = _create_trackable_order(client, db_session, mock_user_auth)
    app.dependency_overrides.pop(get_current_user, None)

    response = client.post(f"/orders/{order_id}/expire")

    assert response.status_code == 404
    order = db_session.query(Order).filter(Order.id == order_id).one()
    assert order.status == "pending"


def test_checkout_persists_fulfillment_fields(client, db_session, mock_user_auth):
    product = Product(name="Fulfillment Test", price=25.0, currency="USD", stock_quantity=5)
    save_to_db(db_session, product)

    response = _checkout(client, product.id)

    assert response.status_code == 201
    data = response.json()["orders"][0]
    order = db_session.query(Order).filter(Order.id == data["id"]).one()
    assert data["customer_name"] == order.customer_name == "Test Customer"
    assert data["customer_phone"] == order.customer_phone == "0123456789"
    assert data["shipping_address"] == order.shipping_address == "123 Test Street"
    assert data["notes"] == order.notes == "Leave at reception"
    assert data["payment_method"] == order.payment_method == "vietqr"


def test_vietqr_checkout_is_pending_and_expires(client, db_session, mock_user_auth):
    product = Product(name="VietQR Test", price=25.0, currency="USD", stock_quantity=5)
    save_to_db(db_session, product)

    response = _checkout(client, product.id, payment_method="vietqr")

    data = response.json()["orders"][0]
    assert data["status"] == "pending"
    assert data["expires_at"] is not None


def test_cod_checkout_is_confirmed_without_expiration(client, db_session, mock_user_auth):
    product = Product(name="COD Test", price=25.0, currency="USD", stock_quantity=5)
    save_to_db(db_session, product)

    response = _checkout(client, product.id, payment_method="cod")

    data = response.json()["orders"][0]
    assert data["status"] == "confirmed"
    assert data["expires_at"] is None
    assert "vietqr" not in response.json()

    tracking_response = client.get(f"/orders/track/{data['id']}")
    assert tracking_response.status_code == 200
    assert "vietqr" not in tracking_response.json()


def test_checkout_rejects_unknown_payment_method_with_422(client, db_session, mock_user_auth):
    product = Product(name="Invalid Payment", price=25.0, currency="USD", stock_quantity=5)
    save_to_db(db_session, product)

    response = _checkout(client, product.id, payment_method="cashapp")

    assert response.status_code == 422


def test_legacy_single_order_endpoint_is_removed(client, db_session, mock_user_auth):
    product = Product(name="Legacy Endpoint", price=25.0, currency="USD", stock_quantity=5)
    save_to_db(db_session, product)

    response = client.post("/orders/", json={"product_id": product.id, "quantity": 1})

    assert response.status_code == 405


def test_enqueue_failure_does_not_rollback_committed_order(client, db_session, mock_user_auth):
    product = Product(name="Queue Failure", price=25.0, currency="USD", stock_quantity=5)
    save_to_db(db_session, product)

    with patch("app.features.orders.router.enqueue_task", new=AsyncMock(side_effect=RuntimeError("redis down"))):
        response = _checkout(client, product.id)

    assert response.status_code == 201
    assert db_session.query(Order).filter(Order.product_id == product.id).count() == 1


@pytest.mark.parametrize(
    ("payment_method", "new_status", "expected_reserved", "expected_sold"),
    [
        ("vietqr", "paid", 0, 2),
        ("vietqr", "cancelled", 0, 0),
        ("vietqr", "expired", 0, 0),
        ("cod", "paid", 0, 2),
        ("cod", "cancelled", 0, 0),
    ],
)
def test_allowed_order_transitions_update_inventory(
    client,
    db_session,
    mock_user_auth,
    mock_admin_auth,
    payment_method,
    new_status,
    expected_reserved,
    expected_sold,
):
    product = Product(name=f"Transition {payment_method} {new_status}", price=30, stock_quantity=5)
    save_to_db(db_session, product)
    checkout = _checkout(client, product.id, quantity=2, payment_method=payment_method)
    order_id = checkout.json()["orders"][0]["id"]

    response = client.put(f"/orders/{order_id}/status", json={"status": new_status})

    assert response.status_code == 200
    db_session.refresh(product)
    assert product.reserved_quantity == expected_reserved
    assert product.sold_quantity == expected_sold


@pytest.mark.parametrize(
    ("payment_method", "initial_terminal", "rejected_status"),
    [
        ("vietqr", "paid", "pending"),
        ("vietqr", "expired", "paid"),
        ("cod", None, "expired"),
        ("vietqr", None, "confirmed"),
        ("vietqr", "paid", "paid"),
    ],
)
def test_rejected_order_transitions_do_not_mutate_inventory(
    client,
    db_session,
    mock_user_auth,
    mock_admin_auth,
    payment_method,
    initial_terminal,
    rejected_status,
):
    product = Product(name=f"Rejected {payment_method} {rejected_status}", price=30, stock_quantity=5)
    save_to_db(db_session, product)
    checkout = _checkout(client, product.id, quantity=2, payment_method=payment_method)
    order_id = checkout.json()["orders"][0]["id"]
    if initial_terminal:
        assert client.put(f"/orders/{order_id}/status", json={"status": initial_terminal}).status_code == 200
    response = client.put(f"/orders/{order_id}/status", json={"status": rejected_status})

    assert response.status_code == 409


def test_rejected_transition_service_does_not_mutate_inventory():
    product = Product(
        name="Immutable terminal inventory",
        price=30,
        stock_quantity=5,
        reserved_quantity=0,
        sold_quantity=2,
    )
    order = Order(
        product=product,
        product_name=product.name,
        unit_price=30,
        quantity=2,
        total_amount=60,
        currency="USD",
        status="paid",
        payment_method="vietqr",
        customer_name="Customer",
        customer_phone="1",
        shipping_address="Address",
    )

    with pytest.raises(InvalidOrderTransition):
        transition_order(order, OrderStatus.PENDING)

    assert product.reserved_quantity == 0
    assert product.sold_quantity == 2


def test_unknown_order_status_returns_422(client, db_session, mock_user_auth, mock_admin_auth):
    product = Product(name="Unknown status", price=30, stock_quantity=5)
    save_to_db(db_session, product)
    checkout = _checkout(client, product.id)
    order_id = checkout.json()["orders"][0]["id"]

    response = client.put(f"/orders/{order_id}/status", json={"status": "shipped"})

    assert response.status_code == 422


def test_duplicate_cart_items_are_aggregated(client, db_session, mock_user_auth):
    product = Product(name="Duplicate cart", price=20, stock_quantity=10)
    save_to_db(db_session, product)
    payload = {
        "items": [
            {"product_id": product.id, "quantity": 2},
            {"product_id": product.id, "quantity": 3},
        ],
        "customer_name": "Duplicate Buyer",
        "customer_phone": "0123456789",
        "shipping_address": "123 Duplicate Street",
        "payment_method": "vietqr",
    }

    response = client.post("/orders/checkout-cart", json=payload)

    assert response.status_code == 201
    assert len(response.json()["orders"]) == 1
    assert response.json()["orders"][0]["quantity"] == 5
    db_session.refresh(product)
    assert product.reserved_quantity == 5


def test_invalid_item_rolls_back_all_orders_and_reservations(client, db_session, mock_user_auth):
    product = Product(name="Atomic cart", price=20, stock_quantity=10)
    save_to_db(db_session, product)
    payload = {
        "items": [
            {"product_id": product.id, "quantity": 2},
            {"product_id": 999999, "quantity": 1},
        ],
        "customer_name": "Atomic Buyer",
        "customer_phone": "0123456789",
        "shipping_address": "123 Atomic Street",
        "payment_method": "vietqr",
    }

    checkout = CheckoutCartRequest(**payload)

    with pytest.raises(ProductNotFoundError):
        create_cart_orders(db_session, mock_user_auth, checkout)

    assert db_session.query(Order).filter(Order.product_id == product.id).count() == 0
    assert product.reserved_quantity == 0


def test_out_of_stock_returns_409(client, db_session, mock_user_auth):
    product = Product(name="Stock conflict", price=20, stock_quantity=1)
    save_to_db(db_session, product)

    response = _checkout(client, product.id, quantity=2)

    assert response.status_code == 409


def test_checkout_enqueues_emails_only_after_commit(client, db_session, mock_user_auth):
    product = Product(name="Commit ordering", price=20, stock_quantity=2)
    save_to_db(db_session, product)
    events = []
    original_commit = db_session.commit

    def record_commit():
        events.append("commit")
        return original_commit()

    async def record_enqueue(*args):
        events.append("enqueue")

    with patch.object(db_session, "commit", side_effect=record_commit), patch(
        "app.features.orders.router.enqueue_task",
        new=AsyncMock(side_effect=record_enqueue),
    ):
        response = _checkout(client, product.id)

    assert response.status_code == 201
    assert events[:2] == ["commit", "enqueue"]


def test_payment_email_failure_does_not_fail_committed_status_update(
    client,
    db_session,
    mock_user_auth,
    mock_admin_auth,
):
    product = Product(name="Payment queue failure", price=20, stock_quantity=2)
    save_to_db(db_session, product)
    checkout = _checkout(client, product.id)
    order_id = checkout.json()["orders"][0]["id"]

    with patch(
        "app.features.orders.router.enqueue_task",
        new=AsyncMock(side_effect=RuntimeError("redis down")),
    ):
        response = client.put(f"/orders/{order_id}/status", json={"status": "paid"})

    assert response.status_code == 200
    assert db_session.get(Order, order_id).status == "paid"
