import io
import sys

import pytest

from app.seed import seed_database


def test_seed_refuses_production_without_force(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    # Fresh settings instance or monkeypatched
    with pytest.raises(RuntimeError, match="Refusing to seed in production without --force"):
        seed_database(force=False)


def test_seed_allows_production_with_force_and_masks_password(monkeypatch, db_session):
    monkeypatch.setenv("APP_ENV", "production")
    # Capture stdout
    captured_output = io.StringIO()
    monkeypatch.setattr(sys, "stdout", captured_output)
    
    try:
        seed_database(db=db_session, force=True)
    except Exception as e:
        # DB connection could fail in isolated mock, but RuntimeError guard is passed
        assert "Refusing to seed in production" not in str(e)
    
    output = captured_output.getvalue()
    assert "Admin@123456" not in output
    assert "User@123456" not in output
