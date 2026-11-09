from functools import lru_cache
from typing import Annotated, Any

from pydantic import (
    BeforeValidator,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)
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
    app_env: str = "development"

    secret_key: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=30, gt=0)
    refresh_token_expire_days: int = Field(default=7, gt=0)
    refresh_cookie_secure: bool = True
    refresh_cookie_samesite: str = "lax"

    order_expire_minutes: int = Field(default=30, gt=0)
    low_stock_threshold: int = Field(default=20, ge=1)

    redis_url: str = "memory://"
    cors_origins: Annotated[
        tuple[str, ...],
        NoDecode,
        BeforeValidator(_parse_cors_origins),
    ] = ("http://localhost:3000",)
    forwarded_allow_ips: str = ""

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = Field(min_length=1)
    minio_secret_key: str = Field(min_length=1)
    minio_bucket: str = "product-images"
    minio_secure: bool = False
    minio_external_url: str = ""

    vietqr_bank_id: str = Field(min_length=1)
    vietqr_bank_name: str = "MB Bank (Ngan hang Quan doi)"
    vietqr_account_no: str = Field(min_length=1)
    vietqr_account_name: str = "TRUELOOK"
    vietqr_webhook_secret: str = ""

    vton_enabled: bool = True
    # "mock" renders a clearly watermarked CPU preview; "catvton" calls the GPU service.
    vton_engine: str = "mock"
    vton_service_url: str = "http://catvton:8080"
    # Generation time is not capped tightly: first runs download model weights and
    # CPU/low-end GPUs can take many minutes. The stale threshold below must stay
    # above this timeout so the recovery cron never fails a task still running.
    vton_service_timeout_seconds: int = Field(default=3600, gt=0)
    vton_daily_quota: int = Field(default=10, ge=1)
    vton_retention_hours: int = Field(default=24, ge=1)
    vton_queue_name: str = "vton"
    vton_max_attempts: int = Field(default=2, ge=1, le=5)
    vton_stale_processing_minutes: int = Field(default=75, ge=1)

    emails_enabled: bool = True
    emails_console_log: bool = True
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str = ""
    smtp_password: str = ""
    emails_from_email: str = "noreply@truelook.com"
    emails_from_name: str = "TrueLook E-Commerce"

    @field_validator("minio_external_url", mode="before")
    @classmethod
    def derive_minio_external_url(cls, value: Any, info: ValidationInfo) -> str:
        if isinstance(value, str) and value.strip():
            return value
        endpoint = info.data.get("minio_endpoint", "localhost:9000")
        scheme = "https" if info.data.get("minio_secure", False) else "http"
        return f"{scheme}://{endpoint}"

    @field_validator("vton_engine")
    @classmethod
    def validate_vton_engine(cls, value: str) -> str:
        val = value.strip().lower()
        if val not in {"mock", "catvton"}:
            raise ValueError("vton_engine must be 'mock' or 'catvton'")
        return val

    @field_validator("refresh_cookie_samesite")
    @classmethod
    def validate_refresh_cookie_samesite(cls, value: str) -> str:
        val = value.lower()
        if val not in {"lax", "strict", "none"}:
            raise ValueError(
                "refresh_cookie_samesite must be one of 'lax', 'strict', or 'none'"
            )
        return val

    @model_validator(mode="after")
    def validate_cookie_security(self) -> "Settings":
        if self.refresh_cookie_samesite == "none" and not self.refresh_cookie_secure:
            raise ValueError(
                "refresh_cookie_secure must be True when refresh_cookie_samesite is 'none'"
            )
        return self

    @model_validator(mode="after")
    def validate_vton_timeouts(self) -> "Settings":
        # job_timeout is service timeout + 60s; recovery must not fire before it.
        stale_seconds = self.vton_stale_processing_minutes * 60
        if stale_seconds < self.vton_service_timeout_seconds + 120:
            raise ValueError(
                "vton_stale_processing_minutes must exceed vton_service_timeout_seconds "
                "by at least 2 minutes"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
