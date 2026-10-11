from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import AuthenticationError, ForbiddenError
from app.features.users.model import User

settings = get_settings()
SECRET_KEY = settings.secret_key
ALGORITHM = settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes
REFRESH_TOKEN_EXPIRE_DAYS = settings.refresh_token_expire_days

oauth2_password_bearer = OAuth2PasswordBearer(
    tokenUrl="/api/v1/users/login",
    auto_error=False,
)
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    return _create_token(
        data,
        token_type="access",
        expires_delta=expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(data: dict, expires_delta: timedelta | None = None) -> str:
    return _create_token(
        data,
        token_type="refresh",
        expires_delta=expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_access_token(token: str) -> str:
    return _decode_token(token, expected_type="access")


def decode_refresh_token(token: str) -> str:
    return _decode_token(token, expected_type="refresh")


def verify_refresh_token(token: str) -> str:
    return decode_refresh_token(token)


def get_current_user(
    token: str | None = Depends(oauth2_password_bearer),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise _invalid_token()

    email = decode_access_token(token)
    user = (
        db.query(User)
        .filter(
            User.email == email,
            User.is_deleted.is_(False),
        )
        .first()
    )
    if user is None:
        raise _invalid_token()
    return user


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise ForbiddenError(
            "Admin privileges required",
            code="admin_required",
        )
    return current_user


def _create_token(
    data: dict,
    *,
    token_type: Literal["access", "refresh"],
    expires_delta: timedelta,
) -> str:
    payload = data.copy()
    payload.update(
        {
            "exp": datetime.now(timezone.utc) + expires_delta,
            "type": token_type,
        }
    )
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _decode_token(
    token: str,
    *,
    expected_type: Literal["access", "refresh"],
) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise _invalid_token() from exc

    subject = payload.get("sub")
    if payload.get("type") != expected_type or not isinstance(subject, str):
        raise _invalid_token()
    return subject


def _invalid_token() -> AuthenticationError:
    return AuthenticationError(
        "Could not validate credentials",
        code="invalid_token",
    )
