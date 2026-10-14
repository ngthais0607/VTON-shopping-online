from decimal import Decimal
import pytest
from sqlalchemy.orm import Session

from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant
from app.features.products.schemas import ProductPatch
from app.features.products.service import update_product


def test_update_product_does_not_inflate_variant_stock(db_session: Session):
    # Setup product with 2 variants, 10 stock each -> total = 20
    product = Product(
        name="Original Shirt",
        slug="original-shirt",
        price=Decimal("100.00"),
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    v1 = ProductVariant(
        product_id=product.id,
        sku="SHIRT-RED-S",
        color_name="Red",
        size="S",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    v2 = ProductVariant(
        product_id=product.id,
        sku="SHIRT-RED-M",
        color_name="Red",
        size="M",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add_all([v1, v2])
    db_session.commit()

    assert product.stock_quantity == 20

    # Simulate admin updating only the product name
    command = ProductPatch(name="Updated Shirt Name")
    updated = update_product(db_session, product.id, command)

    db_session.refresh(v1)
    db_session.refresh(v2)

    assert updated.name == "Updated Shirt Name"
    assert v1.stock_quantity == 10
    assert v2.stock_quantity == 10
    assert updated.stock_quantity == 20


def test_product_patch_rejects_stock_quantity():
    # stock_quantity must not be present in ProductPatch schema
    assert "stock_quantity" not in ProductPatch.model_fields
