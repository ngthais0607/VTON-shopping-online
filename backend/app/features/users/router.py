from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import AuthenticationError
from app.core.rate_limiter import limiter
from app.core.schemas import Page
from app.core.security import get_current_admin, get_current_user
from app.features.users import service
from app.features.users.model import User
from app.features.users.schemas import (
    LoginCommand,
    PasswordChange,
    RefreshTokenRequest,
    TokenPair,
    UserCreate,
    UserPatch,
    UserResponse,
)
from app.integrations.queue import TaskQueue, get_task_queue

router = APIRouter(prefix="/api/v1/users", tags=["Users"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register user",
)
@limiter.limit("5/minute")
async def register_user(
    request: Request,
    command: UserCreate,
    db: Session = Depends(get_db),
    queue: TaskQueue = Depends(get_task_queue),
):
    return await service.register_user(db, command, queue)


@router.post("/login", response_model=TokenPair, summary="Login user")
@limiter.limit("5/minute")
def login_user(
    request: Request,
    response: Response,
    command: LoginCommand,
    db: Session = Depends(get_db),
):
    tokens = service.login_user(db, command)
    _set_refresh_cookie(request, response, tokens.refresh_token)
    return tokens


@router.post("/refresh", response_model=TokenPair, summary="Refresh session")
def refresh_user_session(
    request: Request,
    response: Response,
    body: RefreshTokenRequest | None = None,
    db: Session = Depends(get_db),
):
    refresh_token = (
        body.refresh_token
        if body is not None and body.refresh_token
        else request.cookies.get("refresh_token")
    )
    if not refresh_token:
        raise AuthenticationError(
            "Could not validate credentials",
            code="invalid_token",
        )
    tokens = service.refresh_user_session(db, refresh_token)
    _set_refresh_cookie(request, response, tokens.refresh_token)
    return tokens


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout user",
)
def logout_user(request: Request, response: Response) -> None:
    response.delete_cookie(
        key="refresh_token",
        secure=request.app.state.settings.refresh_cookie_secure,
        httponly=True,
        samesite="lax",
    )


@router.get("/me", response_model=UserResponse, summary="Get current user")
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse, summary="Update current user")
def update_profile(
    command: UserPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_profile(db, current_user, command)


@router.patch(
    "/me/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change current user password",
)
def change_password(
    command: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service.change_password(db, current_user, command)


@router.get("", response_model=Page[UserResponse], summary="List users")
def list_users(
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    return service.list_users(db, search, limit, offset)


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create user",
)
def create_user(
    command: UserCreate,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    return service.create_user(db, command)


@router.get("/{user_id}", response_model=UserResponse, summary="Get user")
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    return service.get_user(db, user_id)


@router.patch("/{user_id}", response_model=UserResponse, summary="Update user")
def update_user(
    user_id: int,
    command: UserPatch,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    return service.update_user(db, user_id, command)


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete user",
)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
) -> None:
    service.delete_user(db, user_id)


def _set_refresh_cookie(
    request: Request, response: Response, refresh_token: str
) -> None:
    settings = request.app.state.settings
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=settings.refresh_cookie_secure,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
    )
