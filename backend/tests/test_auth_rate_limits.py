import pytest

from app.core.rate_limiter import limiter
from app.features.users.router import router


@pytest.mark.parametrize(
    "path", ["/api/v1/users/login", "/api/v1/users/register", "/api/v1/users/refresh"]
)
def test_auth_routes_have_explicit_rate_limits(path):
    route = next(
        route
        for route in router.routes
        if route.path == path and "POST" in route.methods
    )
    key = f"{route.endpoint.__module__}.{route.endpoint.__name__}"
    assert limiter._route_limits.get(key), f"{path} has no explicit rate limit"


def test_refresh_rate_limit_is_thirty_per_minute(client):
    limiter.reset()
    try:
        for _ in range(30):
            assert client.post("/api/v1/users/refresh").status_code == 401
        assert client.post("/api/v1/users/refresh").status_code == 429
    finally:
        limiter.reset()


def test_login_identifier_budget_is_independent_behind_nat(client):
    limiter.reset()
    try:
        for _ in range(5):
            assert (
                client.post(
                    "/api/v1/users/login",
                    json={"identifier": "one@example.test", "password": "wrong"},
                ).status_code
                == 401
            )
        assert (
            client.post(
                "/api/v1/users/login",
                json={"identifier": " ONE@example.test ", "password": "wrong"},
            ).status_code
            == 429
        )
        assert (
            client.post(
                "/api/v1/users/login",
                json={"identifier": "two@example.test", "password": "wrong"},
            ).status_code
            == 401
        )
    finally:
        limiter.reset()


def test_login_still_limits_identifier_spraying_by_ip(client, monkeypatch):
    from app.core.errors import AuthenticationError
    from app.features.users import service

    def reject(*args, **kwargs):
        raise AuthenticationError("Invalid credentials", code="invalid_credentials")

    monkeypatch.setattr(service, "login_user", reject)
    limiter.reset()
    try:
        for index in range(60):
            response = client.post(
                "/api/v1/users/login",
                json={"identifier": f"spray{index}@example.test", "password": "wrong"},
            )
            assert response.status_code == 401
        assert (
            client.post(
                "/api/v1/users/login",
                json={"identifier": "next@example.test", "password": "wrong"},
            ).status_code
            == 429
        )
    finally:
        limiter.reset()
