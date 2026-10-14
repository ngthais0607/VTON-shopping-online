from decimal import Decimal

from sqlalchemy.orm import Session

from app.features.products.model import Product
from app.features.products.variant_model import InventoryAdjustment, ProductVariant


def test_two_variants_retain_stock_after_name_only_patch(
    client, db_session: Session, mock_admin_auth
):
    product = Product(
        name="Classic Oxford Shirt",
        slug="classic-oxford-shirt",
        price=Decimal("450000.00"),
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    v1 = ProductVariant(
        product_id=product.id,
        sku="OXFORD-BLU-M",
        color_name="Blue",
        size="M",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    v2 = ProductVariant(
        product_id=product.id,
        sku="OXFORD-BLU-L",
        color_name="Blue",
        size="L",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add_all([v1, v2])
    db_session.commit()

    # Name-only PATCH
    patch_resp = client.patch(
        f"/api/v1/products/{product.id}",
        json={"name": "Updated Oxford Shirt"},
    )
    assert patch_resp.status_code == 200

    db_session.expire_all()
    v1_refreshed = db_session.get(ProductVariant, v1.id)
    v2_refreshed = db_session.get(ProductVariant, v2.id)
    prod_refreshed = db_session.get(Product, product.id)

    assert v1_refreshed.stock_quantity == 10
    assert v2_refreshed.stock_quantity == 10
    assert prod_refreshed.stock_quantity == 20


def test_product_post_and_patch_with_stock_quantity_returns_422(
    client, db_session: Session, mock_admin_auth
):
    # POST with stock_quantity rejected
    create_resp = client.post(
        "/api/v1/products",
        json={
            "name": "Invalid Create Product",
            "price": 100000,
            "currency": "VND",
            "stock_quantity": 50,
        },
    )
    assert create_resp.status_code == 422
    assert "stock_quantity" in str(create_resp.json())

    # Create valid product
    valid_create = client.post(
        "/api/v1/products",
        json={
            "name": "Valid Product",
            "price": 100000,
            "currency": "VND",
        },
    )
    assert valid_create.status_code == 201
    prod_id = valid_create.json()["id"]

    # PATCH with stock_quantity rejected
    patch_resp = client.patch(
        f"/api/v1/products/{prod_id}",
        json={"stock_quantity": 99},
    )
    assert patch_resp.status_code == 422
    assert "stock_quantity" in str(patch_resp.json())


def test_variant_adjust_stock_flow_and_audit(
    client, db_session: Session, mock_admin_auth
):
    product = Product(
        name="Linen Pants",
        slug="linen-pants",
        price=Decimal("300000.00"),
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    v1 = ProductVariant(
        product_id=product.id,
        sku="LINEN-BEI-30",
        color_name="Beige",
        size="30",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    v2 = ProductVariant(
        product_id=product.id,
        sku="LINEN-BEI-32",
        color_name="Beige",
        size="32",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add_all([v1, v2])
    db_session.commit()

    # Adjust variant 1 to 15
    adjust_resp = client.post(
        f"/api/v1/variants/{v1.id}/adjust-stock",
        json={"stock_quantity": 15, "reason": "Restocked shipment from warehouse"},
    )
    assert adjust_resp.status_code == 200
    assert adjust_resp.json()["stock_quantity"] == 15

    db_session.expire_all()
    prod_refreshed = db_session.get(Product, product.id)
    assert prod_refreshed.stock_quantity == 25

    # Check audit log
    adjustments = (
        db_session.query(InventoryAdjustment)
        .filter(InventoryAdjustment.variant_id == v1.id)
        .all()
    )
    assert len(adjustments) == 1
    assert adjustments[0].old_stock == 10
    assert adjustments[0].new_stock == 15
    assert adjustments[0].reason == "Restocked shipment from warehouse"


def test_invalid_adjustment_below_reserved_and_sold_rejected(
    client, db_session: Session, mock_admin_auth
):
    product = Product(
        name="Denim Jacket",
        slug="denim-jacket",
        price=Decimal("800000.00"),
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="DENIM-BLU-M",
        color_name="Blue",
        size="M",
        stock_quantity=10,
        reserved_quantity=4,
        sold_quantity=2,
        is_active=True,
    )
    db_session.add(variant)
    db_session.commit()

    # Attempt to set stock to 5 (less than 4 reserved + 2 sold = 6)
    adjust_resp = client.post(
        f"/api/v1/variants/{variant.id}/adjust-stock",
        json={"stock_quantity": 5, "reason": "Inventory count reduction"},
    )
    assert adjust_resp.status_code == 400
    assert adjust_resp.json()["code"] == "invalid_variant_inventory"

    db_session.expire_all()
    variant_refreshed = db_session.get(ProductVariant, variant.id)
    assert variant_refreshed.stock_quantity == 10

    adjustments = (
        db_session.query(InventoryAdjustment)
        .filter(InventoryAdjustment.variant_id == variant.id)
        .all()
    )
    assert len(adjustments) == 0
