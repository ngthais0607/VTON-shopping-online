from app.core.errors import ConflictError
from app.main import app


@app.get("/test/error")
def raise_application_error():
    raise ConflictError(
        code="duplicate_resource",
        message="Resource already exists",
    )


@app.get("/test/unexpected")
def raise_unexpected_error():
    raise RuntimeError("database password leaked")


def test_application_error_uses_common_shape(client):
    response = client.get("/test/error")
    assert response.status_code == 409
    assert response.json() == {
        "code": "duplicate_resource",
        "message": "Resource already exists",
        "details": None,
    }


def test_unexpected_error_does_not_expose_internal_message(client):
    response = client.get("/test/unexpected")
    assert response.status_code == 500
    assert response.json()["message"] == "Internal server error"
    assert "database password" not in response.text
