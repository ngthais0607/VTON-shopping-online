import redis.exceptions
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.rate_limiter import limiter


def test_rate_limiter_configured_with_resilience():
    assert getattr(limiter, "_swallow_errors", False) is True
    assert getattr(limiter, "_in_memory_fallback_enabled", False) is True


def test_rate_limiter_resilience_on_redis_outage(monkeypatch):
    # Simulate storage error when Redis is unreachable mid-operation
    def mock_fail_hit(*args, **kwargs):
        raise redis.exceptions.ConnectionError("Redis connection refused")

    monkeypatch.setattr(limiter._limiter, "hit", mock_fail_hit)

    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.get("/test-resilience")
    @limiter.limit("5/minute")
    def limited_endpoint(request: Request):
        return {"status": "ok"}

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/test-resilience")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
