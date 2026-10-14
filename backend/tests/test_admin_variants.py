from app.features.orders.domain import OrderStatus
from app.features.orders.model import Order, OrderItem
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant


def test_bulk_variant_matrix_generation_is_idempotent(
    client, db_session, mock_admin_auth
):
    product = Product(
        name="Cotton Polo",
        slug="cotton-polo",
        price=120000,
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.commit()

    payload = {
        "sizes": ["S", "M"],
        "colors": [{"name": "Navy", "hex": "#000080"}],
        "default_stock": 15,
    }

    # First generation
    res1 = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json=payload,
    )
    assert res1.status_code == 201
    variants1 = res1.json()
    assert len(variants1) == 2
    skus = {v["sku"] for v in variants1}
    assert "cotton-polo-NAVY-S" in skus
    assert "cotton-polo-NAVY-M" in skus
    assert all(v["stock_quantity"] == 15 for v in variants1)

    # Second generation with same payload: idempotent skip
    res2 = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json=payload,
    )
    assert res2.status_code == 201
    variants2 = res2.json()
    assert len(variants2) == 2
    assert {v["id"] for v in variants2} == {v["id"] for v in variants1}


def test_adjust_stock_requires_reason(client, db_session, mock_admin_auth):
    product = Product(
        name="T-Shirt",
        slug="t-shirt",
        price=50000,
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="t-shirt-BLK-L",
        size="L",
        color_name="Black",
        stock_quantity=10,
        is_active=True,
    )
    db_session.add(variant)
    db_session.commit()

    # Empty reason
    res = client.post(
        f"/api/v1/variants/{variant.id}/adjust-stock",
        json={"stock_quantity": 20, "reason": ""},
    )
    assert res.status_code == 422


def test_adjust_stock_blocks_decrement_below_reserved_plus_sold(
    client, db_session, mock_admin_auth
):
    product = Product(
        name="Dress",
        slug="dress",
        price=300000,
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="dress-RED-S",
        size="S",
        color_name="Red",
        stock_quantity=10,
        reserved_quantity=3,
        sold_quantity=2,
        is_active=True,
    )
    db_session.add(variant)
    db_session.commit()

    # Try setting stock to 4 (which is < reserved 3 + sold 2 = 5)
    res_bad = client.post(
        f"/api/v1/variants/{variant.id}/adjust-stock",
        json={"stock_quantity": 4, "reason": "Inventory count update"},
    )
    assert res_bad.status_code == 400
    assert res_bad.json()["code"] == "invalid_variant_inventory"

    # Set stock to 6 (valid)
    res_good = client.post(
        f"/api/v1/variants/{variant.id}/adjust-stock",
        json={"stock_quantity": 6, "reason": "Audit restock"},
    )
    assert res_good.status_code == 200
    assert res_good.json()["stock_quantity"] == 6
    assert res_good.json()["available_stock"] == 1


def test_delete_variant_soft_deactivates_if_orders_exist(
    client, db_session, mock_admin_auth
):
    product = Product(
        name="Jacket",
        slug="jacket",
        price=400000,
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="jacket-BLK-M",
        size="M",
        color_name="Black",
        stock_quantity=5,
        is_active=True,
    )
    db_session.add(variant)
    db_session.flush()

    order = Order(
        customer_name="Customer",
        customer_phone="0123456789",
        shipping_address="Address",
        payment_method="vietqr",
        status=OrderStatus.PAID,
        total_amount=400000,
    )
    db_session.add(order)
    db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=product.id,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        product_name=product.name,
        unit_price=400000,
        quantity=1,
        subtotal=400000,
    )
    db_session.add(item)
    db_session.commit()

    res = client.delete(f"/api/v1/variants/{variant.id}")
    assert res.status_code in (200, 204)

    db_session.refresh(variant)
    assert variant.is_active is False  # Soft deactivated


def test_delete_variant_hard_deletes_if_no_orders(client, db_session, mock_admin_auth):
    product = Product(
        name="Cap",
        slug="cap",
        price=50000,
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="cap-BLU-ONE",
        size="ONE_SIZE",
        color_name="Blue",
        stock_quantity=5,
        is_active=True,
    )
    db_session.add(variant)
    db_session.commit()
    variant_id = variant.id

    res = client.delete(f"/api/v1/variants/{variant_id}")
    assert res.status_code in (200, 204)

    assert db_session.get(ProductVariant, variant_id) is None


def test_adjust_stock_records_audit_trail_and_can_be_queried(
    client, db_session, mock_admin_auth
):
    product = Product(
        name="Linen Shirt",
        slug="linen-shirt",
        price=250000,
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="linen-shirt-WHT-L",
        size="L",
        color_name="White",
        stock_quantity=10,
        is_active=True,
    )
    db_session.add(variant)
    db_session.commit()

    # Perform stock adjustment
    res = client.post(
        f"/api/v1/variants/{variant.id}/adjust-stock",
        json={"stock_quantity": 25, "reason": "Restock shipment #1042"},
    )
    assert res.status_code == 200
    assert res.json()["stock_quantity"] == 25

    # Query adjustment history
    adj_res = client.get(f"/api/v1/variants/{variant.id}/adjustments")
    assert adj_res.status_code == 200
    history = adj_res.json()
    assert len(history) == 1
    assert history[0]["variant_id"] == variant.id
    assert history[0]["old_stock"] == 10
    assert history[0]["new_stock"] == 25
    assert history[0]["delta"] == 15
    assert history[0]["reason"] == "Restock shipment #1042"
    assert "created_at" in history[0]


def test_patch_variant_forbids_stock_quantity(client, db_session, mock_admin_auth):
    product = Product(
        name="Chino Pants",
        slug="chino-pants",
        price=350000,
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku="chino-pants-KHA-32",
        size="32",
        color_name="Khaki",
        stock_quantity=12,
        is_active=True,
    )
    db_session.add(variant)
    db_session.commit()

    # Attempting to update stock_quantity directly via PATCH should be rejected (422)
    res = client.patch(
        f"/api/v1/variants/{variant.id}",
        json={"stock_quantity": 99},
    )
    assert res.status_code == 422


def test_sku_collision_returns_409_duplicate_sku(client, db_session, mock_admin_auth):
    product = Product(
        name="Silk Scarf",
        slug="silk-scarf",
        price=180000,
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    v1 = ProductVariant(
        product_id=product.id,
        sku="scarf-RED",
        size="ONE_SIZE",
        color_name="Red",
        stock_quantity=5,
        is_active=True,
    )
    v2 = ProductVariant(
        product_id=product.id,
        sku="scarf-BLU",
        size="ONE_SIZE",
        color_name="Blue",
        stock_quantity=5,
        is_active=True,
    )
    db_session.add_all([v1, v2])
    db_session.commit()

    # Bulk create attempting to use existing SKU "scarf-RED"
    res_bulk = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json={
            "variants": [
                {
                    "sku": "scarf-RED",
                    "size": "L",
                    "color_name": "Crimson",
                    "stock_quantity": 10,
                }
            ]
        },
    )
    assert res_bulk.status_code == 409
    assert res_bulk.json()["code"] == "duplicate_sku"

    # Patch attempting to rename v2 SKU to v1 SKU
    res_patch = client.patch(
        f"/api/v1/variants/{v2.id}",
        json={"sku": "scarf-RED"},
    )
    assert res_patch.status_code == 409
    assert res_patch.json()["code"] == "duplicate_sku"


def test_bulk_variant_explicit_zero_stock_not_overridden_by_default(
    client, db_session, mock_admin_auth
):
    product = Product(
        name="Zero Stock Jacket",
        slug="zero-stock-jacket",
        price=200000,
        is_active=True,
    )
    db_session.add(product)
    db_session.commit()

    payload = {
        "variants": [
            {
                "size": "S",
                "color_name": "Red",
                "color_hex": "#FF0000",
                "stock_quantity": 0,
            }
        ],
        "default_stock": 25,
    }
    res = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json=payload,
    )
    assert res.status_code == 201
    variants = res.json()
    assert len(variants) == 1
    assert variants[0]["stock_quantity"] == 0


def test_variant_hex_code_validation(client, db_session, mock_admin_auth):
    product = Product(
        name="Hex Validation Shirt",
        slug="hex-val-shirt",
        price=100000,
        is_active=True,
    )
    db_session.add(product)
    db_session.commit()

    # Invalid hex formats
    for bad_hex in ["#123", "123456", "#GGGGGG", "red", "#1234567"]:
        res_bad = client.post(
            f"/api/v1/products/{product.id}/variants/bulk",
            json={
                "sizes": ["M"],
                "colors": [{"name": "Red", "hex": bad_hex}],
            },
        )
        assert res_bad.status_code == 422

    # Valid hex format
    res_good = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json={
            "sizes": ["M"],
            "colors": [{"name": "ValidBlue", "hex": "#0000FF"}],
        },
    )
    assert res_good.status_code == 201


def test_bulk_create_variants_rejects_incomplete_matrix_or_blank_entries(
    client, db_session, mock_admin_auth
):
    product = Product(
        name="Validation Matrix Product",
        slug="val-matrix-prod",
        price=150000,
        is_active=True,
    )
    db_session.add(product)
    db_session.commit()

    # 1. Empty payload rejected with 422
    res_empty = client.post(f"/api/v1/products/{product.id}/variants/bulk", json={})
    assert res_empty.status_code == 422

    # 2. Only sizes rejected with 422
    res_sizes = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json={"sizes": ["S", "M"]},
    )
    assert res_sizes.status_code == 422

    # 3. Only colors rejected with 422
    res_colors = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json={"colors": [{"name": "Red", "hex": "#FF0000"}]},
    )
    assert res_colors.status_code == 422

    # 4. Blank size entry rejected with 422
    res_blank_size = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json={
            "sizes": ["S", "   "],
            "colors": [{"name": "Red", "hex": "#FF0000"}],
        },
    )
    assert res_blank_size.status_code == 422

    # 5. Blank color name rejected with 422
    res_blank_color = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json={
            "sizes": ["S"],
            "colors": [{"name": "   ", "hex": "#FF0000"}],
        },
    )
    assert res_blank_color.status_code == 422

    # 6. Partial matrix alongside explicit variants rejected with 422
    res_partial_alongside = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json={
            "variants": [{"size": "L", "color_name": "Green", "stock_quantity": 5}],
            "sizes": ["XL"],
        },
    )
    assert res_partial_alongside.status_code == 422


def test_bulk_create_variants_supports_explicit_and_mixed_complete_payloads(
    client, db_session, mock_admin_auth
):
    product = Product(
        name="Mixed Payload Product",
        slug="mixed-payload-prod",
        price=180000,
        is_active=True,
    )
    db_session.add(product)
    db_session.commit()

    # 1. Explicit variants-only succeeds
    res_explicit = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json={
            "variants": [
                {"size": "S", "color_name": "White", "stock_quantity": 10},
                {"size": "M", "color_name": "White", "stock_quantity": 12},
            ]
        },
    )
    assert res_explicit.status_code == 201
    variants = res_explicit.json()
    assert len(variants) == 2
    assert all(v["color_name"] == "White" for v in variants)

    # 2. Mixed complete payload (full matrix + explicit variants) succeeds
    res_mixed = client.post(
        f"/api/v1/products/{product.id}/variants/bulk",
        json={
            "sizes": ["L"],
            "colors": [{"name": "Black", "hex": "#000000"}],
            "default_stock": 20,
            "variants": [
                {
                    "size": "XL",
                    "color_name": "Black",
                    "color_hex": "#000000",
                    "stock_quantity": 8,
                }
            ],
        },
    )
    assert res_mixed.status_code == 201
    all_vars = res_mixed.json()
    # 2 existing + 1 matrix (L/Black) + 1 explicit (XL/Black) = 4 variants
    assert len(all_vars) == 4
    sizes = {v["size"] for v in all_vars}
    assert {"S", "M", "L", "XL"} == sizes
