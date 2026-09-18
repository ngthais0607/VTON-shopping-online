from app.features.categories.model import Category
from app.core.database import save_to_db

def test_create_category_success(client, mock_admin_auth):
    """Kiểm tra Admin tạo danh mục mới thành công"""
    payload = {
        "name": "Thời Trang Nam",
        "description": "Quần áo thời trang nam cao cấp"
    }
    response = client.post("/categories", json=payload)
    
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Thời Trang Nam"
    assert data["description"] == "Quần áo thời trang nam cao cấp"
    assert "id" in data


def test_get_categories_list(client, db_session):
    """Kiểm tra lấy danh sách danh mục"""
    # Tạo 2 danh mục mẫu trong DB
    cat1 = Category(name="Điện tử", description="Đồ điện gia dụng")
    cat2 = Category(name="Sách", description="Sách giáo khoa & tiểu thuyết")
    save_to_db(db_session, cat1)
    save_to_db(db_session, cat2)

    response = client.get("/categories")
    
    assert response.status_code == 200
    data = response.json()
    
    # Đảm bảo nhận về ít nhất 2 danh mục đã tạo
    assert len(data) >= 2
    names = [c["name"] for c in data]
    assert "Điện tử" in names
    assert "Sách" in names


def test_delete_category_success(client, db_session, mock_admin_auth):
    """Kiểm tra Admin xóa danh mục (Soft Delete)"""
    # Tạo danh mục mẫu
    cat = Category(name="Mỹ phẩm", description="Chăm sóc da")
    save_to_db(db_session, cat)

    # Thực hiện gọi API xóa (yêu cầu body chứa thông tin ai xóa)
    payload_delete = {
        "deleted_by_id": 999
    }
    # Sử dụng phương thức post hoặc delete tùy cấu hình API.
    # Trong router của bạn đang là: @router.delete("/{category_id}")
    # Chú ý: Vì API delete nhận body nên chúng ta gửi body qua tham số json
    response = client.request("DELETE", f"/categories/{cat.id}", json=payload_delete)

    assert response.status_code == 200
    assert response.json()["message"] == "Category deleted successfully"

    # Kiểm tra trong DB xem category đã bị ẩn chưa (is_deleted = True)
    db_session.refresh(cat)
    assert cat.is_deleted == True
    assert cat.deleted_by == 999
