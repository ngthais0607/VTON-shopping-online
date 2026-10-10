from app.features.products.model import Product
from app.core.database import save_to_db
from app.core.security import get_current_user
from app.features.orders.model import Order
from app.features.users.model import User
from app.main import app

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
    payload = {
        "product_id": product.id,
        "quantity": 2
    }
    response = client.post("/orders/", json=payload)

    # 3. Kiểm tra kết quả trả về
    assert response.status_code == 201
    order_data = response.json()
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
    payload = {
        "product_id": product.id,
        "quantity": 2
    }
    response = client.post("/orders/", json=payload)

    # Hệ thống phải báo lỗi 400 Bad Request do hết hàng
    assert response.status_code == 400
    assert response.json()["detail"] == "Not enough stock available"

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
    payload_create = {"product_id": product.id, "quantity": 2}
    resp_create = client.post("/orders/", json=payload_create)
    order_id = resp_create.json()["id"]

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
    payload_create = {"product_id": product.id, "quantity": 3}
    resp_create = client.post("/orders/", json=payload_create)
    order_id = resp_create.json()["id"]

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

    resp_create = client.post("/orders/", json={"product_id": product.id, "quantity": 1})
    assert resp_create.status_code == 201
    return resp_create.json()["id"]


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
