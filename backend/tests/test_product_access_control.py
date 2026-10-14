from app.features.categories.model import Category
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant


def test_inactive_product_hidden_from_public_and_customer(
    client, db_session, mock_user_auth
):
    # Setup Category
    cat = Category(name="Fashion Category", slug="fashion-cat")
    db_session.add(cat)
    db_session.flush()

    # Active product with active variant
    p_active = Product(
        name="Active Shirt",
        slug="active-shirt",
        price=100.0,
        currency="VND",
        is_active=True,
        category_id=cat.id,
    )
    db_session.add(p_active)
    db_session.flush()
    v1 = ProductVariant(
        product_id=p_active.id,
        sku="ACT-SHIRT-M",
        size="M",
        color_name="Blue",
        stock_quantity=10,
        reserved_quantity=2,
        sold_quantity=3,
        is_active=True,
    )
    db_session.add(v1)

    # Inactive product with active variant
    p_inactive = Product(
        name="Inactive Shirt",
        slug="inactive-shirt",
        price=120.0,
        currency="VND",
        is_active=False,
        category_id=cat.id,
    )
    db_session.add(p_inactive)
    db_session.flush()
    v2 = ProductVariant(
        product_id=p_inactive.id,
        sku="INACT-SHIRT-M",
        size="M",
        color_name="Red",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(v2)

    # Active product but NO active variants
    p_no_variant = Product(
        name="No Variant Shirt",
        slug="no-variant-shirt",
        price=150.0,
        currency="VND",
        is_active=True,
        category_id=cat.id,
    )
    db_session.add(p_no_variant)
    db_session.flush()
    v3 = ProductVariant(
        product_id=p_no_variant.id,
        sku="NO-VAR-M",
        size="M",
        color_name="Green",
        stock_quantity=5,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=False,
    )
    db_session.add(v3)
    db_session.commit()

    # 1. Anonymous user tests
    # List products
    resp = client.get("/api/v1/products")
    assert resp.status_code == 200
    items = resp.json()["items"]
    item_ids = [item["id"] for item in items]
    assert p_active.id in item_ids
    assert p_inactive.id not in item_ids
    assert p_no_variant.id not in item_ids

    # By ID
    assert client.get(f"/api/v1/products/{p_inactive.id}").status_code == 404
    assert client.get(f"/api/v1/products/{p_no_variant.id}").status_code == 404
    assert client.get(f"/api/v1/products/{p_active.id}").status_code == 200

    # By Slug
    assert client.get(f"/api/v1/products/by-slug/{p_inactive.slug}").status_code == 404
    assert (
        client.get(f"/api/v1/products/by-slug/{p_no_variant.slug}").status_code == 404
    )
    assert client.get(f"/api/v1/products/by-slug/{p_active.slug}").status_code == 200

    # Verify sensitive business metrics are NOT leaked to public
    public_detail = client.get(f"/api/v1/products/by-slug/{p_active.slug}").json()
    assert "stock_quantity" not in public_detail
    assert "reserved_quantity" not in public_detail
    assert "sold_quantity" not in public_detail
    for v in public_detail.get("variants", []):
        assert "stock_quantity" not in v
        assert "reserved_quantity" not in v
        assert "sold_quantity" not in v
        assert "available_stock" in v

    # Lookup endpoint returns minimal inactive entry for inactive product / variant
    lookup_resp = client.get(
        f"/api/v1/products/variants/lookup?ids={v1.id},{v2.id},{v3.id}"
    )
    assert lookup_resp.status_code == 200
    lookup_data = {item["id"]: item for item in lookup_resp.json()}
    assert lookup_data[v1.id]["is_active"] is True
    assert "stock_quantity" not in lookup_data[v1.id]
    assert lookup_data[v2.id]["is_active"] is False
    assert lookup_data[v2.id]["available_stock"] == 0
    assert lookup_data[v3.id]["is_active"] is False
    assert lookup_data[v3.id]["available_stock"] == 0


def test_admin_can_view_inactive_and_sees_full_stock_metrics(
    client, db_session, mock_admin_auth
):
    cat = Category(name="Admin Category", slug="admin-cat")
    db_session.add(cat)
    db_session.flush()

    p_inactive = Product(
        name="Admin Inactive",
        slug="admin-inactive",
        price=100.0,
        currency="VND",
        is_active=False,
        category_id=cat.id,
    )
    db_session.add(p_inactive)
    db_session.flush()
    v = ProductVariant(
        product_id=p_inactive.id,
        sku="ADM-INACT",
        size="L",
        color_name="Black",
        stock_quantity=20,
        reserved_quantity=5,
        sold_quantity=2,
        is_active=True,
    )
    db_session.add(v)
    db_session.commit()

    # Admin should be able to view inactive product by ID and by Slug
    resp_id = client.get(f"/api/v1/products/{p_inactive.id}")
    assert resp_id.status_code == 200
    admin_data = resp_id.json()
    assert "stock_quantity" in admin_data
    assert "reserved_quantity" in admin_data
    assert "sold_quantity" in admin_data
    assert admin_data["stock_quantity"] == 20
    assert admin_data["reserved_quantity"] == 5
    assert admin_data["sold_quantity"] == 2

    resp_slug = client.get(f"/api/v1/products/by-slug/{p_inactive.slug}")
    assert resp_slug.status_code == 200
    admin_detail = resp_slug.json()
    assert "stock_quantity" in admin_detail
    assert "variants" in admin_detail
    assert admin_detail["variants"][0]["stock_quantity"] == 20


def test_deleted_category_product_hidden_from_public(client, db_session):
    cat = Category(name="Deleted Category", slug="deleted-cat", is_deleted=True)
    db_session.add(cat)
    db_session.flush()

    p = Product(
        name="Deleted Cat Product",
        slug="deleted-cat-prod",
        price=100.0,
        currency="VND",
        is_active=True,
        category_id=cat.id,
    )
    db_session.add(p)
    db_session.flush()
    v = ProductVariant(
        product_id=p.id,
        sku="DEL-CAT-P",
        size="XL",
        color_name="Yellow",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(v)
    db_session.commit()

    assert client.get(f"/api/v1/products/{p.id}").status_code == 404
    assert client.get(f"/api/v1/products/by-slug/{p.slug}").status_code == 404

    list_res = client.get("/api/v1/products").json()["items"]
    assert p.id not in [item["id"] for item in list_res]

    lookup_res = client.get(f"/api/v1/products/variants/lookup?ids={v.id}").json()
    assert len(lookup_res) == 1
    assert lookup_res[0]["is_active"] is False
    assert lookup_res[0]["available_stock"] == 0


def test_facets_only_reflect_public_active_catalog(client, db_session):
    cat = Category(name="Active Cat For Facets", slug="facet-cat")
    db_session.add(cat)
    db_session.flush()

    # Active product
    p_act = Product(
        name="Active Facet Prod",
        slug="act-facet-prod",
        price=250.0,
        currency="VND",
        is_active=True,
        brand="ActiveBrand",
        gender="men",
        category_id=cat.id,
    )
    db_session.add(p_act)
    db_session.flush()
    v_act = ProductVariant(
        product_id=p_act.id,
        sku="ACT-FACET-S",
        size="S",
        color_name="Navy",
        color_hex="#000080",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(v_act)

    # Inactive product with distinct brand / color
    p_inact = Product(
        name="Inactive Facet Prod",
        slug="inact-facet-prod",
        price=999.0,
        currency="VND",
        is_active=False,
        brand="SecretInactiveBrand",
        gender="women",
        category_id=cat.id,
    )
    db_session.add(p_inact)
    db_session.flush()
    v_inact = ProductVariant(
        product_id=p_inact.id,
        sku="INACT-FACET-XXL",
        size="XXL",
        color_name="SecretMagenta",
        color_hex="#FF00FF",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(v_inact)
    db_session.commit()

    facets = client.get("/api/v1/products/facets").json()
    assert "ActiveBrand" in facets["brands"]
    assert "SecretInactiveBrand" not in facets["brands"]
    assert "XXL" not in facets["sizes"]
    facet_color_names = [c["name"] for c in facets["colors"]]
    assert "Navy" in facet_color_names
    assert "SecretMagenta" not in facet_color_names
