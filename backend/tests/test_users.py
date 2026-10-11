from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.core.errors import AuthenticationError
from app.core.rate_limiter import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
)
from app.features.users import service
from app.features.users.model import User
from app.features.users.schemas import LoginCommand, UserPatch
from app.integrations.queue import get_task_queue
from app.seed import seed_database


class RecordingQueue:
    def __init__(self, error: Exception | None = None) -> None:
        self.calls: list[tuple[str, tuple[object, ...]]] = []
        self.error = error

    async def enqueue(self, task_name: str, *args: object) -> None:
        self.calls.append((task_name, args))
        if self.error is not None:
            raise self.error


def _make_user(db_session, suffix: str, *, role: str = "customer", **values) -> User:
    user = User(
        username=values.pop("username", f"user_{suffix}"),
        email=values.pop("email", f"user-{suffix}@example.com"),
        password_hash=values.pop("password_hash", "unused"),
        role=role,
        **values,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_seed_database_and_versioned_login(client, db_session):
    seed_database(db_session)

    admin = db_session.query(User).filter(User.email == "admin@example.com").one()
    customer = db_session.query(User).filter(User.email == "user@example.com").one()
    assert (admin.username, admin.role) == ("admin", "admin")
    assert (customer.username, customer.role) == ("demouser", "customer")

    limiter.reset()
    response = client.post(
        "/api/v1/users/login",
        json={"identifier": "admin@example.com", "password": "Admin@123456"},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]
    assert response.cookies["refresh_token"] == response.json()["refresh_token"]


def test_seed_database_is_idempotent(db_session):
    seed_database(db_session)
    seed_database(db_session)


def test_login_rate_limiting_uses_versioned_route(client):
    limiter.reset()
    payload = {"identifier": "nobody@example.com", "password": "wrongpassword"}

    for _ in range(5):
        response = client.post("/api/v1/users/login", json=payload)
        assert response.status_code == 401
        assert response.json()["code"] == "invalid_credentials"

    assert client.post("/api/v1/users/login", json=payload).status_code == 429


def test_refresh_rotates_cookie_and_logout_deletes_it(client, db_session):
    seed_database(db_session)
    limiter.reset()
    login = client.post(
        "/api/v1/users/login",
        json={"identifier": "admin", "password": "Admin@123456"},
    )
    old_refresh = login.json()["refresh_token"]

    refreshed = client.post(
        "/api/v1/users/refresh",
        json={"refresh_token": old_refresh},
    )

    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]
    assert refreshed.json()["refresh_token"] != old_refresh
    assert refreshed.cookies["refresh_token"] == refreshed.json()["refresh_token"]

    replay = client.post(
        "/api/v1/users/refresh",
        json={"refresh_token": old_refresh},
    )
    assert replay.status_code == 401
    assert replay.json()["code"] == "invalid_token"

    logged_out = client.post("/api/v1/users/logout")
    assert logged_out.status_code == 204
    assert "refresh_token=" in logged_out.headers["set-cookie"]
    client.cookies.clear()
    missing = client.post("/api/v1/users/refresh")
    assert missing.status_code == 401
    assert missing.json()["code"] == "invalid_token"


def test_two_logins_in_same_second_issue_distinct_refresh_tokens(db_session):
    user = _make_user(
        db_session,
        "login_nonce",
        password_hash=hash_password("StrongPassword123!"),
    )
    command = LoginCommand(identifier=user.email, password="StrongPassword123!")

    first = service.login_user(db_session, command).refresh_token
    second = service.login_user(db_session, command).refresh_token

    assert first != second


@pytest.mark.parametrize(
    "token",
    [
        None,
        "not-a-jwt",
        create_access_token(
            {"sub": "expired@example.com"},
            expires_delta=timedelta(seconds=-1),
        ),
        create_refresh_token({"sub": "refresh-only@example.com"}),
    ],
    ids=["missing", "malformed", "expired", "refresh-as-access"],
)
def test_access_token_failures_use_common_error(client, token):
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    response = client.get("/api/v1/users/me", headers=headers)

    assert response.status_code == 401
    assert response.json() == {
        "code": "invalid_token",
        "message": "Could not validate credentials",
        "details": None,
    }


def test_deleted_user_access_token_is_rejected(client, db_session):
    user = _make_user(db_session, "deleted", is_deleted=True)
    token = create_access_token({"sub": user.email})

    response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


@pytest.mark.parametrize("identifier_field", ["username", "email"])
def test_registration_duplicate_returns_409_common_error(
    client, db_session, identifier_field
):
    existing = _make_user(db_session, "existing")
    payload = {
        "username": "new_username",
        "email": "new@example.com",
        "password": "StrongPassword123!",
    }
    payload[identifier_field] = getattr(existing, identifier_field)

    response = client.post("/api/v1/users/register", json=payload)

    assert response.status_code == 409
    assert response.json()["code"] == "duplicate_user"
    assert db_session.query(User).filter(User.email == "new@example.com").count() == 0


def test_registration_commits_before_best_effort_queue_failure(
    client, db_session, caplog
):
    queue = RecordingQueue(RuntimeError("queue unavailable"))
    client.app.dependency_overrides[get_task_queue] = lambda: queue

    response = client.post(
        "/api/v1/users/register",
        json={
            "username": "queue_survivor",
            "email": "queue-survivor@example.com",
            "password": "StrongPassword123!",
        },
    )

    assert response.status_code == 201
    saved = (
        db_session.query(User).filter(User.email == "queue-survivor@example.com").one()
    )
    assert queue.calls == [("send_welcome_email_task", (saved.id,))]
    assert "Failed to enqueue welcome email" in caplog.text


def test_public_registrations_are_customers_even_when_database_starts_empty(
    client, db_session
):
    limiter.reset()
    queue = RecordingQueue()
    client.app.dependency_overrides[get_task_queue] = lambda: queue

    responses = [
        client.post(
            "/api/v1/users/register",
            json={
                "username": f"public_{index}",
                "email": f"public-{index}@example.com",
                "password": "StrongPassword123!",
            },
        )
        for index in range(2)
    ]

    assert [response.status_code for response in responses] == [201, 201]
    assert [response.json()["role"] for response in responses] == [
        "customer",
        "customer",
    ]
    assert db_session.query(User).filter(User.role == "admin").count() == 0


def test_concurrent_refresh_consumes_version_once(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'refresh-race.db'}",
        connect_args={"check_same_thread": False, "timeout": 10},
    )
    User.__table__.create(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    setup = session_factory()
    user = User(
        username="refresh_race",
        email="refresh-race@example.com",
        password_hash=hash_password("StrongPassword123!"),
        role="customer",
    )
    setup.add(user)
    setup.commit()
    original_refresh = service.login_user(
        setup,
        LoginCommand(
            identifier=user.email,
            password="StrongPassword123!",
        ),
    ).refresh_token
    setup.close()
    barrier = Barrier(2)

    def consume_refresh() -> str:
        session = session_factory()
        try:
            barrier.wait()
            service.refresh_user_session(session, original_refresh)
            return "success"
        except AuthenticationError as exc:
            assert exc.code == "invalid_token"
            return "invalid_token"
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _index: consume_refresh(), range(2)))

    assert sorted(results) == ["invalid_token", "success"]
    stale_session = session_factory()
    with pytest.raises(AuthenticationError, match="Could not validate credentials"):
        service.refresh_user_session(stale_session, original_refresh)
    stale_session.close()
    engine.dispose()


def test_profile_update_does_not_restore_consumed_refresh_version(
    db_session, monkeypatch
):
    original_version = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
    user = User(
        username="refresh_profile",
        email="refresh-profile@example.com",
        password_hash=hash_password("StrongPassword123!"),
        role="customer",
        updated_at=original_version,
    )
    db_session.add(user)
    db_session.commit()
    original_refresh = service.login_user(
        db_session,
        LoginCommand(identifier=user.email, password="StrongPassword123!"),
    ).refresh_token
    service.refresh_user_session(db_session, original_refresh)
    db_session.refresh(user)

    # Simulate a database column with whole-second timestamp precision.
    monkeypatch.setattr(
        User.__table__.c.updated_at.onupdate,
        "arg",
        lambda _context: original_version,
    )
    service.update_profile(db_session, user, UserPatch(first_name="Changed"))
    assert user.refresh_version == 1

    with pytest.raises(AuthenticationError) as error:
        service.refresh_user_session(db_session, original_refresh)
    assert error.value.code == "invalid_token"


def test_profile_patch_is_partial_and_returns_typed_response(
    client, db_session, mock_user_auth
):
    response = client.patch(
        "/api/v1/users/me",
        json={"first_name": "Updated"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": mock_user_auth.id,
        "username": mock_user_auth.username,
        "email": mock_user_auth.email,
        "first_name": "Updated",
        "last_name": mock_user_auth.last_name,
        "role": "customer",
        "created_at": response.json()["created_at"],
        "updated_at": response.json()["updated_at"],
    }


def test_password_change_returns_204(client, db_session, mock_user_auth):
    from app.core.security import hash_password

    mock_user_auth.password_hash = hash_password("OldPassword123!")
    db_session.commit()

    response = client.patch(
        "/api/v1/users/me/password",
        json={
            "current_password": "OldPassword123!",
            "new_password": "NewPassword123!",
        },
    )

    assert response.status_code == 204


def test_admin_crud_uses_page_patch_204_and_common_not_found(
    client, db_session, mock_admin_auth
):
    created = client.post(
        "/api/v1/users",
        json={
            "username": "managed_user",
            "email": "managed@example.com",
            "password": "StrongPassword123!",
            "first_name": "Managed",
        },
    )
    assert created.status_code == 201
    assert created.json()["role"] == "customer"
    user_id = created.json()["id"]

    listed = client.get("/api/v1/users?limit=10&offset=0")
    assert listed.status_code == 200
    assert listed.json().keys() == {"items", "total", "limit", "offset"}
    assert any(item["id"] == user_id for item in listed.json()["items"])

    patched = client.patch(f"/api/v1/users/{user_id}", json={"last_name": "User"})
    assert patched.status_code == 200
    assert patched.json()["last_name"] == "User"
    assert patched.json()["first_name"] == "Managed"

    assert client.delete(f"/api/v1/users/{user_id}").status_code == 204
    missing = client.get(f"/api/v1/users/{user_id}")
    assert missing.status_code == 404
    assert missing.json()["code"] == "user_not_found"


def test_admin_update_duplicate_does_not_mutate_target(
    client, db_session, mock_admin_auth
):
    target = _make_user(
        db_session,
        "target",
        first_name="Original",
    )
    existing = _make_user(db_session, "existing_collision")

    response = client.patch(
        f"/api/v1/users/{target.id}",
        json={"username": existing.username, "first_name": "Changed"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "duplicate_user"
    db_session.refresh(target)
    assert target.username == "user_target"
    assert target.first_name == "Original"


def test_integrity_error_is_rolled_back_and_translated(monkeypatch):
    target = User(
        id=10,
        username="original",
        email="original@example.com",
        password_hash="unused",
        role="customer",
        first_name="Original",
    )

    class RaceSession:
        def __init__(self) -> None:
            self.rolled_back = False

        def commit(self) -> None:
            raise IntegrityError("UPDATE users", {}, Exception("duplicate"))

        def rollback(self) -> None:
            self.rolled_back = True
            target.username = "original"
            target.first_name = "Original"

        def refresh(self, _user: User) -> None:
            raise AssertionError("failed writes must not refresh")

    session = RaceSession()
    monkeypatch.setattr(service, "_get_active_user", lambda _db, _id: target)
    monkeypatch.setattr(service, "_find_duplicate_user", lambda *_args, **_kwargs: None)

    with pytest.raises(service.DuplicateUserError) as exc_info:
        service.update_user(
            session,
            target.id,
            UserPatch(username="racing-name", first_name="Changed"),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "duplicate_user"
    assert session.rolled_back is True
    assert (target.username, target.first_name) == ("original", "Original")
