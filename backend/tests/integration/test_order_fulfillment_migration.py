import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


pytestmark = pytest.mark.integration


def test_fulfillment_migration_backfills_legacy_orders():
    test_database_url = os.getenv("TEST_DATABASE_URL")
    if not test_database_url:
        pytest.skip("TEST_DATABASE_URL is required")

    source_url = make_url(test_database_url)
    database_name = f"migration_{uuid4().hex}"
    server_url = source_url.set(database=None)
    migration_url = source_url.set(database=database_name)
    server_engine = create_engine(server_url, isolation_level="AUTOCOMMIT")
    backend_dir = Path(__file__).resolve().parents[2]
    environment = {**os.environ, "DATABASE_URL": migration_url.render_as_string(hide_password=False)}

    try:
        with server_engine.connect() as connection:
            connection.execute(text(f"CREATE DATABASE `{database_name}`"))

        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "6ea70e2e94f1"],
            cwd=backend_dir,
            env=environment,
            check=True,
        )

        migration_engine = create_engine(migration_url)
        with migration_engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO products "
                    "(name, price, stock_quantity, reserved_quantity, sold_quantity, currency, is_active, is_deleted) "
                    "VALUES ('Legacy', 10, 1, 1, 0, 'USD', 1, 0)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO orders "
                    "(product_id, product_name, unit_price, quantity, total_amount, currency, status) "
                    "VALUES (1, 'Legacy', 10, 1, 10, 'USD', 'pending')"
                )
            )
        migration_engine.dispose()

        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=backend_dir,
            env=environment,
            check=True,
        )

        migration_engine = create_engine(migration_url)
        with migration_engine.connect() as connection:
            legacy_order = connection.execute(
                text(
                    "SELECT customer_name, customer_phone, shipping_address, payment_method "
                    "FROM orders WHERE id = 1"
                )
            ).mappings().one()

        assert legacy_order == {
            "customer_name": "Legacy customer",
            "customer_phone": "Unknown",
            "shipping_address": "Unknown",
            "payment_method": "vietqr",
        }
    finally:
        with server_engine.connect() as connection:
            connection.execute(text(f"DROP DATABASE IF EXISTS `{database_name}`"))
        server_engine.dispose()
