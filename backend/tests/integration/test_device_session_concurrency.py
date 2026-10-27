import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.errors import AuthenticationError
from app.core.security import hash_password
from app.features.users import service
from app.features.users.model import User
from app.features.users.schemas import LoginCommand, PasswordChange

pytestmark = pytest.mark.integration


@pytest.fixture
def device_database():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for device concurrency")
    engine = create_engine(url, pool_pre_ping=True)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        user = User(
            username="device-" + uuid4().hex,
            email=uuid4().hex + "@example.com",
            password_hash=hash_password("ConcurrencyPassword!23"),
            role="customer",
        )
        db.add(user)
        db.commit()
        identifier, user_id = user.email, user.id
        command = LoginCommand(identifier=identifier, password="ConcurrencyPassword!23")
        pairs = [service.login_user(db, command), service.login_user(db, command)]
    yield factory, identifier, user_id, pairs
    engine.dispose()


@pytest.mark.parametrize("same_device", [True, False])
def test_mariadb_refresh_version_is_atomic_per_device(device_database, same_device):
    factory, _, _, pairs = device_database
    barrier = Barrier(2)

    def refresh(index):
        with factory() as db:
            barrier.wait(timeout=15)
            try:
                service.refresh_user_session(
                    db, pairs[0 if same_device else index].refresh_token
                )
                return "ok"
            except AuthenticationError:
                return "replay"

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = sorted(pool.map(refresh, [0, 1]))
    assert outcomes == (["ok", "replay"] if same_device else ["ok", "ok"])


def test_password_change_cannot_leave_old_credential_login_active(device_database):
    factory, identifier, user_id, pairs = device_database
    barrier = Barrier(2)

    def change():
        with factory() as db:
            user = db.get(User, user_id)
            barrier.wait(timeout=15)
            service.change_password(
                db,
                user,
                PasswordChange(
                    current_password="ConcurrencyPassword!23",
                    new_password="ChangedPassword!24",
                ),
            )

    def login():
        with factory() as db:
            barrier.wait(timeout=15)
            try:
                return service.login_user(
                    db,
                    LoginCommand(
                        identifier=identifier, password="ConcurrencyPassword!23"
                    ),
                )
            except AuthenticationError:
                return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        changed, logged_in = pool.submit(change), pool.submit(login)
        changed.result(timeout=30)
        raced = logged_in.result(timeout=30)
    with factory() as db:
        for pair in [*pairs, *([raced] if raced else [])]:
            with pytest.raises(AuthenticationError):
                service.refresh_user_session(db, pair.refresh_token)
