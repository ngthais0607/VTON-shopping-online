from datetime import timedelta

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_current_user_optional,
)
from app.features.users.model import User


def _make_test_app(db_session=None):
    test_app = FastAPI()
    if db_session is not None:
        test_app.dependency_overrides[get_db] = lambda: db_session
    return test_app


def test_optional_auth_without_credentials():
    test_app = _make_test_app()

    @test_app.get("/optional-auth")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    client = TestClient(test_app)
    res = client.get("/optional-auth")
    assert res.status_code == 200
    assert res.json() == {"user_id": None}


def test_optional_auth_with_valid_bearer_token(db_session):
    test_app = _make_test_app(db_session)
    user = User(
        username="optional_auth_user",
        email="optional_auth@example.com",
        password_hash="unused",
        role="customer",
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token({"sub": str(user.id)})

    @test_app.get("/optional-auth")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    client = TestClient(test_app)
    res = client.get(
        "/optional-auth",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json() == {"user_id": user.id}


def test_optional_auth_with_malformed_token():
    test_app = _make_test_app()

    @test_app.get("/optional-auth")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    client = TestClient(test_app)
    res = client.get(
        "/optional-auth",
        headers={"Authorization": "Bearer malformed.jwt.token"},
    )
    assert res.status_code == 200
    assert res.json() == {"user_id": None}


def test_optional_auth_with_expired_token(db_session):
    test_app = _make_test_app(db_session)
    user = User(
        username="expired_auth_user",
        email="expired_auth@example.com",
        password_hash="unused",
        role="customer",
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token(
        {"sub": str(user.id)}, expires_delta=timedelta(seconds=-60)
    )

    @test_app.get("/optional-auth")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    client = TestClient(test_app)
    res = client.get(
        "/optional-auth",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json() == {"user_id": None}


def test_optional_auth_with_soft_deleted_user(db_session):
    test_app = _make_test_app(db_session)
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

    @test_app.get("/optional-auth")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    client = TestClient(test_app)
    res = client.get(
        "/optional-auth",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json() == {"user_id": None}


def test_optional_auth_dependency_override():
    test_app = _make_test_app()
    fake_user = User(
        id=999, username="fake_override", email="fake@example.com", role="customer"
    )
    test_app.dependency_overrides[get_current_user_optional] = lambda: fake_user

    @test_app.get("/optional-auth")
    def _test_endpoint(user: User | None = Depends(get_current_user_optional)):
        return {"user_id": user.id if user else None}

    client = TestClient(test_app)
    res = client.get("/optional-auth")
    assert res.status_code == 200
    assert res.json() == {"user_id": 999}
