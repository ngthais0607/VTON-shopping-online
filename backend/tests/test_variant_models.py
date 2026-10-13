
from app.features.categories.model import Category
from app.features.orders.model import OrderItem
from app.features.products.model import Product, ProductImage, ProductReview
from app.features.products.variant_model import ProductVariant


def test_variant_model_attributes_and_relationships():
    # Verify ProductVariant fields exist
    assert hasattr(ProductVariant, "sku")
    assert hasattr(ProductVariant, "size")
    assert hasattr(ProductVariant, "color_name")
    assert hasattr(ProductVariant, "color_hex")
    assert hasattr(ProductVariant, "price")
    assert hasattr(ProductVariant, "stock_quantity")
    assert hasattr(ProductVariant, "reserved_quantity")
    assert hasattr(ProductVariant, "sold_quantity")
    assert hasattr(ProductVariant, "is_active")

    # Verify Product fashion extensions exist
    assert hasattr(Product, "slug")
    assert hasattr(Product, "brand")
    assert hasattr(Product, "gender")
    assert hasattr(Product, "material")
    assert hasattr(Product, "fit")
    assert hasattr(Product, "care_instructions")
    assert hasattr(Product, "size_chart")
    assert hasattr(Product, "variants")

    # Verify Category hierarchy extensions exist
    assert hasattr(Category, "parent_id")
    assert hasattr(Category, "slug")
    assert hasattr(Category, "parent")
    assert hasattr(Category, "children")

    # Verify ProductImage extensions exist
    assert hasattr(ProductImage, "sort_order")
    assert hasattr(ProductImage, "is_primary")
    assert hasattr(ProductImage, "color_name")
    assert hasattr(ProductImage, "kind")

    # Verify OrderItem variant extensions exist
    assert hasattr(OrderItem, "variant_id")
    assert hasattr(OrderItem, "sku")
    assert hasattr(OrderItem, "size")
    assert hasattr(OrderItem, "color_name")
    assert hasattr(OrderItem, "variant")

    # Verify ProductReview extensions exist
    assert hasattr(ProductReview, "fit_feedback")


def test_product_variant_table_constraints():
    table = ProductVariant.__table__
    constraint_names = {c.name for c in table.constraints}
    assert "uq_variants_product_size_color" in constraint_names
    assert "ck_variants_stock_non_negative" in constraint_names
    assert "ck_variants_reserved_non_negative" in constraint_names
    assert "ck_variants_sold_non_negative" in constraint_names
    assert "ck_variants_reserved_sold_lte_stock" in constraint_names
