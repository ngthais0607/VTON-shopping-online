from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.core.schemas import UtcDatetime


def _validate_new_password(password: str) -> str:
    if len(password.encode("utf-8")) > 72 or "\x00" in password:
        raise ValueError("Password must be at most 72 UTF-8 bytes and contain no NUL")
    return password


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)
    first_name: str | None = Field(default=None, max_length=255)
    last_name: str | None = Field(default=None, max_length=255)

    @field_validator("password")
    @classmethod
    def validate_password(cls, password: str) -> str:
        return _validate_new_password(password)


class UserPatch(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = Field(default=None)
    first_name: str | None = Field(default=None, max_length=255)
    last_name: str | None = Field(default=None, max_length=255)

    @model_validator(mode="before")
    @classmethod
    def reject_null_identifiers(cls, value: Any) -> Any:
        if isinstance(value, dict):
            for field_name in ("username", "email"):
                if field_name in value and value[field_name] is None:
                    raise ValueError(f"{field_name} cannot be null")
        return value


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    first_name: str | None
    last_name: str | None
    role: str
    created_at: UtcDatetime | None
    updated_at: UtcDatetime | None


class LoginCommand(BaseModel):
    identifier: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=255)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=8, max_length=255)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, password: str) -> str:
        return _validate_new_password(password)


class RefreshTokenRequest(BaseModel):
    refresh_token: str | None = None
