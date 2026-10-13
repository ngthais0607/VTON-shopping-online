import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_requires_minio_credentials():
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            secret_key="test-secret-at-least-32-chars-long!",
            vietqr_bank_id="MB",
            vietqr_account_no="123456789",
            minio_access_key="",
            minio_secret_key="",
        )
    errors = str(exc_info.value)
    assert "minio_access_key" in errors
    assert "minio_secret_key" in errors


def test_settings_raises_when_minio_credentials_missing(monkeypatch):
    monkeypatch.delenv("MINIO_ACCESS_KEY", raising=False)
    monkeypatch.delenv("MINIO_SECRET_KEY", raising=False)
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            secret_key="test-secret-at-least-32-chars-long!",
            vietqr_bank_id="MB",
            vietqr_account_no="123456789",
        )
    errors = str(exc_info.value)
    assert "minio_access_key" in errors or "minio_secret_key" in errors
