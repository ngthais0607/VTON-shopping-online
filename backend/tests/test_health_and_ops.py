from app.core.cache import get_cache
from app.features.dashboard.service import invalidate_dashboard_cache


def test_database_failure_is_503_without_exception_details(client):
    from app.core.database import get_db
    from app.main import app

    class BrokenDatabase:
        def execute(self, *args):
            raise RuntimeError("private-database-password")

    app.dependency_overrides[get_db] = lambda: BrokenDatabase()
    response = client.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json()["components"]["database"] == "unhealthy"
    assert "private-database-password" not in response.text


def test_redis_failure_is_200_degraded(client, monkeypatch):
    from importlib import import_module

    health_module = import_module("app.features.health.router")

    settings = health_module.get_settings().model_copy(
        update={"redis_url": "redis://localhost:1/0"}
    )
    monkeypatch.setattr(health_module, "get_settings", lambda: settings)
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["components"]["redis"] == "degraded"


def test_health_check_returns_healthy(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["components"]["database"] == "healthy"


def test_request_id_middleware_generates_and_propagates_header(client):
    # Auto-generated
    resp1 = client.get("/api/v1/health")
    assert resp1.status_code == 200
    req_id_1 = resp1.headers.get("x-request-id")
    assert req_id_1 is not None
    assert len(req_id_1) > 0

    # Custom propagated
    custom_id = "test-request-id-trace-999"
    resp2 = client.get("/api/v1/health", headers={"X-Request-ID": custom_id})
    assert resp2.status_code == 200
    assert resp2.headers.get("x-request-id") == custom_id


def test_dashboard_metrics_cache_and_invalidation(client, mock_admin_auth):
    cache = get_cache()
    invalidate_dashboard_cache()

    # First fetch: computes and caches
    resp1 = client.get("/api/v1/dashboard/metrics")
    assert resp1.status_code == 200
    metrics1 = resp1.json()

    # Verify cached in manager
    cached = cache.get_json("dashboard:metrics")
    assert cached is not None
    assert cached["total_products"] == metrics1["total_products"]

    # Invalidate
    invalidate_dashboard_cache()
    assert cache.get_json("dashboard:metrics") is None
