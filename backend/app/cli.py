import argparse
import getpass
import sys
from typing import Sequence

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.features.users.model import User
from app.features.users.schemas import _validate_new_password


def create_admin(email: str, username: str, session: Session | None = None) -> int:
    username = username.strip()
    if not username or len(username) > 100:
        print("Error: Username must be between 1 and 100 characters", file=sys.stderr)
        return 1

    try:
        TypeAdapter(EmailStr).validate_python(email)
    except ValidationError:
        print("Error: Invalid email address", file=sys.stderr)
        return 1

    try:
        password = getpass.getpass("Password: ")
        confirm_password = getpass.getpass("Confirm Password: ")
    except (EOFError, KeyboardInterrupt):
        print("\nOperation cancelled", file=sys.stderr)
        return 1

    if password != confirm_password:
        print("Error: Passwords do not match", file=sys.stderr)
        return 1

    if len(password) < 8:
        print("Error: Password must be at least 8 characters", file=sys.stderr)
        return 1

    try:
        _validate_new_password(password)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    close_session = False
    if session is None:
        from app.core.database import SessionLocal

        db = SessionLocal()
        close_session = True
    else:
        db = session

    try:
        duplicate = (
            db.query(User)
            .filter(or_(User.username == username, User.email == email))
            .first()
        )
        if duplicate:
            print(
                "Error: A user with this username or email already exists",
                file=sys.stderr,
            )
            return 1

        admin_user = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            role="admin",
        )
        db.add(admin_user)
        db.commit()
        print(f"Admin user '{username}' ({email}) created successfully.")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"Error creating admin user: {exc}", file=sys.stderr)
        return 1
    finally:
        if close_session:
            db.close()


def main(args: Sequence[str] | None = None, session: Session | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="TrueLook Commerce Management CLI",
        prog="python -m app.cli",
    )
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    create_admin_parser = subparsers.add_parser(
        "create-admin",
        help="Create a new administrative user with secure interactive password prompt",
    )
    create_admin_parser.add_argument(
        "--email",
        type=str,
        required=True,
        help="Administrative user email",
    )
    create_admin_parser.add_argument(
        "--username",
        type=str,
        required=True,
        help="Administrative user username",
    )

    parsed_args = parser.parse_args(args)

    if parsed_args.subcommand == "create-admin":
        return create_admin(
            email=parsed_args.email,
            username=parsed_args.username,
            session=session,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
