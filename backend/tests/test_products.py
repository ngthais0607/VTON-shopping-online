def test_get_products_empty(client):
    """Kiểm tra xem khi database trống thì danh sách sản phẩm trả về có cấu trúc phân trang rỗng"""
    response = client.get("/products/")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["limit"] == 20


def test_create_product_success(client, mock_admin_auth):
    """Kiểm tra thêm mới sản phẩm thành công khi dùng quyền Admin giả lập"""
    payload = {
        "name": "Tai Nghe Không Dây Test",
        "price": 120.5,
        "currency": "USD",
        "stock_quantity": 50,
        "reserved_quantity": 0,
        "sold_quantity": 0,
        "is_active": True,
        "description": "Sản phẩm thử nghiệm unit test"
    }
    
    response = client.post("/products/", json=payload)
    
    # 201 đại diện cho Created (Tạo thành công)
    assert response.status_code == 201
    
    data = response.json()
    assert data["name"] == "Tai Nghe Không Dây Test"
    assert data["price"] == 120.5
    assert "id" in data # ID tự sinh phải tồn tại


def test_get_products_pagination(client, mock_admin_auth):
    """Kiểm tra phân trang, tìm kiếm và lọc danh mục sản phẩm"""
    # 1. Tạo category để test lọc danh mục
    cat_response = client.post("/categories/", json={"name": "Electronics"})
    assert cat_response.status_code == 201
    category_id = cat_response.json()["id"]

    # 2. Tạo 3 sản phẩm (2 cái thuộc category, 1 cái có tên khác)
    p1 = {
        "name": "Product Alpha",
        "price": 10.0,
        "currency": "USD",
        "stock_quantity": 10,
        "reserved_quantity": 0,
        "sold_quantity": 0,
        "is_active": True,
        "description": "Desc Alpha",
        "category_id": category_id
    }
    p2 = {
        "name": "Product Beta",
        "price": 20.0,
        "currency": "USD",
        "stock_quantity": 20,
        "reserved_quantity": 0,
        "sold_quantity": 0,
        "is_active": True,
        "description": "Desc Beta",
        "category_id": category_id
    }
    p3 = {
        "name": "Special Gadget",
        "price": 30.0,
        "currency": "USD",
        "stock_quantity": 30,
        "reserved_quantity": 0,
        "sold_quantity": 0,
        "is_active": True,
        "description": "Desc Gadget",
        "category_id": None
    }
    client.post("/products/", json=p1)
    client.post("/products/", json=p2)
    client.post("/products/", json=p3)

    # Test limit và offset
    response = client.get("/products/?limit=2&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert data["total"] == 3
    assert data["page"] == 1
    assert data["limit"] == 2


    response = client.get("/products/?limit=2&offset=2")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["total"] == 3
    assert data["page"] == 2

    # Test tìm kiếm
    response = client.get("/products/?search=Alpha")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["name"] == "Product Alpha"

    # Test lọc danh mục
    response = client.get(f"/products/?category_id={category_id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert all(p["category"]["id"] == category_id for p in data["items"])


def test_get_products_filters_and_sorting(client, db_session):
    from app.features.products.model import Product
    from app.features.categories.model import Category

    # Setup categories
    cat1 = Category(name="Category A")
    cat2 = Category(name="Category B")
    db_session.add(cat1)
    db_session.add(cat2)
    db_session.commit()

    # Setup products
    p1 = Product(name="Alpha", price=10.0, stock_quantity=10, is_active=True, category_id=cat1.id)
    p2 = Product(name="Beta", price=5.0, stock_quantity=0, is_active=True, category_id=cat1.id)
    p3 = Product(name="Gamma", price=20.0, stock_quantity=3, is_active=False, category_id=cat2.id)
    db_session.add_all([p1, p2, p3])
    db_session.commit()

    # Test active filter
    res = client.get("/products/?is_active=true")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    names = [item["name"] for item in data["items"]]
    assert "Alpha" in names
    assert "Beta" in names
    assert "Gamma" not in names

    # Test stock status filter
    res = client.get("/products/?stock_status=outofstock")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "Beta"

    # Test sorting by price asc
    res = client.get("/products/?sort_by=price-asc")
    assert res.status_code == 200
    data = res.json()
    prices = [item["price"] for item in data["items"]]
    assert prices == [5.0, 10.0, 20.0]

    # Test sorting by price desc
    res_desc = client.get("/products/?sort_by=price_desc")
    assert res_desc.status_code == 200
    data_desc = res_desc.json()
    prices_desc = [item["price"] for item in data_desc["items"]]
    assert prices_desc == [20.0, 10.0, 5.0]

    # Test stock status underscored filter
    res_stock = client.get("/products/?stock_status=in_stock")
    assert res_stock.status_code == 200
    assert len(res_stock.json()["items"]) == 2

    # Test limit validation capping at 100
    res_limit = client.get("/products/?limit=200")
    assert res_limit.status_code == 422 # FastAPI validation error for le=100


def test_get_products_min_max_price_and_description_search(client, db_session):
    from app.features.products.model import Product

    p1 = Product(name="Wireless Earbuds", description="Pastel blue ANC noise cancelling", price=49.0, stock_quantity=10, is_active=True)
    p2 = Product(name="Smart Watch", description="OLED display fitness watch", price=199.0, stock_quantity=5, is_active=True)
    p3 = Product(name="Studio Laptop", description="High performance workstation", price=1299.0, stock_quantity=2, is_active=True)
    db_session.add_all([p1, p2, p3])
    db_session.commit()

    # Test min_price & max_price filtering
    res_price = client.get("/products/?min_price=100&max_price=500")
    assert res_price.status_code == 200
    items = res_price.json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Smart Watch"

    # Test fuzzy description search
    res_desc = client.get("/products/?search=noise+cancelling")
    assert res_desc.status_code == 200
    assert len(res_desc.json()["items"]) == 1
    assert res_desc.json()["items"][0]["name"] == "Wireless Earbuds"

