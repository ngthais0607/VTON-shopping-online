from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.core.database import get_db, save_to_db
from datetime import datetime, timezone
from app.features.users import schema
from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    get_current_user,
    get_current_admin,
)
from app.features.users.model import User
from app.core.rate_limiter import limiter
from app.core.queue import enqueue_task


router = APIRouter(
    prefix="/users",
    tags=["Users"]
)


def user_to_json(user: User):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role
    }


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register user"
)
@limiter.limit("5/minute")
async def register_user(
    request: Request,
    user: schema.UserCreate,
    db: Session = Depends(get_db)
):
    existed_user = db.query(User).filter(
        (User.email == user.email) |
        (User.username == user.username)
    ).first()

    if existed_user:
        raise HTTPException(
            status_code=400,
            detail="Username or email already exists"
        )

    new_user = User(
        username=user.username,
        email=user.email,
        first_name = user.first_name,
        last_name = user.last_name,
        password_hash=schema.hash_password(user.password),
        role="admin" if db.query(User).count() == 0 else "customer"
    )

    saved_user = save_to_db(db, new_user)
    await enqueue_task("send_welcome_email_task", saved_user.id)
    return user_to_json(saved_user)




@router.post(
    "/login",
    summary="Login user"
)
@limiter.limit("5/minute")
def login_user(
    request: Request,
    response: Response,
    user: schema.UserLogin,
    db: Session = Depends(get_db)
):
    db_user = db.query(User).filter(
        or_(User.email == user.email, User.username == user.email),
        User.is_deleted == False
    ).first()

    if not db_user or not schema.verify_password(
        user.password,
        db_user.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    access_token = create_access_token(data={"sub": db_user.email})
    refresh_token = create_refresh_token(data={"sub": db_user.email})

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post(
    "/refresh",
    summary="Refresh access token"
)
def refresh_token(
    request: Request,
    response: Response,
    body: schema.RefreshTokenRequest | None = None,
    db: Session = Depends(get_db)
):
    token = body.refresh_token if (body and body.refresh_token) else request.cookies.get("refresh_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )

    email = verify_refresh_token(token)
    db_user = db.query(User).filter(User.email == email, User.is_deleted == False).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    new_access_token = create_access_token(data={"sub": db_user.email})
    new_refresh_token = create_refresh_token(data={"sub": db_user.email})

    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600
    )

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }


@router.post(
    "/logout",
    summary="Logout user"
)
def logout_user(response: Response):
    response.delete_cookie(key="refresh_token")
    return {
        "message": "Logout successfully"
    }

@router.get(
    "/",
    summary="Get users"
)
def get_users(
    search : str | None = None, 
    limit : int = Query(default=20 , ge=1, le=100),
    offset : int = Query(default=0 , ge=0),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):

    query = db.query(User).filter(
        User.is_deleted == False
    )
    if search:
        query = query.filter(
            or_(
                User.username.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                User.first_name.ilike(f"%{search}%"),
                User.last_name.ilike(f"%{search}%")
            )
        )

    users = query.offset(offset).limit(limit).all()
    return [user_to_json(user) for user in users]

@router.get(
    "/me",
    summary="Get current user"
)
def read_current_user(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return user_to_json(current_user)

@router.put(
    "/me",
    summary="Update current user profile"
)
def update_current_user(
    updated_user : schema.UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existed_user = db.query(User).filter(
        (User.id != current_user.id) &
        ((User.email == updated_user.email) | (User.username == updated_user.username))
    ).first()
    
    if existed_user:
        raise HTTPException(
            status_code=400,
            detail="Email or username already exists"
        )
    
    current_user.username = updated_user.username
    current_user.email = updated_user.email
    current_user.first_name = updated_user.first_name
    current_user.last_name = updated_user.last_name
    
    saved_user = save_to_db(db, current_user)
    return user_to_json(saved_user)

@router.put(
    "/me/password",
    summary="Update current user password"
)
def update_password(
    password_data: schema.UserPasswordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    if not schema.verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="Incorrect password"
        )
        
    current_user.password_hash = schema.hash_password(password_data.new_password)
    saved_user = save_to_db(db, current_user)
    return {
        "message": "Password updated successfully"
    }

@router.get(
    "/{user_id}",
    summary="Get user by id"
)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    user = db.query(User).filter(
        User.id == user_id,
        User.is_deleted == False
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return user_to_json(user)

@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    summary="Create user"
   
)
def create_user(
    user: schema.UserCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    existed_user = db.query(User).filter(
        (User.email == user.email) |
        (User.username == user.username)
    ).first()

    if existed_user:
        raise HTTPException(
            status_code=400,
            detail="Username or email already exists"
        )

    new_user = User(
        username=user.username,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        password_hash=schema.hash_password(user.password),
        role="admin" if db.query(User).count() == 0 else "customer"
    )

    saved_user = save_to_db(db, new_user)
    return user_to_json(saved_user)


@router.put(
    "/{user_id}",
    summary="Update user"
)
def update_user(
    user_id: int,
    updated_user: schema.UserUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    user = db.query(User).filter(
        User.id == user_id,
        User.is_deleted == False
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    user.username = updated_user.username
    user.email = updated_user.email
    user.first_name = updated_user.first_name
    user.last_name = updated_user.last_name

    saved_user = save_to_db(db, user)
    return user_to_json(saved_user)


@router.delete(
    "/{user_id}",
    summary="Delete user"
)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    user = db.query(User).filter(
        User.id == user_id,
        User.is_deleted == False
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    user.is_deleted = True
    user.deleted_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "message": "User deleted successfully"
    }
