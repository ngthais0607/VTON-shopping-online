from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import BackgroundTasks
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
from app.core.search import literal_contains_pattern
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.features.users import sessions
from app.features.users.model import User
from app.features.users.schemas import (
    LoginCommand,
    PasswordChange,
    TokenPair,
    UserCreate,
    UserPatch,
)
from app.features.users.session_model import UserSession
from app.integrations.queue import TaskQueue

logger = logging.getLogger(__name__)
_DUMMY_HASH = hash_password("invalid-user-password-work-factor")


class DuplicateUserError(ConflictError):
    code = "duplicate_user"

    def __init__(self) -> None:
        super().__init__(
            "Username or email already exists",
            code=self.code,
        )


async def _enqueue_welcome_email(queue: TaskQueue, user_id: int) -> None:
    try:
        await queue.enqueue("send_welcome_email_task", user_id)
    except Exception as exc:
        logger.error(
            "Failed to enqueue welcome email for user %s: %s",
            user_id,
            exc,
            extra={
                "user_id": user_id,
                "task_name": "send_welcome_email_task",
                "error": str(exc),
            },
            exc_info=True,
        )


def register_user(
    db: Session,
    command: UserCreate,
    queue: TaskQueue,
    background_tasks: BackgroundTasks | None = None,
) -> User:
    user = _create_user(db, command)
    if background_tasks is not None:
        background_tasks.add_task(_enqueue_welcome_email, queue, user.id)
    else:
        try:
            import anyio

            anyio.from_thread.run(_enqueue_welcome_email, queue, user.id)
        except Exception:
            try:
                import asyncio

                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(_enqueue_welcome_email(queue, user.id))
                else:
                    loop.run_until_complete(_enqueue_welcome_email(queue, user.id))
            except Exception:
                try:
                    asyncio.run(_enqueue_welcome_email(queue, user.id))
                except Exception as exc:
                    logger.error("Failed to dispatch welcome email: %s", exc)
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
        .populate_existing()
        .with_for_update()
        .first()
    )
    password_matches = verify_password(
        command.password, user.password_hash if user else _DUMMY_HASH
    )
    if user is None or not password_matches:
        raise AuthenticationError(
            "Invalid username, email, or password",
            code="invalid_credentials",
        )
    session = sessions.create_session(db, user.id)
    tokens = _token_pair(user.id, session)
    db.commit()
    return tokens


def refresh_user_session(db: Session, refresh_token: str) -> TokenPair:
    claims = decode_refresh_token(refresh_token)
    try:
        session = sessions.rotate_session(db, claims)
        tokens = _token_pair(int(claims.subject), session)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return tokens


def logout_user_session(db: Session, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    try:
        claims = decode_refresh_token(refresh_token)
    except AuthenticationError:
        return
    try:
        sessions.revoke_session(db, claims)
        db.commit()
    except AuthenticationError:
        db.rollback()


def update_profile(db: Session, current_user: User, command: UserPatch) -> User:
    return _update_user(db, current_user, command)


def change_password(
    db: Session,
    current_user: User,
    command: PasswordChange,
) -> None:
    current_user = sessions.lock_active_user(db, current_user.id)
    if not verify_password(command.current_password, current_user.password_hash):
        raise BusinessRuleError(
            "Current password is incorrect",
            code="incorrect_password",
        )
    current_user.password_hash = hash_password(command.new_password)
    sessions.revoke_user_sessions(db, current_user.id)
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
                User.username.ilike(literal_contains_pattern(search), escape="\\"),
                User.email.ilike(literal_contains_pattern(search), escape="\\"),
                User.first_name.ilike(literal_contains_pattern(search), escape="\\"),
                User.last_name.ilike(literal_contains_pattern(search), escape="\\"),
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


def delete_user(db: Session, user_id: int, actor: User) -> None:
    if actor.id == user_id:
        raise ConflictError(
            "Administrators cannot delete their own account",
            code="admin_cannot_delete_self",
        )

    user = _get_active_user(db, user_id)

    if user.role == "admin":
        active_admins = (
            db.query(User)
            .filter(User.role == "admin", User.is_deleted.is_(False))
            .order_by(User.id.asc())
            .with_for_update()
            .all()
        )
        if len(active_admins) <= 1:
            raise ConflictError(
                "Cannot delete the last remaining admin account",
                code="cannot_delete_last_admin",
            )

    now = datetime.now(timezone.utc)
    ts = int(now.timestamp())
    user.email = f"deleted+{user.id}+{ts}@invalid"
    user.username = f"deleted_{user.id}_{ts}"
    user.is_deleted = True
    user.deleted_at = now
    _commit_user(db, user, refresh=False)


def _create_user(db: Session, command: UserCreate) -> User:
    _ensure_unique_user(db, username=command.username, email=command.email)
    user = User(
        username=command.username,
        email=command.email,
        password_hash=hash_password(command.password),
        first_name=command.first_name,
        last_name=command.last_name,
        role="customer",
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


def _token_pair(user_id: int, session: UserSession) -> TokenPair:
    expires_at = session.expires_at.replace(tzinfo=timezone.utc)
    return TokenPair(
        access_token=create_access_token(
            {
                "sub": str(user_id),
                "sid": session.id,
                "sv": session.refresh_version,
                "session_started_at": int(
                    session.created_at.replace(tzinfo=timezone.utc).timestamp()
                    * 1_000_000
                ),
            }
        ),
        refresh_token=create_refresh_token(
            {
                "sub": str(user_id),
                "version": session.refresh_version,
                "sid": session.id,
            },
            expires_delta=expires_at - datetime.now(timezone.utc),
        ),
        refresh_expires_at=expires_at,
    )


def _invalid_refresh_token() -> AuthenticationError:
    return AuthenticationError(
        "Could not validate credentials",
        code="invalid_token",
    )
