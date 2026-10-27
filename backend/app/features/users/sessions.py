"""Device session persistence; the caller owns commit and rollback."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AuthenticationError
from app.core.security import RefreshTokenClaims
from app.features.users.model import User
from app.features.users.session_model import UserSession


def lock_active_user(db: Session, user_id: int) -> User:
    user = (
        db.query(User)
        .filter(User.id == user_id, User.is_deleted.is_(False))
        .populate_existing()
        .with_for_update()
        .first()
    )
    if user is None:
        raise AuthenticationError(
            "Could not validate credentials", code="invalid_token"
        )
    return user


def create_session(db: Session, user_id: int) -> UserSession:
    session = UserSession(
        user_id=user_id,
        expires_at=datetime.now(timezone.utc)
        + timedelta(days=get_settings().refresh_token_expire_days),
    )
    db.add(session)
    db.flush()
    return session


def rotate_session(db: Session, claims: RefreshTokenClaims) -> UserSession:
    lock_active_user(db, int(claims.subject))
    updated = (
        db.query(UserSession)
        .filter(
            UserSession.id == claims.session_id,
            UserSession.user_id == int(claims.subject),
            UserSession.refresh_version == claims.version,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > datetime.now(timezone.utc),
        )
        .update(
            {UserSession.refresh_version: UserSession.refresh_version + 1},
            synchronize_session=False,
        )
    )
    if updated != 1:
        raise AuthenticationError(
            "Could not validate credentials", code="invalid_token"
        )
    return (
        db.query(UserSession).filter_by(id=claims.session_id).populate_existing().one()
    )


def revoke_session(db: Session, claims: RefreshTokenClaims) -> None:
    lock_active_user(db, int(claims.subject))
    db.query(UserSession).filter(
        UserSession.id == claims.session_id,
        UserSession.user_id == int(claims.subject),
        UserSession.refresh_version == claims.version,
        UserSession.revoked_at.is_(None),
    ).update(
        {UserSession.revoked_at: datetime.now(timezone.utc)}, synchronize_session=False
    )


def revoke_user_sessions(db: Session, user_id: int) -> None:
    db.query(UserSession).filter(
        UserSession.user_id == user_id, UserSession.revoked_at.is_(None)
    ).update(
        {UserSession.revoked_at: datetime.now(timezone.utc)}, synchronize_session=False
    )
