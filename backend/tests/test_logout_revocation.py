import pytest

from app.core.rate_limiter import limiter
from app.core.security import decode_refresh_token, hash_password
from app.features.users import service
from app.features.users.model import User
from app.features.users.schemas import LoginCommand
from app.features.users.session_model import UserSession


def make_refresh_user(db_session):
    user = User(
        username="logout-customer",
        email="logout@example.com",
        password_hash=hash_password("LogoutPassword!23"),
        role="customer",
        refresh_version=0,
    )
    db_session.add(user)
    db_session.commit()
    token = service.login_user(
        db_session, LoginCommand(identifier=user.email, password="LogoutPassword!23")
    ).refresh_token
    return user, token


def test_logout_revokes_cookie_refresh_token(client, db_session):
    limiter.reset()
    user, token = make_refresh_user(db_session)
    client.cookies.set("refresh_token", token)
    response = client.post("/api/v1/users/logout")
    assert response.status_code == 204
    assert not response.content
    assert "refresh_token=" in response.headers["set-cookie"]
    session = db_session.get(UserSession, decode_refresh_token(token).session_id)
    db_session.refresh(session)
    assert session.revoked_at is not None
    replay = client.post("/api/v1/users/refresh", json={"refresh_token": token})
    assert replay.status_code == 401
    assert replay.json()["code"] == "invalid_token"


@pytest.mark.parametrize("cookie", [None, "bad-token", "stale"])
def test_logout_is_idempotent_without_a_current_token(client, db_session, cookie):
    user, token = make_refresh_user(db_session)
    session = db_session.get(UserSession, decode_refresh_token(token).session_id)
    session.refresh_version = 1
    db_session.commit()
    if cookie is not None:
        client.cookies.set("refresh_token", token if cookie == "stale" else cookie)
    response = client.post("/api/v1/users/logout")
    assert response.status_code == 204
    assert not response.content
    assert "refresh_token=" in response.headers["set-cookie"]
    db_session.refresh(session)
    assert session.refresh_version == 1
    assert session.revoked_at is None
