import os

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command


@pytest.mark.integration
def test_alembic_roundtrip_two_cycles():
    db_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not db_url or "sqlite" in db_url:
        pytest.skip("MariaDB/MySQL environment required for migration roundtrip test")

    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    ini_path = os.path.join(backend_dir, "alembic.ini")
    alembic_cfg = Config(ini_path)
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)

    engine = create_engine(db_url)

    # Cycle 1: upgrade head -> downgrade base -> upgrade head
    command.upgrade(alembic_cfg, "head")
    command.downgrade(alembic_cfg, "base")
    inspector = inspect(engine)
    assert "order_items" not in inspector.get_table_names()
    assert "orders" not in inspector.get_table_names()

    command.upgrade(alembic_cfg, "head")
    inspector = inspect(engine)
    assert "order_items" in inspector.get_table_names()
    assert "orders" in inspector.get_table_names()
    assert "products" in inspector.get_table_names()

    # Cycle 2: verify idempotence
    command.downgrade(alembic_cfg, "base")
    inspector = inspect(engine)
    assert "order_items" not in inspector.get_table_names()

    command.upgrade(alembic_cfg, "head")
    inspector = inspect(engine)
    assert "order_items" in inspector.get_table_names()
    assert "product_reviews" in inspector.get_table_names()
