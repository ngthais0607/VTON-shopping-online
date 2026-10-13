
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant


def test_lookup_variants_success(client, db_session):
    product = Product(
        name="Linen Shirt",
        slug="linen-shirt",
        price=150000,
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    v1 = ProductVariant(
        product_id=product.id,
        sku="linen-shirt-WHT-M",
        size="M",
        color_name="White",
        color_hex="#FFFFFF",
        price=160000,
        stock_quantity=10,
        reserved_quantity=2,
        sold_quantity=1,
        is_active=True,
    )
    v2 = ProductVariant(
        product_id=product.id,
        sku="linen-shirt-BLK-L",
        size="L",
        color_name="Black",
        color_hex="#000000",
        price=None,  # Fallback to product price
        stock_quantity=5,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add_all([v1, v2])
    db_session.commit()

    response = client.get(f"/api/v1/products/variants/lookup?ids={v1.id},{v2.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2

    item1 = next(item for item in data if item["id"] == v1.id)
    assert item1["product_name"] == "Linen Shirt"
    assert item1["product_slug"] == "linen-shirt"
    assert item1["sku"] == "linen-shirt-WHT-M"
    assert item1["size"] == "M"
    assert item1["color_name"] == "White"
    assert item1["color_hex"] == "#FFFFFF"
    assert item1["price"] == 160000.0
    assert item1["stock_quantity"] == 10
    assert item1["reserved_quantity"] == 2
    assert item1["sold_quantity"] == 1
    assert item1["available_stock"] == 7
    assert item1["is_active"] is True

    item2 = next(item for item in data if item["id"] == v2.id)
    assert item2["price"] == 150000.0  # Fallback to product price
    assert item2["available_stock"] == 5


def test_lookup_variants_missing_ids_omitted(client, db_session):
    product = Product(
        name="Basic Tee",
        slug="basic-tee",
        price=99000,
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    v = ProductVariant(
        product_id=product.id,
        sku="basic-tee-WHT-S",
        size="S",
        color_name="White",
        stock_quantity=5,
        is_active=True,
    )
    db_session.add(v)
    db_session.commit()

    response = client.get(f"/api/v1/products/variants/lookup?ids={v.id},99999,88888")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == v.id


def test_lookup_variants_out_of_stock_data(client, db_session):
    product = Product(
        name="Jeans",
        slug="jeans-vintage",
        price=200000,
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    v = ProductVariant(
        product_id=product.id,
        sku="jeans-BLU-30",
        size="30",
        color_name="Blue",
        stock_quantity=5,
        reserved_quantity=2,
        sold_quantity=3,
        is_active=True,
    )
    db_session.add(v)
    db_session.commit()

    response = client.get(f"/api/v1/products/variants/lookup?ids={v.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["stock_quantity"] == 5
    assert data[0]["available_stock"] == 0


def test_lookup_variants_rejects_more_than_50_ids(client):
    ids = ",".join(str(i) for i in range(1, 52))
    response = client.get(f"/api/v1/products/variants/lookup?ids={ids}")
    assert response.status_code == 400
    assert response.json()["code"] == "too_many_variant_ids"


def test_lookup_variants_empty_ids(client):
    response = client.get("/api/v1/products/variants/lookup?ids=")
    assert response.status_code == 200
    assert response.json() == []
