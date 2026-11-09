"""Seed demo admin and customer accounts (idempotent).

Run from the backend directory:

    python -m scripts.seed_users
    python -m scripts.seed_users --reset-password   # also reset existing passwords

Credentials can be overridden with environment variables:
    SEED_ADMIN_USERNAME / SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
    SEED_USER_USERNAME  / SEED_USER_EMAIL  / SEED_USER_PASSWORD

Refuses to run when APP_ENV=production. The defaults are for local demos only.
"""

import argparse
import os
import sys

from sqlalchemy import or_

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.features.users.model import User
from app.features.users.schemas import _validate_new_password


def _accounts() -> list[dict]:
    return [
        {
            "username": os.getenv("SEED_ADMIN_USERNAME", "admin"),
            "email": os.getenv("SEED_ADMIN_EMAIL", "admin@truelook.test"),
            "password": os.getenv("SEED_ADMIN_PASSWORD", "Admin@12345"),
            "first_name": "Admin",
            "last_name": "TrueLook",
            "role": "admin",
        },
        {
            "username": os.getenv("SEED_USER_USERNAME", "user"),
            "email": os.getenv("SEED_USER_EMAIL", "user@truelook.test"),
            "password": os.getenv("SEED_USER_PASSWORD", "User@12345"),
            "first_name": "Demo",
            "last_name": "Customer",
            "role": "customer",
        },
    ]


def seed(reset_password: bool = False) -> int:
    if get_settings().app_env.lower() in {"production", "prod"}:
        print("Refusing to seed demo accounts in production.", file=sys.stderr)
        return 1

    accounts = _accounts()
    for account in accounts:
        if len(account["password"]) < 8:
            print(f"Password for '{account['username']}' is too short", file=sys.stderr)
            return 1
        try:
            _validate_new_password(account["password"])
        except ValueError as exc:
            print(f"Invalid password for '{account['username']}': {exc}", file=sys.stderr)
            return 1

    db = SessionLocal()
    shown: list[dict] = []
    try:
        for account in accounts:
            user = (
                db.query(User)
                .filter(
                    or_(
                        User.username == account["username"],
                        User.email == account["email"],
                    )
                )
                .first()
            )
            if user is None:
                db.add(
                    User(
                        username=account["username"],
                        email=account["email"],
                        password_hash=hash_password(account["password"]),
                        first_name=account["first_name"],
                        last_name=account["last_name"],
                        role=account["role"],
                    )
                )
                print(f"[created] {account['role']:<8} {account['username']} <{account['email']}>")
                shown.append(account)
                continue

            changed = False
            if user.role != account["role"]:
                user.role = account["role"]
                changed = True
            if user.is_deleted:
                user.is_deleted = False
                user.deleted_at = None
                changed = True
            if reset_password:
                user.password_hash = hash_password(account["password"])
                user.refresh_version = (user.refresh_version or 0) + 1
                changed = True
                shown.append(account)
            status = "updated" if changed else "exists "
            print(f"[{status}] {account['role']:<8} {user.username} <{user.email}>")
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"Seeding failed: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    print("\nDone. Passwords applied this run (existing accounts keep theirs):")
    for account in shown:
        print(f"  {account['role']:<8} {account['username']} / {account['password']}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed demo admin and user accounts")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset the password of accounts that already exist",
    )
    sys.exit(seed(reset_password=parser.parse_args().reset_password))
