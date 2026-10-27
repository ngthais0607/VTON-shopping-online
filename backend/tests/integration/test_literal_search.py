import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.features.users.model import User
from app.features.users.service import list_users

pytestmark = pytest.mark.integration


def test_mariadb_search_escapes_literal_wildcards():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL required")
    engine = create_engine(url)
    prefix = uuid4().hex[:12]
    with sessionmaker(bind=engine)() as db:
        for i, suffix in enumerate(
            ("_literal", "Xliteral", "%percent", "Xpercent", "\\slash")
        ):
            db.add(
                User(
                    username=prefix + suffix,
                    email=prefix + str(i) + "@example.com",
                    password_hash="unused",
                    role="customer",
                )
            )
        db.commit()
        for suffix in ("_literal", "%percent", "\\slash"):
            assert [
                row.username for row in list_users(db, prefix + suffix, 20, 0).items
            ] == [prefix + suffix]
    engine.dispose()
