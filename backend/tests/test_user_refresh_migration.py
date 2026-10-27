import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, text


def test_refresh_version_migration_backfills_existing_users(tmp_path):
    backend_dir = Path(__file__).resolve().parents[1]
    database_url = f"sqlite:///{(tmp_path / 'migration.db').as_posix()}"
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

    migrate("c91f8a4e2b10")
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (username, email, password_hash, role) "
                "VALUES ('legacy', 'legacy@example.com', 'hash', 'customer')"
            )
        )
    engine.dispose()

    migrate("head")
    engine = create_engine(database_url)
    with engine.connect() as connection:
        version = connection.execute(
            text("SELECT refresh_version FROM users WHERE username = 'legacy'")
        ).scalar_one()
    engine.dispose()

    assert version == 0
