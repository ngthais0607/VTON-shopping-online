from app.features.products.model import Product
from app.core.database import save_to_db

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


def test_track_order_public(client, db_session, mock_user_auth):
    product = Product(name="Track Watch", price=150.0, currency="USD", stock_quantity=5)
    save_to_db(db_session, product)

    resp_create = client.post("/orders/", json={"product_id": product.id, "quantity": 1})
    order_id = resp_create.json()["id"]

    resp_track = client.get(f"/orders/track/{order_id}")
    assert resp_track.status_code == 200
    data = resp_track.json()
    assert data["id"] == order_id
    assert "vietqr" in data
    assert "timeline" in data
    assert len(data["timeline"]) == 4


def test_vietqr_webhook_reconciliation(client, db_session, mock_user_auth):
    product = Product(name="Webhook Watch", price=200.0, currency="USD", stock_quantity=10)
    save_to_db(db_session, product)

    resp_create = client.post("/orders/", json={"product_id": product.id, "quantity": 2})
    order_id = resp_create.json()["id"]

    webhook_payload = {
        "content": f"LUXESTORE_{order_id}",
        "amount": 400.0,
        "transaction_id": "TXN_TEST_999"
    }

    import unittest.mock
    with unittest.mock.patch("app.features.orders.router.enqueue_task", new_callable=unittest.mock.AsyncMock):
        resp_webhook = client.post("/orders/vietqr-webhook", json=webhook_payload)

    assert resp_webhook.status_code == 200
    assert resp_webhook.json()["status"] == "success"
    assert order_id in resp_webhook.json()["reconciled_orders"]

    # Verify order is now paid
    resp_track = client.get(f"/orders/track/{order_id}")
    assert resp_track.json()["status"] == "paid"
