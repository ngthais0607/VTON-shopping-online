import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text


def test_device_session_migration_preserves_existing_users(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    database = "sqlite:///" + (tmp_path / "sessions.db").as_posix()
    environment = {**os.environ, "DATABASE_URL": database}

    def migrate(direction, revision):
        subprocess.run(
            [sys.executable, "-m", "alembic", direction, revision],
            cwd=backend,
            env=environment,
            capture_output=True,
            check=True,
        )

    migrate("upgrade", "e6f7a8b9c0d1")
    engine = create_engine(database)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (username,email,password_hash,role) VALUES ('before','before@example.test','hash','customer')"
            )
        )
    engine.dispose()
    migrate("upgrade", "head")
    engine = create_engine(database)
    assert "user_sessions" in inspect(engine).get_table_names()
    with engine.connect() as connection:
        assert (
            connection.execute(
                text("SELECT count(*) FROM users WHERE username='before'")
            ).scalar()
            == 1
        )
        assert (
            connection.execute(text("SELECT count(*) FROM user_sessions")).scalar() == 0
        )
    assert "refresh_version" in {
        c["name"] for c in inspect(engine).get_columns("users")
    }
    engine.dispose()
    migrate("downgrade", "e6f7a8b9c0d1")
    engine = create_engine(database)
    assert "user_sessions" not in inspect(engine).get_table_names()
    assert "users" in inspect(engine).get_table_names()
    engine.dispose()
    migrate("upgrade", "head")
