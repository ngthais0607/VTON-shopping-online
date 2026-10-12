"""VietQR payment instructions assembled from application settings."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import quote, urlencode

from app.core.config import Settings, get_settings


@dataclass(frozen=True)
class VietQRInstructions:
    qr_url: str
    bank_id: str
    bank_name: str
    account_no: str
    account_name: str
    memo: str
    amount: int


def build_vietqr_instructions(
    amount: Decimal | float | int,
    memo: str,
    settings: Settings | None = None,
) -> VietQRInstructions:
    config = settings or get_settings()
    if not getattr(config, "vietqr_bank_id", None) or not getattr(config, "vietqr_account_no", None):
        raise ValueError("VietQR bank_id and account_no must be configured")
    rounded_amount = int(
        Decimal(str(amount)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )
    image = (
        "https://img.vietqr.io/image/"
        f"{quote(config.vietqr_bank_id, safe='')}-"
        f"{quote(config.vietqr_account_no, safe='')}-compact2.png"
    )
    query = urlencode(
        {
            "amount": rounded_amount,
            "addInfo": memo,
            "accountName": config.vietqr_account_name,
        }
    )
    return VietQRInstructions(
        qr_url=f"{image}?{query}",
        bank_id=config.vietqr_bank_id,
        bank_name=config.vietqr_bank_name,
        account_no=config.vietqr_account_no,
        account_name=config.vietqr_account_name,
        memo=memo,
        amount=rounded_amount,
    )


def get_vietqr_bank_config() -> dict[str, str]:
    """Compatibility for order response assembly while callers migrate."""
    settings = get_settings()
    return {
        "bank_id": settings.vietqr_bank_id,
        "bank_name": settings.vietqr_bank_name,
        "account_no": settings.vietqr_account_no,
        "account_name": settings.vietqr_account_name,
    }


def generate_vietqr_url(
    bank_id: str | None = None,
    account_no: str | None = None,
    account_name: str | None = None,
    amount: Decimal | float | int = 0,
    memo: str = "",
) -> str:
    """Compatibility for existing order use case callers."""
    settings = get_settings()
    overrides = {
        "vietqr_bank_id": bank_id or settings.vietqr_bank_id,
        "vietqr_account_no": account_no or settings.vietqr_account_no,
        "vietqr_account_name": account_name or settings.vietqr_account_name,
        "vietqr_bank_name": settings.vietqr_bank_name,
    }
    return build_vietqr_instructions(amount, memo, _BankConfig(**overrides)).qr_url


@dataclass(frozen=True)
class _BankConfig:
    vietqr_bank_id: str
    vietqr_account_no: str
    vietqr_account_name: str
    vietqr_bank_name: str
