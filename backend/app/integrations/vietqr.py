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


def to_vnd_amount(value: Decimal | float | int | str) -> int:
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def build_vietqr_instructions(
    amount: Decimal | float | int | str,
    memo: str,
    settings: Settings | None = None,
) -> VietQRInstructions:
    config = settings or get_settings()
    if not getattr(config, "vietqr_bank_id", None) or not getattr(
        config, "vietqr_account_no", None
    ):
        raise ValueError("VietQR bank_id and account_no must be configured")
    rounded_amount = to_vnd_amount(amount)
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
