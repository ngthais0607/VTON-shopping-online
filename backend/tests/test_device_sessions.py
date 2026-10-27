from datetime import datetime, timedelta, timezone

import pytest

from app.core.errors import AuthenticationError
from app.core.security import create_refresh_token, decode_refresh_token, hash_password
from app.features.users import service
from app.features.users.model import User
from app.features.users.schemas import LoginCommand, PasswordChange


def login(db, user, password="DevicePassword!23"):
    return service.login_user(
        db, LoginCommand(identifier=user.email, password=password)
    )


@pytest.fixture
def device_user(db_session):
    user = User(
        username="devices",
        email="devices@example.test",
        password_hash=hash_password("DevicePassword!23"),
        role="customer",
    )
    db_session.add(user)
    db_session.commit()
    return user


def test_devices_refresh_independently_and_replay_is_rejected(db_session, device_user):
    a, b = login(db_session, device_user), login(db_session, device_user)
    assert (
        decode_refresh_token(a.refresh_token).session_id
        != decode_refresh_token(b.refresh_token).session_id
    )
    service.refresh_user_session(db_session, a.refresh_token)
    service.refresh_user_session(db_session, b.refresh_token)
    with pytest.raises(AuthenticationError):
        service.refresh_user_session(db_session, a.refresh_token)


def test_unknown_user_still_verifies_a_password(db_session, monkeypatch):
    from app.core.security import verify_password

    verified = []

    def verification(password, hashed):
        verified.append(password)
        return verify_password(password, hashed)

    monkeypatch.setattr(service, "verify_password", verification)
    with pytest.raises(AuthenticationError):
        service.login_user(
            db_session,
            LoginCommand(identifier="unknown@example.test", password="wrong"),
        )
    assert verified == ["wrong"]


def test_logout_only_revokes_current_device_version(db_session, device_user):
    a, b = login(db_session, device_user), login(db_session, device_user)
    newer = service.refresh_user_session(db_session, a.refresh_token)
    service.logout_user_session(db_session, a.refresh_token)
    newest = service.refresh_user_session(db_session, newer.refresh_token)
    service.logout_user_session(db_session, newest.refresh_token)
    with pytest.raises(AuthenticationError):
        service.refresh_user_session(db_session, newest.refresh_token)
    service.refresh_user_session(db_session, b.refresh_token)


def test_password_change_revokes_all_device_sessions(db_session, device_user):
    a, b = login(db_session, device_user), login(db_session, device_user)
    service.change_password(
        db_session,
        device_user,
        PasswordChange(
            current_password="DevicePassword!23", new_password="ReplacementPassword!25"
        ),
    )
    for pair in (a, b):
        with pytest.raises(AuthenticationError):
            service.refresh_user_session(db_session, pair.refresh_token)
    login(db_session, device_user, "ReplacementPassword!25")


def test_refresh_expiry_is_absolute_and_legacy_tokens_fail(db_session, device_user):
    from app.features.users.session_model import UserSession

    pair = login(db_session, device_user)
    claims = decode_refresh_token(pair.refresh_token)
    session = db_session.get(UserSession, claims.session_id)
    expiry = session.expires_at
    newer = service.refresh_user_session(db_session, pair.refresh_token)
    assert newer.refresh_expires_at.replace(tzinfo=None) == expiry.replace(tzinfo=None)
    session.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    with pytest.raises(AuthenticationError):
        service.refresh_user_session(db_session, newer.refresh_token)
    with pytest.raises(AuthenticationError):
        service.refresh_user_session(
            db_session, create_refresh_token({"sub": str(device_user.id), "version": 0})
        )
