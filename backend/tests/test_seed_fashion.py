import pytest
from sqlalchemy.orm import Session

from app.features.categories.model import Category
from app.features.products.model import Product, ProductImage
from app.features.products.variant_model import ProductVariant
from app.seed import seed_database


def test_seed_database_fashion_catalog_and_idempotence(db_session: Session):
    # Run seed once
    seed_database(db=db_session, force=True)

    # 1. Assert categories are 100% fashion
    categories = db_session.query(Category).filter(Category.is_deleted.is_(False)).all()
    assert len(categories) >= 6, "Expected at least 6 fashion categories/subcategories"

    forbidden_terms = ["electronics", "smartphone", "laptop", "keyboard", "appliances", "furniture"]
    for cat in categories:
        for term in forbidden_terms:
            assert term not in cat.name.lower(), f"Forbidden category found: {cat.name}"

    # Assert subcategories exist with parent_id
    subcategories = [c for c in categories if c.parent_id is not None]
    assert len(subcategories) >= 6, "Expected subcategories with parent_id set"

    # 2. Assert products are 100% fashion apparel/accessories
    products = db_session.query(Product).filter(Product.is_active.is_(True)).all()
    assert len(products) >= 16, "Expected at least 16 fashion products"

    for p in products:
        # Check no legacy electronics exist
        for term in forbidden_terms:
            assert term not in p.name.lower(), f"Forbidden product found: {p.name}"
            if p.description:
                assert term not in p.description.lower(), f"Forbidden term in description: {p.description}"

        # Check fashion attributes
        assert p.brand is not None and len(p.brand) > 0, f"Product {p.name} missing brand"
        assert p.gender in ["male", "female", "unisex", "kids"], f"Product {p.name} invalid gender: {p.gender}"
        assert p.material is not None and len(p.material) > 0, f"Product {p.name} missing material"
        assert p.fit is not None and len(p.fit) > 0, f"Product {p.name} missing fit"
        assert p.care_instructions is not None and len(p.care_instructions) > 0, f"Product {p.name} missing care_instructions"
        assert p.size_chart is not None, f"Product {p.name} missing size_chart"

        # Check variants
        variants = db_session.query(ProductVariant).filter(
            ProductVariant.product_id == p.id,
            ProductVariant.is_active.is_(True),
        ).all()
        assert len(variants) >= 1, f"Product {p.name} has no variants"

        for v in variants:
            assert v.sku is not None and len(v.sku) > 0
            assert v.size is not None and len(v.size) > 0
            assert v.color_name is not None and len(v.color_name) > 0
            assert v.stock_quantity >= 0
            assert v.reserved_quantity + v.sold_quantity <= v.stock_quantity

    initial_prod_count = len(products)
    initial_cat_count = len(categories)
    initial_variant_count = db_session.query(ProductVariant).count()

    # 3. Test Idempotence: Run seed a second time
    seed_database(db=db_session, force=True)

    second_prod_count = db_session.query(Product).count()
    second_cat_count = db_session.query(Category).filter(Category.is_deleted.is_(False)).count()
    second_variant_count = db_session.query(ProductVariant).count()

    assert second_prod_count == initial_prod_count, f"Products duplicated: {initial_prod_count} vs {second_prod_count}"
    assert second_cat_count == initial_cat_count, f"Categories duplicated: {initial_cat_count} vs {second_cat_count}"
    assert second_variant_count == initial_variant_count, f"Variants duplicated: {initial_variant_count} vs {second_variant_count}"
