import getpass
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from app import cli
from app.features.users.model import User
from app.features.users.schemas import UserCreate
from app.features.users.service import _create_user


def test_cli_help(capsys):
    with pytest.raises(SystemExit) as exc_info:
        cli.main(["--help"])
    assert exc_info.value.code == 0
    captured = capsys.readouterr()
    assert "create-admin" in captured.out


def test_cli_create_admin_help(capsys):
    with pytest.raises(SystemExit) as exc_info:
        cli.main(["create-admin", "--help"])
    assert exc_info.value.code == 0
    captured = capsys.readouterr()
    assert "--email" in captured.out
    assert "--username" in captured.out


def test_cli_create_admin_success(db_session: Session, capsys):
    with patch.object(
        getpass, "getpass", side_effect=["AdminPassword123", "AdminPassword123"]
    ):
        exit_code = cli.main(
            [
                "create-admin",
                "--email",
                "admin_new@example.com",
                "--username",
                "admin_new",
            ],
            session=db_session,
        )

    assert exit_code == 0
    captured = capsys.readouterr()
    assert "AdminPassword123" not in captured.out
    assert "AdminPassword123" not in captured.err
    assert (
        "successfully created" in captured.out.lower()
        or "created successfully" in captured.out.lower()
    )

    user = db_session.query(User).filter(User.email == "admin_new@example.com").first()
    assert user is not None
    assert user.username == "admin_new"
    assert user.role == "admin"


def test_cli_create_admin_password_mismatch(db_session: Session, capsys):
    with patch.object(
        getpass, "getpass", side_effect=["Password12345", "Mismatch54321"]
    ):
        exit_code = cli.main(
            [
                "create-admin",
                "--email",
                "mismatch@example.com",
                "--username",
                "mismatch_user",
            ],
            session=db_session,
        )

    assert exit_code != 0
    captured = capsys.readouterr()
    assert "Password12345" not in captured.out
    assert "Password12345" not in captured.err
    assert "Mismatch54321" not in captured.out
    assert "Mismatch54321" not in captured.err

    user = db_session.query(User).filter(User.email == "mismatch@example.com").first()
    assert user is None


def test_cli_create_admin_duplicate_email(db_session: Session, capsys):
    _create_user(
        db_session,
        UserCreate(
            username="existing_user",
            email="duplicate@example.com",
            password="ExistingPassword123",
        ),
    )

    with patch.object(
        getpass, "getpass", side_effect=["AdminPassword123", "AdminPassword123"]
    ):
        exit_code = cli.main(
            [
                "create-admin",
                "--email",
                "duplicate@example.com",
                "--username",
                "new_admin_user",
            ],
            session=db_session,
        )

    assert exit_code != 0
    user = db_session.query(User).filter(User.username == "new_admin_user").first()
    assert user is None
    # Existing user's role remains customer
    existing = (
        db_session.query(User).filter(User.email == "duplicate@example.com").one()
    )
    assert existing.role == "customer"


def test_cli_create_admin_duplicate_username(db_session: Session, capsys):
    _create_user(
        db_session,
        UserCreate(
            username="taken_username",
            email="original@example.com",
            password="ExistingPassword123",
        ),
    )

    with patch.object(
        getpass, "getpass", side_effect=["AdminPassword123", "AdminPassword123"]
    ):
        exit_code = cli.main(
            [
                "create-admin",
                "--email",
                "different@example.com",
                "--username",
                "taken_username",
            ],
            session=db_session,
        )

    assert exit_code != 0
    user = db_session.query(User).filter(User.email == "different@example.com").first()
    assert user is None


def test_cli_create_admin_short_password(db_session: Session, capsys):
    with patch.object(getpass, "getpass", side_effect=["short", "short"]):
        exit_code = cli.main(
            [
                "create-admin",
                "--email",
                "shortpass@example.com",
                "--username",
                "shortpass_user",
            ],
            session=db_session,
        )

    assert exit_code != 0
    user = db_session.query(User).filter(User.email == "shortpass@example.com").first()
    assert user is None


def test_cli_create_admin_oversized_password(db_session: Session, capsys):
    oversized = "A" * 75
    with patch.object(getpass, "getpass", side_effect=[oversized, oversized]):
        exit_code = cli.main(
            [
                "create-admin",
                "--email",
                "overpass@example.com",
                "--username",
                "overpass_user",
            ],
            session=db_session,
        )

    assert exit_code != 0
    user = db_session.query(User).filter(User.email == "overpass@example.com").first()
    assert user is None


def test_cli_create_admin_invalid_email(db_session: Session, capsys):
    with patch.object(
        getpass, "getpass", side_effect=["AdminPassword123", "AdminPassword123"]
    ):
        exit_code = cli.main(
            ["create-admin", "--email", "not-an-email", "--username", "valid_username"],
            session=db_session,
        )

    assert exit_code != 0
    user = db_session.query(User).filter(User.username == "valid_username").first()
    assert user is None
