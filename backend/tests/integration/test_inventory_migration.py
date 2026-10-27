"""Full migration round-trip on a disposable MariaDB database."""

import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

pytestmark = pytest.mark.integration


def test_inventory_migration_empty_mariadb_round_trip():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL MariaDB is required")
    source = make_url(url)
    if source.get_backend_name() not in {"mysql", "mariadb"}:
        pytest.skip("MariaDB test database is required")
    name = f"migration_{uuid4().hex}"
    server = create_engine(source.set(database=None), isolation_level="AUTOCOMMIT")
    with server.connect() as connection:
        if "MariaDB" not in connection.scalar(text("SELECT VERSION()")):
            pytest.skip("MariaDB server is required")
        connection.execute(text(f"CREATE DATABASE `{name}`"))
    try:
        environment = {
            **os.environ,
            "DATABASE_URL": source.set(database=name).render_as_string(
                hide_password=False
            ),
        }
        for args in [("upgrade", "head"), ("downgrade", "-1"), ("upgrade", "head")]:
            subprocess.run(
                [sys.executable, "-m", "alembic", *args],
                cwd=Path(__file__).parents[2],
                env=environment,
                check=True,
                capture_output=True,
            )
    finally:
        with server.connect() as connection:
            connection.execute(text(f"DROP DATABASE `{name}`"))
        server.dispose()
