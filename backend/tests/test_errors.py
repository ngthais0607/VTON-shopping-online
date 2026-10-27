import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import ConflictError, register_error_handlers


@pytest.fixture
def error_client():
    error_app = FastAPI()
    register_error_handlers(error_app)

    @error_app.get("/test/error")
    def raise_application_error():
        raise ConflictError(
            code="duplicate_resource",
            message="Resource already exists",
        )

    @error_app.get("/test/unexpected")
    def raise_unexpected_error():
        raise RuntimeError("database password leaked")

    with TestClient(error_app, raise_server_exceptions=False) as client:
        yield client


def test_application_error_uses_common_shape(error_client):
    response = error_client.get("/test/error")
    assert response.status_code == 409
    assert response.json() == {
        "code": "duplicate_resource",
        "message": "Resource already exists",
        "details": None,
    }


def test_unexpected_error_does_not_expose_internal_message(error_client):
    response = error_client.get("/test/unexpected")
    assert response.status_code == 500
    assert response.json()["message"] == "Internal server error"
    assert "database password" not in response.text
