"""Percent-encoded credentials must survive Alembic's ConfigParser boundary."""

import runpy
from pathlib import Path

import pytest
from alembic.config import Config

from alembic import context


def test_environment_database_url_preserves_percent_encoded_password(monkeypatch):
    url = "mysql+pymysql://app:space%20%40%3A%2F%24@localhost/database"
    config = Config()
    config.set_main_option("sqlalchemy.url", "sqlite:///./app.db")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setattr(context, "config", config, raising=False)
    monkeypatch.setattr(context, "is_offline_mode", lambda: True)
    observed = []

    class Configured(Exception):
        pass

    def configure(**kwargs):
        observed.append(kwargs["url"])
        raise Configured

    monkeypatch.setattr(context, "configure", configure)
    with pytest.raises(Configured):
        runpy.run_path(str(Path(__file__).parents[1] / "alembic" / "env.py"))
    assert observed == [url]
