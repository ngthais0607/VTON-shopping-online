import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, text


def test_order_items_and_reviews_migration(tmp_path):
    backend_dir = Path(__file__).resolve().parents[1]
    database_url = f"sqlite:///{(tmp_path / 'migration_test.db').as_posix()}"
    environment = {**os.environ, "DATABASE_URL": database_url}

    def migrate(revision: str) -> None:
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", revision],
            cwd=backend_dir,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
        )

    # 1. Migrate up to 8f4c2d1a7b90
    migrate("8f4c2d1a7b90")
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (id, username, email, password_hash, role) "
                "VALUES (1, 'legacy_user', 'legacy@example.com', 'hash', 'customer')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO products (id, name, price, stock_quantity, reserved_quantity, sold_quantity, currency, is_active, is_deleted) "
                "VALUES (1, 'Legacy Jacket', 99.50, 10, 0, 0, 'VND', 1, 0)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO orders (id, user_id, product_id, product_name, unit_price, quantity, total_amount, currency, status, customer_name, customer_phone, shipping_address, payment_method) "
                "VALUES (1, 1, 1, 'Legacy Jacket', 99.50, 2, 199.00, 'VND', 'paid', 'Legacy Customer', '0123456789', 'Legacy Address', 'vietqr')"
            )
        )
    engine.dispose()

    # 2. Upgrade to head
    migrate("head")

    # 3. Verify data backfill in order_items and product_reviews existence
    engine = create_engine(database_url)
    with engine.connect() as connection:
        order_item = connection.execute(
            text("SELECT order_id, product_id, product_name, unit_price, quantity, subtotal FROM order_items WHERE order_id = 1")
        ).mappings().one()

        assert order_item["order_id"] == 1
        assert order_item["product_id"] == 1
        assert order_item["product_name"] == "Legacy Jacket"
        assert float(order_item["unit_price"]) == 99.50
        assert order_item["quantity"] == 2
        assert float(order_item["subtotal"]) == 199.00

        # Check public_code was generated on the order
        public_code = connection.execute(
            text("SELECT public_code FROM orders WHERE id = 1")
        ).scalar_one()
        assert public_code is not None
        assert len(public_code) == 32

        # Verify product_reviews table exists and can receive rows
        connection.execute(
            text(
                "INSERT INTO product_reviews (product_id, user_id, rating, title, comment, is_verified_purchase) "
                "VALUES (1, 1, 5, 'Great!', 'Excellent product', 1)"
            )
        )
    engine.dispose()
