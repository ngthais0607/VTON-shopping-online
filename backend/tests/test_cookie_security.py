import pytest
from pydantic import ValidationError
from starlette.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def _make_auth_settings(**overrides) -> Settings:
    defaults = {
        "secret_key": "a" * 32,
        "minio_access_key": "test_access",
        "minio_secret_key": "test_secret",
        "vietqr_bank_id": "test_bank",
        "vietqr_account_no": "test_acc",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def test_refresh_cookie_samesite_validation():
    # Valid values
    assert _make_auth_settings(refresh_cookie_samesite="lax").refresh_cookie_samesite == "lax"
    assert _make_auth_settings(refresh_cookie_samesite="strict").refresh_cookie_samesite == "strict"
    assert _make_auth_settings(
        refresh_cookie_samesite="none", refresh_cookie_secure=True
    ).refresh_cookie_samesite == "none"

    # Case-insensitive
    assert _make_auth_settings(refresh_cookie_samesite="LAX").refresh_cookie_samesite == "lax"

    # Invalid value
    with pytest.raises(ValidationError):
        _make_auth_settings(refresh_cookie_samesite="invalid")

    # None without secure=True must fail
    with pytest.raises(ValidationError):
        _make_auth_settings(refresh_cookie_samesite="none", refresh_cookie_secure=False)


def test_logout_cookie_attributes_match_set_cookie(client: TestClient):
    # Call logout
    response = client.post("/api/v1/users/logout")
    assert response.status_code == 204

    # Check Set-Cookie deletion header
    set_cookie = response.headers.get("set-cookie", "")
    assert "refresh_token=" in set_cookie
    assert "path=/" in set_cookie.lower()
    assert "httponly" in set_cookie.lower()
    assert "samesite=lax" in set_cookie.lower()
