from unittest.mock import MagicMock

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import Settings
from app.core.rate_limiter import get_client_ip


def _make_mock_request(client_ip: str, xff: str | None = None, forwarded_allow_ips: str = "") -> Request:
    mock_app = MagicMock()
    mock_settings = MagicMock(spec=Settings)
    mock_settings.forwarded_allow_ips = forwarded_allow_ips
    mock_app.state.settings = mock_settings

    scope = {
        "type": "http",
        "client": (client_ip, 12345),
        "headers": [(b"x-forwarded-for", xff.encode())] if xff else [],
        "app": mock_app,
    }
    return Request(scope)


def test_untrusted_proxy_ignores_xff():
    req = _make_mock_request(
        client_ip="127.0.0.1",
        xff="203.0.113.50",
        forwarded_allow_ips="",
    )
    assert get_client_ip(req) == "127.0.0.1"


def test_trusted_proxy_resolves_client_ip_from_xff():
    req = _make_mock_request(
        client_ip="127.0.0.1",
        xff="203.0.113.50",
        forwarded_allow_ips="127.0.0.1",
    )
    assert get_client_ip(req) == "203.0.113.50"


def test_trusted_proxy_cidr_range():
    req = _make_mock_request(
        client_ip="10.0.1.5",
        xff="198.51.100.22, 10.0.1.5",
        forwarded_allow_ips="10.0.0.0/16, 127.0.0.1",
    )
    assert get_client_ip(req) == "198.51.100.22"


def test_untrusted_client_with_configured_proxies():
    req = _make_mock_request(
        client_ip="192.168.1.50",
        xff="203.0.113.50",
        forwarded_allow_ips="10.0.0.0/16, 127.0.0.1",
    )
    assert get_client_ip(req) == "192.168.1.50"


def test_trusted_wildcard_proxy():
    req = _make_mock_request(
        client_ip="192.168.1.50",
        xff="203.0.113.50",
        forwarded_allow_ips="*",
    )
    assert get_client_ip(req) == "203.0.113.50"


def test_rate_limiting_with_trusted_proxy():
    test_limiter = Limiter(key_func=get_client_ip, storage_uri="memory://")
    app = FastAPI()
    app.state.limiter = test_limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    mock_settings = MagicMock(spec=Settings)
    mock_settings.forwarded_allow_ips = "testclient"
    app.state.settings = mock_settings

    @app.get("/rate-limited")
    @test_limiter.limit("2/minute")
    def limited_route(request: Request):
        return {"status": "ok"}

    client = TestClient(app, raise_server_exceptions=False)

    # 2 requests for client A
    r1 = client.get("/rate-limited", headers={"X-Forwarded-For": "1.1.1.1"})
    assert r1.status_code == 200
    r2 = client.get("/rate-limited", headers={"X-Forwarded-For": "1.1.1.1"})
    assert r2.status_code == 200
    r3 = client.get("/rate-limited", headers={"X-Forwarded-For": "1.1.1.1"})
    assert r3.status_code == 429

    # Client B should still have quota because client A was throttled separately
    r4 = client.get("/rate-limited", headers={"X-Forwarded-For": "2.2.2.2"})
    assert r4.status_code == 200
