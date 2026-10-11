import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings


def test_settings_rejects_missing_secret_key():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key="")


def test_settings_are_cached_and_immutable():
    settings = get_settings()

    assert get_settings() is settings
    with pytest.raises(ValidationError):
        settings.secret_key = "replacement-secret"


def test_cached_cors_origins_rejects_in_place_mutation():
    settings = get_settings()

    with pytest.raises(AttributeError):
        settings.cors_origins.append("https://mutated.example.com")


def test_settings_derives_minio_external_url_from_endpoint():
    settings = Settings(
        _env_file=None,
        secret_key="test-secret",
        minio_endpoint="storage.internal:9000",
    )

    assert settings.minio_external_url == "http://storage.internal:9000"
