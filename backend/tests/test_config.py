import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings


def test_settings_rejects_short_or_missing_secret_key():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key="", vietqr_bank_id="MB", vietqr_account_no="123")

    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key="short-secret-under-32-chars", vietqr_bank_id="MB", vietqr_account_no="123")


def test_settings_rejects_missing_vietqr_credentials(monkeypatch):
    monkeypatch.delenv("VIETQR_BANK_ID", raising=False)
    monkeypatch.delenv("VIETQR_ACCOUNT_NO", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key="a" * 32, vietqr_bank_id="")


def test_settings_are_cached_and_immutable():
    settings = get_settings()

    assert get_settings() is settings
    with pytest.raises(ValidationError):
        settings.secret_key = "replacement-secret-replacement-32"


def test_cached_cors_origins_rejects_in_place_mutation():
    settings = get_settings()

    with pytest.raises(AttributeError):
        settings.cors_origins.append("https://mutated.example.com")


def test_settings_derives_minio_external_url_from_endpoint():
    settings = Settings(
        _env_file=None,
        secret_key="a" * 32,
        vietqr_bank_id="MB",
        vietqr_account_no="0382912048",
        minio_endpoint="storage.internal:9000",
    )

    assert settings.minio_external_url == "http://storage.internal:9000"
