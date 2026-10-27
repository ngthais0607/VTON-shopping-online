import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.errors import ConflictError
from app.features.users.model import User
from app.features.users.service import delete_user

pytestmark = pytest.mark.integration


def test_concurrent_admin_deletion_leaves_at_least_one_admin():
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required")

    engine = create_engine(database_url, pool_pre_ping=True)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    suffix = uuid4().hex
    setup = session_factory()

    admin_a = User(
        username=f"admin-a-{suffix}",
        email=f"admin-a-{suffix}@example.com",
        password_hash="unused",
        role="admin",
        first_name="AdminA",
    )
    admin_b = User(
        username=f"admin-b-{suffix}",
        email=f"admin-b-{suffix}@example.com",
        password_hash="unused",
        role="admin",
        first_name="AdminB",
    )
    setup.add_all([admin_a, admin_b])
    setup.commit()
    admin_a_id = admin_a.id
    admin_b_id = admin_b.id
    setup.close()

    barrier = Barrier(2)

    def race_delete(actor_id: int, target_id: int) -> str:
        session = session_factory()
        try:
            actor = session.get(User, actor_id)
            barrier.wait()
            delete_user(session, target_id, actor=actor)
            return "success"
        except ConflictError as exc:
            if exc.code == "cannot_delete_last_admin":
                return "last_admin_conflict"
            return f"conflict_{exc.code}"
        finally:
            session.close()

    tasks = [
        (admin_a_id, admin_b_id),
        (admin_b_id, admin_a_id),
    ]

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda args: race_delete(*args), tasks))

    verify = session_factory()
    admins = verify.query(User).filter(User.id.in_([admin_a_id, admin_b_id])).all()
    active_admins = [u for u in admins if not u.is_deleted]
    deleted_admins = [u for u in admins if u.is_deleted]

    assert sorted(results) == ["last_admin_conflict", "success"]
    assert len(active_admins) == 1
    assert len(deleted_admins) == 1
    verify.close()
    engine.dispose()
