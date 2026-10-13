from unittest.mock import patch

import pytest
from sqlalchemy import event

from app.features.categories.model import Category
from app.features.products.model import Product, ProductImage

PRODUCTS_PATH = "/api/v1/products"


def valid_product_payload(**overrides):
    payload = {
        "name": "Inventory Validation Product",
        "price": 25.0,
        "currency": "USD",
        "stock_quantity": 10,
        "is_active": True,
        "description": "Valid inventory baseline",
    }
    payload.update(overrides)
    return payload


def persist_category(db_session, **values) -> Category:
    if "slug" not in values:
        from app.core.slug import generate_unique_slug
        existing_slugs = set(s[0] for s in db_session.query(Category.slug).all())
        values["slug"] = generate_unique_slug(values.get("name", "category"), existing_slugs)
    category = Category(**values)
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)
    return category


def persist_product(db_session, **values) -> Product:
    defaults = {
        "name": "Catalog product",
        "price": 25.0,
        "stock_quantity": 10,
        "reserved_quantity": 0,
        "sold_quantity": 0,
        "currency": "USD",
        "is_active": True,
    }
    merged = defaults | values
    if "slug" not in merged:
        from app.core.slug import generate_unique_slug
        existing_slugs = set(s[0] for s in db_session.query(Product.slug).all())
        merged["slug"] = generate_unique_slug(merged["name"], existing_slugs)
    product = Product(**merged)
    db_session.add(product)
    db_session.flush()

    if not product.variants:
        from app.features.products.variant_model import ProductVariant
        variant = ProductVariant(
            product_id=product.id,
            sku=f"P{product.id}-DEFAULT",
            size="ONE_SIZE",
            color_name="Default",
            stock_quantity=merged.get("stock_quantity", 10),
            reserved_quantity=merged.get("reserved_quantity", 0),
            sold_quantity=merged.get("sold_quantity", 0),
            is_active=merged.get("is_active", True),
        )
        db_session.add(variant)

    db_session.commit()
    db_session.refresh(product)
    return product


@pytest.mark.parametrize(
    "overrides",
    [
        {"price": -1},
        {"stock_quantity": -1},
        {"reserved_quantity": -1},
        {"sold_quantity": -1},
        {"reserved_quantity": 2},
        {"sold_quantity": 3},
    ],
)
def test_create_product_inventory_validation_rejects_invalid_values(
    client, mock_admin_auth, overrides
):
    response = client.post(PRODUCTS_PATH, json=valid_product_payload(**overrides))

    assert response.status_code == 422


def test_create_product_allows_zero_price(client, mock_admin_auth):
    response = client.post(PRODUCTS_PATH, json=valid_product_payload(name="Freebie", price=0))
    assert response.status_code == 201
    assert response.json()["price"] == 0.0


def test_create_product_returns_typed_response(client, mock_admin_auth):
    response = client.post(
        PRODUCTS_PATH,
        json=valid_product_payload(name="Wireless headphones"),
    )

    assert response.status_code == 201
    assert response.json().keys() == {
        "id",
        "name",
        "slug",
        "price",
        "description",
        "stock_quantity",
        "reserved_quantity",
        "sold_quantity",
        "currency",
        "is_active",
        "brand",
        "gender",
        "material",
        "fit",
        "care_instructions",
        "size_chart",
        "price_min",
        "price_max",
        "category",
        "images",
        "created_at",
        "updated_at",
    }
    assert response.json()["name"] == "Wireless headphones"
    assert response.json()["category"] is None
    assert response.json()["images"] == []


def test_list_products_returns_page_contract(client, db_session):
    persist_product(db_session, name="First")
    persist_product(db_session, name="Second")

    response = client.get(PRODUCTS_PATH)

    assert response.status_code == 200
    assert response.json().keys() == {"items", "total", "limit", "offset"}
    assert response.json()["total"] == 2
    assert response.json()["limit"] == 20
    assert response.json()["offset"] == 0
    assert {item["name"] for item in response.json()["items"]} == {
        "First",
        "Second",
    }


def test_list_products_applies_search_price_active_and_category_filters(
    client,
    db_session,
):
    category = persist_category(db_session, name="Wearables")
    persist_product(
        db_session,
        name="Smart Watch",
        description="OLED fitness wearable",
        price=199.0,
        category_id=category.id,
    )
    persist_product(
        db_session,
        name="Budget Watch",
        description="LCD fitness wearable",
        price=49.0,
        category_id=category.id,
    )
    persist_product(
        db_session,
        name="Inactive Watch",
        description="OLED fitness wearable",
        price=149.0,
        category_id=category.id,
        is_active=False,
    )
    persist_product(db_session, name="Desk Lamp", price=80.0)

    response = client.get(
        PRODUCTS_PATH,
        params={
            "search": "OLED fitness",
            "min_price": 100,
            "max_price": 200,
            "category_id": category.id,
            "is_active": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["name"] == "Smart Watch"


def test_product_filters_accept_only_canonical_enum_values(client, db_session):
    persist_product(db_session, name="Available", price=20, stock_quantity=5)
    persist_product(db_session, name="Unavailable", price=10, stock_quantity=0)

    sorted_response = client.get(PRODUCTS_PATH, params={"sort": "price_asc"})
    stock_response = client.get(
        PRODUCTS_PATH,
        params={"stock_status": "in_stock"},
    )

    assert sorted_response.status_code == 200
    assert [item["price"] for item in sorted_response.json()["items"]] == [
        10.0,
        20.0,
    ]
    assert stock_response.status_code == 200
    assert [item["name"] for item in stock_response.json()["items"]] == ["Available"]

    assert client.get(PRODUCTS_PATH, params={"sort": "price-asc"}).status_code == 422
    assert (
        client.get(PRODUCTS_PATH, params={"stock_status": "instock"}).status_code == 422
    )


def test_list_products_uses_stable_offset_pagination(client, db_session):
    for index in range(3):
        persist_product(db_session, name=f"Product {index}", price=10 + index)

    response = client.get(
        PRODUCTS_PATH,
        params={"sort": "price_asc", "limit": 2, "offset": 2},
    )

    assert response.status_code == 200
    assert response.json()["total"] == 3
    assert response.json()["limit"] == 2
    assert response.json()["offset"] == 2
    assert [item["name"] for item in response.json()["items"]] == ["Product 2"]


def test_deleted_category_products_are_hidden_from_catalog(client, db_session):
    active_category = persist_category(db_session, name="Active")
    deleted_category = persist_category(
        db_session,
        name="Deleted",
        is_deleted=True,
    )
    visible = persist_product(
        db_session,
        name="Visible",
        category_id=active_category.id,
    )
    hidden = persist_product(
        db_session,
        name="Hidden",
        category_id=deleted_category.id,
    )

    response = client.get(PRODUCTS_PATH)
    hidden_response = client.get(f"{PRODUCTS_PATH}/{hidden.id}")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [visible.id]
    assert hidden_response.status_code == 404
    assert hidden_response.json()["code"] == "product_not_found"


def test_deleted_category_filter_uses_common_not_found_response(client, db_session):
    deleted_category = persist_category(
        db_session,
        name="Deleted",
        is_deleted=True,
    )

    response = client.get(
        PRODUCTS_PATH,
        params={"category_id": deleted_category.id},
    )

    assert response.status_code == 404
    assert response.json() == {
        "code": "category_not_found",
        "message": f"Category {deleted_category.id} was not found",
        "details": None,
    }


def test_get_product_returns_category_and_public_image_url(client, db_session):
    category = persist_category(db_session, name="Electronics")
    product = persist_product(
        db_session,
        name="Camera",
        category_id=category.id,
    )
    image = ProductImage(
        id="camera-front",
        product_id=product.id,
        object_name="products/camera-front.png",
    )
    db_session.add(image)
    db_session.commit()

    response = client.get(f"{PRODUCTS_PATH}/{product.id}")

    assert response.status_code == 200
    assert response.json()["category"] == {
        "id": category.id,
        "name": "Electronics",
    }
    assert len(response.json()["images"]) == 1
    assert response.json()["images"][0]["id"] == "camera-front"
    assert (
        response.json()["images"][0]["url"]
        == "http://localhost:9000/product-images/products/camera-front.png"
    )


def test_list_products_eager_loads_category_and_images_without_n_plus_one(
    client,
    db_session,
):
    category = persist_category(db_session, name="Electronics")
    for index in range(4):
        product = persist_product(
            db_session,
            name=f"Camera {index}",
            category_id=category.id,
        )
        db_session.add(
            ProductImage(
                id=f"camera-{index}",
                product_id=product.id,
                object_name=f"products/camera-{index}.png",
            )
        )
    db_session.commit()
    db_session.expire_all()

    select_statements = []

    def count_selects(_conn, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT"):
            select_statements.append(statement)

    event.listen(db_session.bind, "before_cursor_execute", count_selects)
    try:
        response = client.get(PRODUCTS_PATH)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", count_selects)

    assert response.status_code == 200
    assert len(response.json()["items"]) == 4
    assert all(
        item["category"]["name"] == "Electronics" for item in response.json()["items"]
    )
    assert all(len(item["images"]) == 1 for item in response.json()["items"])
    assert len(select_statements) == 4


def test_patch_product_is_partial(client, db_session, mock_admin_auth):
    product = persist_product(
        db_session,
        name="Original",
        description="Keep me",
        price=45.0,
        stock_quantity=10,
        reserved_quantity=2,
        sold_quantity=3,
    )

    response = client.patch(
        f"{PRODUCTS_PATH}/{product.id}",
        json={"name": "New"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "New"
    assert response.json()["description"] == "Keep me"
    assert response.json()["price"] == 45.0
    assert response.json()["stock_quantity"] == 10
    assert response.json()["reserved_quantity"] == 2
    assert response.json()["sold_quantity"] == 3


@pytest.mark.parametrize(
    "payload",
    [
        {"price": -1},
        {"stock_quantity": -1},
        {"reserved_quantity": 2},
        {"sold_quantity": 3},
    ],
)
def test_patch_product_preserves_inventory_validation(
    client,
    db_session,
    mock_admin_auth,
    payload,
):
    product = persist_product(db_session)

    response = client.patch(f"{PRODUCTS_PATH}/{product.id}", json=payload)

    assert response.status_code == 422


def test_adjust_product_stock_endpoint(client, db_session, mock_admin_auth):
    product = persist_product(db_session, stock_quantity=10, reserved_quantity=2, sold_quantity=1)

    # Valid adjustment
    res = client.post(
        f"{PRODUCTS_PATH}/{product.id}/adjust-stock",
        json={"stock_quantity": 15, "reason": "Restocked from warehouse"},
    )
    assert res.status_code == 200
    assert res.json()["stock_quantity"] == 15

    # Invalid adjustment: less than reserved + sold (3)
    res_invalid = client.post(
        f"{PRODUCTS_PATH}/{product.id}/adjust-stock",
        json={"stock_quantity": 2, "reason": "Downsizing"},
    )
    assert res_invalid.status_code == 400
    assert res_invalid.json()["code"] == "invalid_product_inventory"


def test_patch_product_rejects_inventory_invalid_after_merge(
    client,
    db_session,
    mock_admin_auth,
):
    product = persist_product(
        db_session,
        stock_quantity=10,
        reserved_quantity=4,
        sold_quantity=3,
    )

    response = client.patch(
        f"{PRODUCTS_PATH}/{product.id}",
        json={"stock_quantity": 6},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_product_inventory"


def test_create_product_rejects_deleted_category(
    client,
    db_session,
    mock_admin_auth,
):
    deleted_category = persist_category(
        db_session,
        name="Deleted",
        is_deleted=True,
    )

    response = client.post(
        PRODUCTS_PATH,
        json=valid_product_payload(category_id=deleted_category.id),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "category_not_found"


def test_product_write_services_commit_exactly_once(db_session):
    from app.features.products import service
    from app.features.products.schemas import ProductCreate, ProductPatch

    with patch.object(db_session, "commit", wraps=db_session.commit) as commit:
        product = service.create_product(
            db_session,
            ProductCreate(**valid_product_payload(name="Created by service")),
        )
        assert commit.call_count == 1

    with patch.object(db_session, "commit", wraps=db_session.commit) as commit:
        updated = service.update_product(
            db_session,
            product.id,
            ProductPatch(name="Updated by service"),
        )
        assert updated.name == "Updated by service"
        assert commit.call_count == 1

    with patch.object(db_session, "commit", wraps=db_session.commit) as commit:
        service.delete_product(db_session, product.id)
        assert commit.call_count == 1

    db_session.refresh(product)
    assert product.is_deleted is True
    assert product.deleted_at is not None


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_missing_product_uses_common_not_found_response(
    client,
    mock_admin_auth,
    method,
):
    request = getattr(client, method)
    kwargs = {"json": {"name": "Updated"}} if method == "patch" else {}

    response = request(f"{PRODUCTS_PATH}/999999", **kwargs)

    assert response.status_code == 404
    assert response.json() == {
        "code": "product_not_found",
        "message": "Product 999999 was not found",
        "details": None,
    }


def test_delete_product_returns_no_content(client, db_session, mock_admin_auth):
    product = persist_product(db_session)

    response = client.delete(f"{PRODUCTS_PATH}/{product.id}")

    assert response.status_code == 204
    assert response.content == b""

    db_session.refresh(product)
    assert product.is_deleted is True
    assert product.deleted_at is not None


def test_get_product_by_slug_returns_detail(client, db_session):
    from app.features.products.variant_model import ProductVariant

    p = persist_product(
        db_session,
        name="Linen Blazer",
        slug="linen-blazer",
        price=500000,
        brand="Zara",
        gender="women",
    )
    v1 = ProductVariant(
        product_id=p.id,
        sku="linen-blazer-BEI-S",
        size="S",
        color_name="Beige",
        color_hex="#F5F5DC",
        price=550000,
        stock_quantity=10,
        is_active=True,
    )
    db_session.add(v1)
    db_session.commit()

    response = client.get(f"{PRODUCTS_PATH}/by-slug/linen-blazer")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Linen Blazer"
    assert data["slug"] == "linen-blazer"
    assert data["brand"] == "Zara"
    assert data["gender"] == "women"
    assert data["price_min"] == 500000.0
    assert data["price_max"] == 550000.0
    assert "S" in data["available_sizes"]
    assert any(c["name"] == "Beige" for c in data["available_colors"])


def test_get_product_by_slug_not_found(client):
    response = client.get(f"{PRODUCTS_PATH}/by-slug/non-existent-slug")
    assert response.status_code == 404
    assert response.json()["code"] == "product_not_found"


def test_get_product_facets(client, db_session):
    persist_product(db_session, name="Men Shirt", brand="Nike", gender="men", price=100)
    persist_product(db_session, name="Women Dress", brand="Adidas", gender="women", price=200)

    response = client.get(f"{PRODUCTS_PATH}/facets")
    assert response.status_code == 200
    facets = response.json()
    assert "men" in facets["genders"]
    assert "women" in facets["genders"]
    assert "Nike" in facets["brands"]
    assert "Adidas" in facets["brands"]
    assert facets["price_min"] == 100.0
    assert facets["price_max"] == 200.0


def test_list_products_fashion_filters(client, db_session):
    root_cat = persist_category(db_session, name="Fashion")
    sub_cat = persist_category(db_session, name="Shoes", parent_id=root_cat.id)

    p1 = persist_product(
        db_session,
        name="Running Shoes",
        brand="Nike",
        gender="men",
        category_id=sub_cat.id,
    )
    p2 = persist_product(
        db_session,
        name="Fashion Scarf",
        brand="Gucci",
        gender="women",
        category_id=root_cat.id,
    )

    # Filter by brand
    res_brand = client.get(PRODUCTS_PATH, params={"brand": "Nike"})
    assert res_brand.status_code == 200
    assert [item["id"] for item in res_brand.json()["items"]] == [p1.id]

    # Filter by gender
    res_gender = client.get(PRODUCTS_PATH, params={"gender": "women"})
    assert res_gender.status_code == 200
    assert [item["id"] for item in res_gender.json()["items"]] == [p2.id]

    # Recursive category filter: filtering by root_cat returns both root product and subcategory product!
    res_cat = client.get(PRODUCTS_PATH, params={"category_id": root_cat.id})
    assert res_cat.status_code == 200
    ret_ids = {item["id"] for item in res_cat.json()["items"]}
    assert p1.id in ret_ids
    assert p2.id in ret_ids


def test_update_product_activation_requires_active_variant(client, db_session, mock_admin_auth):
    p = persist_product(db_session, name="Inactive Item", is_active=False)
    # Mark all variants inactive
    for v in p.variants:
        v.is_active = False
    db_session.commit()

    response = client.patch(
        f"{PRODUCTS_PATH}/{p.id}",
        json={"is_active": True},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "no_active_variants"

