from functools import lru_cache
from typing import Annotated, Any

from pydantic import BeforeValidator, Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _parse_cors_origins(value: Any) -> Any:
    if isinstance(value, str):
        return tuple(origin.strip() for origin in value.split(",") if origin.strip())
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        frozen=True,
        validate_default=True,
    )

    database_url: str = "sqlite:///./app.db"

    secret_key: str = Field(min_length=1)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=30, gt=0)
    refresh_token_expire_days: int = Field(default=7, gt=0)

    redis_url: str = "memory://"
    cors_origins: Annotated[
        tuple[str, ...],
        NoDecode,
        BeforeValidator(_parse_cors_origins),
    ] = ("http://localhost:3000",)

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "admin"
    minio_secret_key: str = "password123"
    minio_bucket: str = "product-images"
    minio_external_url: str = ""

    vietqr_bank_id: str = "MB"
    vietqr_bank_name: str = "MB Bank (Ngan hang Quan doi)"
    vietqr_account_no: str = "0382912048"
    vietqr_account_name: str = "LUXESTORE"

    emails_enabled: bool = True
    emails_console_log: bool = True
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str = ""
    smtp_password: str = ""
    emails_from_email: str = "noreply@luxestore.com"
    emails_from_name: str = "LuxeStore E-Commerce"

    @field_validator("minio_external_url", mode="before")
    @classmethod
    def derive_minio_external_url(cls, value: Any, info: ValidationInfo) -> str:
        if isinstance(value, str) and value.strip():
            return value
        return f"http://{info.data['minio_endpoint']}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
