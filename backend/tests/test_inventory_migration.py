"""Exercise this migration on SQLite; the full chain is covered on MariaDB."""

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_inventory_migration_preflight_and_reversible_constraint():
    path = (
        Path(__file__).parents[1]
        / "alembic/versions/e6f7a8b9c0d1_guard_variant_inventory.py"
    )
    spec = importlib.util.spec_from_file_location("inventory_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE product_variants (id INTEGER PRIMARY KEY, stock_quantity INTEGER NOT NULL, reserved_quantity INTEGER NOT NULL, sold_quantity INTEGER NOT NULL)"
        )
        connection.exec_driver_sql("INSERT INTO product_variants VALUES (1, 2, 2, 1)")
        migration.op = Operations(MigrationContext.configure(connection))
        with pytest.raises(RuntimeError, match="sample IDs:.*1"):
            migration.upgrade()
        assert connection.exec_driver_sql(
            "SELECT reserved_quantity, sold_quantity FROM product_variants"
        ).one() == (2, 1)
        connection.exec_driver_sql("UPDATE product_variants SET reserved_quantity=1")
        migration.upgrade()
        with pytest.raises(sa.exc.IntegrityError):
            connection.exec_driver_sql("UPDATE product_variants SET sold_quantity=2")
        migration.downgrade()
        connection.exec_driver_sql("UPDATE product_variants SET sold_quantity=2")
        connection.exec_driver_sql("UPDATE product_variants SET sold_quantity=1")
        migration.upgrade()
        with pytest.raises(sa.exc.IntegrityError):
            connection.exec_driver_sql(
                "UPDATE product_variants SET reserved_quantity=-1"
            )
    engine.dispose()
