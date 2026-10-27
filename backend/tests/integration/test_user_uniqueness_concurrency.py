import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.features.users.model import User
from app.features.users.schemas import UserPatch
from app.features.users.service import DuplicateUserError, update_user

pytestmark = pytest.mark.integration


def test_concurrent_user_uniqueness_preserves_losing_record():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required")

    engine = create_engine(database_url, pool_pre_ping=True)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    suffix = uuid4().hex
    setup = session_factory()
    users = [
        User(
            username=f"race-a-{suffix}",
            email=f"race-a-{suffix}@example.com",
            password_hash="unused",
            role="customer",
            first_name="Alpha",
        ),
        User(
            username=f"race-b-{suffix}",
            email=f"race-b-{suffix}@example.com",
            password_hash="unused",
            role="customer",
            first_name="Beta",
        ),
    ]
    setup.add_all(users)
    setup.commit()
    user_ids = [user.id for user in users]
    original_emails = {user.id: user.email for user in users}
    setup.close()

    barrier = Barrier(2)
    shared_username = f"race-winner-{suffix}"

    def race(user_id: int) -> str:
        session = session_factory()
        try:
            barrier.wait()
            update_user(
                session,
                user_id,
                UserPatch(username=shared_username, first_name="Winner"),
            )
            return "success"
        except DuplicateUserError:
            return "conflict"
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(race, user_ids))

    verify = session_factory()
    stored = {
        user.id: user for user in verify.query(User).filter(User.id.in_(user_ids))
    }
    assert sorted(results) == ["conflict", "success"]
    assert sum(user.username == shared_username for user in stored.values()) == 1
    assert {user.id: user.email for user in stored.values()} == original_emails
    losing_user = next(
        user for user in stored.values() if user.username != shared_username
    )
    assert losing_user.first_name in {"Alpha", "Beta"}
    verify.close()
    engine.dispose()
