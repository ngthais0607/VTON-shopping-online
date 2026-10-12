from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Query, Session

from app.core.errors import (
    AuthenticationError,
    BusinessRuleError,
    ConflictError,
    ResourceNotFoundError,
)
from app.core.schemas import Page
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.features.users.model import User
from app.features.users.schemas import (
    LoginCommand,
    PasswordChange,
    TokenPair,
    UserCreate,
    UserPatch,
)
from app.integrations.queue import TaskQueue

logger = logging.getLogger(__name__)


class DuplicateUserError(ConflictError):
    code = "duplicate_user"

    def __init__(self) -> None:
        super().__init__(
            "Username or email already exists",
            code=self.code,
        )


async def register_user(
    db: Session,
    command: UserCreate,
    queue: TaskQueue,
) -> User:
    user = _create_user(db, command)
    try:
        await queue.enqueue("send_welcome_email_task", user.id)
    except Exception:
        logger.exception("Failed to enqueue welcome email for user %s", user.id)
    return user


def login_user(db: Session, command: LoginCommand) -> TokenPair:
    user = (
        _active_users_query(db)
        .filter(
            or_(
                User.email == command.identifier,
                User.username == command.identifier,
            )
        )
        .first()
    )
    if user is None or not verify_password(command.password, user.password_hash):
        raise AuthenticationError(
            "Invalid username, email, or password",
            code="invalid_credentials",
        )
    return _token_pair(user.id, user.refresh_version)


def refresh_user_session(db: Session, refresh_token: str) -> TokenPair:
    claims = decode_refresh_token(refresh_token)
    next_version = claims.version + 1
    updated = (
        db.query(User)
        .filter(
            User.id == int(claims.subject),
            User.is_deleted.is_(False),
            User.refresh_version == claims.version,
        )
        .update(
            {User.refresh_version: next_version},
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        raise _invalid_refresh_token()
    db.commit()
    return _token_pair(int(claims.subject), next_version)


def update_profile(db: Session, current_user: User, command: UserPatch) -> User:
    return _update_user(db, current_user, command)


def change_password(
    db: Session,
    current_user: User,
    command: PasswordChange,
) -> None:
    if not verify_password(command.current_password, current_user.password_hash):
        raise BusinessRuleError(
            "Current password is incorrect",
            code="incorrect_password",
        )
    current_user.password_hash = hash_password(command.new_password)
    current_user.refresh_version = User.refresh_version + 1
    _commit_user(db, current_user)


def list_users(
    db: Session,
    search: str | None,
    limit: int,
    offset: int,
) -> Page[User]:
    query = _active_users_query(db)
    if search:
        query = query.filter(
            or_(
                User.username.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                User.first_name.ilike(f"%{search}%"),
                User.last_name.ilike(f"%{search}%"),
            )
        )
    total = query.count()
    users = query.order_by(User.id).offset(offset).limit(limit).all()
    return Page(items=users, total=total, limit=limit, offset=offset)


def get_user(db: Session, user_id: int) -> User:
    return _get_active_user(db, user_id)


def create_user(db: Session, command: UserCreate) -> User:
    return _create_user(db, command)


def update_user(db: Session, user_id: int, command: UserPatch) -> User:
    user = _get_active_user(db, user_id)
    return _update_user(db, user, command)


def delete_user(db: Session, user_id: int) -> None:
    user = _get_active_user(db, user_id)
    user.is_deleted = True
    user.deleted_at = datetime.now(timezone.utc)
    _commit_user(db, user, refresh=False)


def _create_user(db: Session, command: UserCreate) -> User:
    _ensure_unique_user(db, username=command.username, email=command.email)
    from app.core.config import get_settings
    settings = get_settings()
    role = "customer"
    if settings.bootstrap_admin_email and command.email.lower() == settings.bootstrap_admin_email.lower():
        role = "admin"
    user = User(
        username=command.username,
        email=command.email,
        password_hash=hash_password(command.password),
        first_name=command.first_name,
        last_name=command.last_name,
        role=role,
    )
    db.add(user)
    return _commit_user(db, user)


def _update_user(db: Session, user: User, command: UserPatch) -> User:
    changes = command.model_dump(exclude_unset=True)
    username = changes.get("username", user.username)
    email = changes.get("email", user.email)
    _ensure_unique_user(
        db,
        username=username,
        email=email,
        exclude_user_id=user.id,
    )
    for field, value in changes.items():
        setattr(user, field, value)
    return _commit_user(db, user)


def _ensure_unique_user(
    db: Session,
    *,
    username: str,
    email: str,
    exclude_user_id: int | None = None,
) -> None:
    if (
        _find_duplicate_user(
            db,
            username=username,
            email=email,
            exclude_user_id=exclude_user_id,
        )
        is not None
    ):
        raise DuplicateUserError


def _find_duplicate_user(
    db: Session,
    *,
    username: str,
    email: str,
    exclude_user_id: int | None = None,
) -> User | None:
    query = db.query(User).filter(or_(User.username == username, User.email == email))
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return query.first()


def _commit_user(db: Session, user: User, *, refresh: bool = True) -> User:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateUserError from exc
    if refresh:
        db.refresh(user)
    return user


def _active_users_query(db: Session) -> Query:
    return db.query(User).filter(User.is_deleted.is_(False))


def _get_active_user(db: Session, user_id: int) -> User:
    user = _active_users_query(db).filter(User.id == user_id).first()
    if user is None:
        raise ResourceNotFoundError(
            f"User {user_id} was not found",
            code="user_not_found",
        )
    return user


def _token_pair(user_id: int, refresh_version: int) -> TokenPair:
    return TokenPair(
        access_token=create_access_token({"sub": str(user_id)}),
        refresh_token=create_refresh_token(
            {
                "sub": str(user_id),
                "version": refresh_version,
            }
        ),
    )


def _invalid_refresh_token() -> AuthenticationError:
    return AuthenticationError(
        "Could not validate credentials",
        code="invalid_token",
    )
