import pytest

from app.core.rate_limiter import limiter
from app.core.security import create_refresh_token
from app.features.users.model import User


def make_refresh_user(db_session):
    user = User(
        username="logout-customer",
        email="logout@example.com",
        password_hash="unused",
        role="customer",
        refresh_version=0,
    )
    db_session.add(user)
    db_session.commit()
    return user, create_refresh_token({"sub": str(user.id), "version": 0})


def test_logout_revokes_cookie_refresh_token(client, db_session):
    limiter.reset()
    user, token = make_refresh_user(db_session)
    client.cookies.set("refresh_token", token)
    response = client.post("/api/v1/users/logout")
    assert response.status_code == 204
    assert not response.content
    assert "refresh_token=" in response.headers["set-cookie"]
    db_session.refresh(user)
    assert user.refresh_version == 1
    replay = client.post("/api/v1/users/refresh", json={"refresh_token": token})
    assert replay.status_code == 401
    assert replay.json()["code"] == "invalid_token"


@pytest.mark.parametrize("cookie", [None, "bad-token", "stale"])
def test_logout_is_idempotent_without_a_current_token(client, db_session, cookie):
    user, token = make_refresh_user(db_session)
    user.refresh_version = 1
    db_session.commit()
    if cookie is not None:
        client.cookies.set("refresh_token", token if cookie == "stale" else cookie)
    response = client.post("/api/v1/users/logout")
    assert response.status_code == 204
    assert not response.content
    assert "refresh_token=" in response.headers["set-cookie"]
    db_session.refresh(user)
    assert user.refresh_version == 1
