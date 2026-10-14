from unittest.mock import patch

from app.core.config import Settings
from app.integrations.storage import MinioProductStorage


def _make_storage_settings(**overrides) -> Settings:
    defaults = {
        "secret_key": "a" * 32,
        "minio_access_key": "test_access",
        "minio_secret_key": "test_secret",
        "vietqr_bank_id": "test_bank",
        "vietqr_account_no": "test_acc",
        "minio_endpoint": "s3.example.com:9000",
        "minio_bucket": "test-bucket",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def test_minio_storage_initializes_with_secure_flag():
    with patch("app.integrations.storage.Minio") as mock_minio:
        settings_tls = _make_storage_settings(minio_secure=True)
        storage_tls = MinioProductStorage(settings_tls)
        assert storage_tls is not None
        mock_minio.assert_called_with(
            endpoint="s3.example.com:9000",
            access_key="test_access",
            secret_key="test_secret",
            secure=True,
        )

    with patch("app.integrations.storage.Minio") as mock_minio:
        settings_insecure = _make_storage_settings(minio_secure=False)
        storage_insecure = MinioProductStorage(settings_insecure)
        assert storage_insecure is not None
        mock_minio.assert_called_with(
            endpoint="s3.example.com:9000",
            access_key="test_access",
            secret_key="test_secret",
            secure=False,
        )


def test_minio_storage_infers_url_scheme_when_external_url_absent():
    with patch("app.integrations.storage.Minio"):
        settings_tls = _make_storage_settings(minio_secure=True, minio_external_url="")
        storage_tls = MinioProductStorage(settings_tls)
        assert storage_tls.public_url("item.png") == "https://s3.example.com:9000/test-bucket/item.png"

        settings_insecure = _make_storage_settings(minio_secure=False, minio_external_url="")
        storage_insecure = MinioProductStorage(settings_insecure)
        assert storage_insecure.public_url("item.png") == "http://s3.example.com:9000/test-bucket/item.png"


def test_minio_storage_preserves_explicit_external_url():
    with patch("app.integrations.storage.Minio"):
        settings = _make_storage_settings(
            minio_secure=False,
            minio_external_url="https://cdn.truelook.vn/assets",
        )
        storage = MinioProductStorage(settings)
        assert storage.public_url("item.png") == "https://cdn.truelook.vn/assets/test-bucket/item.png"
