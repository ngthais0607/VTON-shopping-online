import pytest

from app.features.users.model import User
from app.features.users.service import list_users


@pytest.mark.parametrize(
    "term, wanted", [("_", "under_score"), ("%", "per%cent"), ("\\", "back\\slash")]
)
def test_user_search_matches_literal_wildcards(db_session, term, wanted):
    for index, name in enumerate(
        ("under_score", "per%cent", "back\\slash", "ordinary")
    ):
        db_session.add(
            User(
                username=name,
                email=f"search{index}@example.test",
                password_hash="unused",
                role="customer",
            )
        )
    db_session.commit()
    result = list_users(db_session, term, 20, 0)
    assert [row.username for row in result.items] == [wanted]
