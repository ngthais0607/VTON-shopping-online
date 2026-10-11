# Path: backend/tests/test_users.py
import pytest
from app.core.security import create_access_token, create_refresh_token
from app.seed import seed_database
from app.features.users.model import User

def test_seed_database_and_login(client, db_session):
    """Test that seed_database executes correctly and creates admin and customer users."""
    seed_database(db_session)

    # Verify admin user created in DB
    admin = db_session.query(User).filter(User.email == "admin@example.com").first()
    assert admin is not None
    assert admin.username == "admin"
    assert admin.role == "admin"

    # Verify customer user created in DB
    customer = db_session.query(User).filter(User.email == "user@example.com").first()
    assert customer is not None
    assert customer.username == "demouser"
    assert customer.role == "customer"

    # Test Admin Login via API /users/login
    response = client.post("/users/login", json={
        "email": "admin@example.com",
        "password": "Admin@123456"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_seed_database_idempotency(db_session):
    """Test that running seed_database multiple times does not throw duplicate user errors."""
    seed_database(db_session)
    # Running a second time should safely report existing users
    seed_database(db_session)


from app.core.rate_limiter import limiter

def test_login_rate_limiting(client):
    """Test that rate limiting enforces HTTP 429 after 5 requests per minute."""
    limiter.reset()
    payload = {
        "email": "nonexistent@example.com",
        "password": "wrongpassword"
    }

    # First 5 login attempts return 401 Unauthorized
    for _ in range(5):
        res = client.post("/users/login", json=payload)
        assert res.status_code == 401

    # 6th attempt should be blocked with 429 Too Many Requests
    res_6th = client.post("/users/login", json=payload)
    assert res_6th.status_code == 429


def test_refresh_token_flow(client, db_session):
    """Test that login issues a refresh token, /users/refresh returns a new access token, and logout clears cookie."""
    limiter.reset()
    seed_database(db_session)

    # 1. Login
    login_res = client.post("/users/login", json={
        "email": "admin@example.com",
        "password": "Admin@123456"
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert "access_token" in login_data
    assert "refresh_token" in login_data

    refresh_tok = login_data["refresh_token"]

    # 2. Call /users/refresh with refresh token in body
    refresh_res = client.post("/users/refresh", json={"refresh_token": refresh_tok})
    assert refresh_res.status_code == 200
    refresh_data = refresh_res.json()
    assert "access_token" in refresh_data
    assert "refresh_token" in refresh_data

    # 3. Call /users/refresh with invalid token
    bad_res = client.post("/users/refresh", json={"refresh_token": "invalidtoken"})
    assert bad_res.status_code == 401

    # 4. Logout
    logout_res = client.post("/users/logout")
    assert logout_res.status_code == 200
    client.cookies.clear()
    no_cookie_res = client.post("/users/refresh")
    assert no_cookie_res.status_code == 401


def test_refresh_token_cannot_authenticate_protected_route(client, db_session):
    user = User(
        username="refresh_only",
        email="refresh-only@example.com",
        password_hash="unused",
        role="customer",
    )
    db_session.add(user)
    db_session.commit()

    refresh_token = create_refresh_token({"sub": user.email})
    response = client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {refresh_token}"},
    )

    assert response.status_code == 401


def test_deleted_user_access_token_is_rejected(client, db_session):
    user = User(
        username="deleted_user",
        email="deleted@example.com",
        password_hash="unused",
        role="customer",
        is_deleted=True,
    )
    db_session.add(user)
    db_session.commit()

    access_token = create_access_token({"sub": user.email})
    response = client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 401


def test_registration_queue_failure_keeps_committed_user(
    client, db_session, monkeypatch
):
    async def fail_to_enqueue(*_args, **_kwargs):
        raise RuntimeError("queue unavailable")

    monkeypatch.setattr("app.features.users.router.enqueue_task", fail_to_enqueue)

    response = client.post(
        "/users/register",
        json={
            "username": "queue_survivor",
            "email": "queue-survivor@example.com",
            "password": "StrongPassword123!",
        },
    )

    assert response.status_code == 201
    assert (
        db_session.query(User)
        .filter(User.email == "queue-survivor@example.com")
        .one()
        .username
        == "queue_survivor"
    )


@pytest.mark.parametrize(
    ("field", "collision_value"),
    [
        ("username", "existing_user"),
        ("email", "existing@example.com"),
    ],
)
def test_admin_update_collision_returns_400_without_mutating_users(
    client, db_session, mock_admin_auth, field, collision_value
):
    target = User(
        username="target_user",
        email="target@example.com",
        password_hash="unused",
        role="customer",
    )
    existing = User(
        username="existing_user",
        email="existing@example.com",
        password_hash="unused",
        role="customer",
    )
    db_session.add_all([target, existing])
    db_session.commit()

    payload = {
        "username": "target_user",
        "email": "target@example.com",
        "first_name": "Changed",
        "last_name": "Name",
    }
    payload[field] = collision_value

    response = client.put(f"/users/{target.id}", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"] == "Username or email already exists"
    db_session.refresh(target)
    db_session.refresh(existing)
    assert target.username == "target_user"
    assert target.email == "target@example.com"
    assert target.first_name is None
    assert existing.username == "existing_user"
    assert existing.email == "existing@example.com"

