from datetime import timedelta

from fastapi import Depends
from fastapi.testclient import TestClient

from app.core.security import (
    create_access_token,
    get_current_user_optional,
)
from app.features.users.model import User
from app.main import app


def test_optional_auth_without_credentials(client: TestClient):
    @app.get("/test/optional-auth-endpoint")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    res = client.get("/test/optional-auth-endpoint")
    assert res.status_code == 200
    assert res.json() == {"user_id": None}


def test_optional_auth_with_valid_bearer_token(client: TestClient, db_session):
    user = User(
        username="optional_auth_user",
        email="optional_auth@example.com",
        password_hash="unused",
        role="customer",
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token({"sub": str(user.id)})

    @app.get("/test/optional-auth-endpoint-2")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    res = client.get(
        "/test/optional-auth-endpoint-2",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json() == {"user_id": user.id}


def test_optional_auth_with_malformed_token(client: TestClient):
    @app.get("/test/optional-auth-endpoint-3")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    res = client.get(
        "/test/optional-auth-endpoint-3",
        headers={"Authorization": "Bearer malformed.jwt.token"},
    )
    assert res.status_code == 200
    assert res.json() == {"user_id": None}


def test_optional_auth_with_expired_token(client: TestClient, db_session):
    user = User(
        username="expired_auth_user",
        email="expired_auth@example.com",
        password_hash="unused",
        role="customer",
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token({"sub": str(user.id)}, expires_delta=timedelta(seconds=-60))

    @app.get("/test/optional-auth-endpoint-4")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    res = client.get(
        "/test/optional-auth-endpoint-4",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json() == {"user_id": None}


def test_optional_auth_with_soft_deleted_user(client: TestClient, db_session):
    user = User(
        username="deleted_auth_user",
        email="deleted_auth@example.com",
        password_hash="unused",
        role="customer",
        is_deleted=True,
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token({"sub": str(user.id)})

    @app.get("/test/optional-auth-endpoint-5")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    res = client.get(
        "/test/optional-auth-endpoint-5",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json() == {"user_id": None}


def test_optional_auth_dependency_override(client: TestClient):
    fake_user = User(id=999, username="fake_override", email="fake@example.com", role="customer")
    app.dependency_overrides[get_current_user_optional] = lambda: fake_user

    try:
        @app.get("/test/optional-auth-endpoint-6")
        def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
            return {"user_id": user.id if user else None}

        res = client.get("/test/optional-auth-endpoint-6")
        assert res.status_code == 200
        assert res.json() == {"user_id": 999}
    finally:
        app.dependency_overrides.pop(get_current_user_optional, None)
