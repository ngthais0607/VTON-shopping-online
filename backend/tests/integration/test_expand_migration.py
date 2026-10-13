import os

import pytest
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.features.categories.model import Category
from app.features.orders.model import OrderItem
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant

pytestmark = pytest.mark.integration


def test_expand_migration_data_backfill():
    db_url = os.environ.get("TEST_DATABASE_URL")
    if not db_url:
        pytest.skip("TEST_DATABASE_URL is required")

    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    ini_path = os.path.join(backend_dir, "alembic.ini")
    alembic_cfg = Config(ini_path)
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)

    engine = create_engine(db_url)
    session_factory = sessionmaker(bind=engine)

    # 1. Downgrade to baseline f7c2a1b9e8d3
    command.downgrade(alembic_cfg, "f7c2a1b9e8d3")

    session = session_factory()
    # Insert test data using raw SQL matching f7c2a1b9e8d3 schema
    conn = session.connection()
    conn.exec_driver_sql(
        "INSERT INTO users (id, username, email, password_hash, role, refresh_version, created_at, updated_at) "
        "VALUES (99991, 'expand_user', 'expand_user@example.com', 'pw', 'customer', 0, NOW(), NOW())"
    )
    conn.exec_driver_sql(
        "INSERT INTO categories (id, name, created_at, updated_at) VALUES (99991, 'Áo Sơ Mi Nam', NOW(), NOW())"
    )
    conn.exec_driver_sql(
        "INSERT INTO categories (id, name, created_at, updated_at) VALUES (99992, 'Áo Sơ Mi Nam', NOW(), NOW())"
    )
    conn.exec_driver_sql(
        "INSERT INTO products (id, name, price, stock_quantity, reserved_quantity, sold_quantity, currency, is_active, created_at, updated_at) "
        "VALUES (99991, 'Áo Thun Cotton Đen', 150.00, 20, 2, 5, 'VND', 1, NOW(), NOW())"
    )
    conn.exec_driver_sql(
        "INSERT INTO products (id, name, price, stock_quantity, reserved_quantity, sold_quantity, currency, is_active, created_at, updated_at) "
        "VALUES (99992, 'Áo Thun Cotton Đen', 180.00, 10, 0, 1, 'VND', 1, NOW(), NOW())"
    )
    conn.exec_driver_sql(
        "INSERT INTO orders (id, public_code, user_id, customer_name, customer_phone, shipping_address, payment_method, total_amount, currency, status, created_at, updated_at) "
        "VALUES (99991, 'ord-expand-uuid-1', 99991, 'Test', '123', 'Street', 'vietqr', 300.00, 'VND', 'pending', NOW(), NOW())"
    )
    conn.exec_driver_sql(
        "INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, subtotal) "
        "VALUES (99991, 99991, 99991, 'Áo Thun Cotton Đen', 150.00, 2, 300.00)"
    )
    session.commit()
    session.close()

    # 2. Upgrade to head (runs Migration A Expand)
    command.upgrade(alembic_cfg, "head")

    # 3. Verify backfill using SQLAlchemy models
    verify_session = session_factory()
    try:
        p1 = verify_session.query(Product).filter(Product.id == 99991).first()
        p2 = verify_session.query(Product).filter(Product.id == 99992).first()
        assert p1.slug == "ao-thun-cotton-den"
        assert p2.slug == "ao-thun-cotton-den-2"

        c1 = verify_session.query(Category).filter(Category.id == 99991).first()
        c2 = verify_session.query(Category).filter(Category.id == 99992).first()
        assert c1.slug == "ao-so-mi-nam"
        assert c2.slug == "ao-so-mi-nam-2"

        # Verify default variants created
        v1 = verify_session.query(ProductVariant).filter(ProductVariant.product_id == 99991).first()
        assert v1 is not None
        assert v1.sku == "P99991-DEFAULT"
        assert v1.size == "ONE_SIZE"
        assert v1.color_name == "Default"
        assert v1.stock_quantity == 20
        assert v1.reserved_quantity == 2
        assert v1.sold_quantity == 5

        # Verify OrderItem backfilled
        oi = verify_session.query(OrderItem).filter(OrderItem.id == 99991).first()
        assert oi.variant_id == v1.id
        assert oi.sku == v1.sku
        assert oi.size == "ONE_SIZE"
        assert oi.color_name == "Default"
    finally:
        # Cleanup test records
        cleanup_conn = verify_session.connection()
        cleanup_conn.exec_driver_sql("DELETE FROM order_items WHERE id = 99991")
        cleanup_conn.exec_driver_sql("DELETE FROM orders WHERE id = 99991")
        cleanup_conn.exec_driver_sql("DELETE FROM product_variants WHERE product_id IN (99991, 99992)")
        cleanup_conn.exec_driver_sql("DELETE FROM products WHERE id IN (99991, 99992)")
        cleanup_conn.exec_driver_sql("DELETE FROM categories WHERE id IN (99991, 99992)")
        cleanup_conn.exec_driver_sql("DELETE FROM users WHERE id = 99991")
        verify_session.commit()
        verify_session.close()
