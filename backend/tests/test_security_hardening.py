from datetime import datetime, timezone

from app.core.rate_limiter import limiter
from app.core.security import create_access_token, hash_password
from app.features.users.model import User
from app.features.users.session_model import UserSession


def _user(db_session) -> User:
    user = User(
        username="hardening-user",
        email="hardening@example.com",
        password_hash=hash_password("HardeningPass!23"),
        role="customer",
        refresh_version=0,
    )
    db_session.add(user)
    db_session.commit()
    return user


def _session(db_session, user, *, revoked: bool) -> UserSession:
    from datetime import timedelta

    session = UserSession(
        id="a" * 32,
        user_id=user.id,
        refresh_version=0,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        revoked_at=datetime.now(timezone.utc) if revoked else None,
    )
    db_session.add(session)
    db_session.commit()
    return session


def test_access_token_dies_with_its_revoked_session(client, db_session):
    limiter.reset()
    user = _user(db_session)
    _session(db_session, user, revoked=True)
    token = create_access_token({"sub": str(user.id), "sid": "a" * 32})
    response = client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


def test_access_token_works_while_session_is_active(client, db_session):
    limiter.reset()
    user = _user(db_session)
    _session(db_session, user, revoked=False)
    token = create_access_token({"sub": str(user.id), "sid": "a" * 32})
    response = client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200


def test_request_id_rejects_unsafe_values(client):
    response = client.get(
        "/api/v1/health", headers={"X-Request-ID": "bad id\twith spaces"}
    )
    echoed = response.headers["x-request-id"]
    assert echoed != "bad id\twith spaces"
    assert len(echoed) == 36


def test_request_id_accepts_plain_token(client):
    response = client.get("/api/v1/health", headers={"X-Request-ID": "trace-12345678"})
    assert response.headers["x-request-id"] == "trace-12345678"


def test_cors_preflight_uses_explicit_header_list(client):
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-evil-header",
        },
    )
    assert response.status_code == 400


def test_checkout_rejects_empty_and_oversized_carts(client, db_session):
    limiter.reset()
    user = _user(db_session)
    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}
    assert (
        client.post(
            "/api/v1/orders/checkout-cart", json={"items": []}, headers=headers
        ).status_code
        == 422
    )
    too_many = [{"variant_id": 1, "quantity": 1}] * 51
    assert (
        client.post(
            "/api/v1/orders/checkout-cart", json={"items": too_many}, headers=headers
        ).status_code
        == 422
    )
