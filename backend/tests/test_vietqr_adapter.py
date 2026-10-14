from decimal import Decimal
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

from app.integrations.vietqr import VietQRInstructions, build_vietqr_instructions


def test_vietqr_builder_rounds_half_up_and_encodes_details():
    settings = SimpleNamespace(
        vietqr_bank_id="MB",
        vietqr_bank_name="Military Bank",
        vietqr_account_no="012345",
        vietqr_account_name="Nguyễn Văn A",
    )

    instructions = build_vietqr_instructions(Decimal("12.5"), "Order #1 & 2", settings)

    assert isinstance(instructions, VietQRInstructions)
    assert instructions.amount == 13
    assert instructions.bank_name == "Military Bank"
    assert instructions.account_no == "012345"
    query = parse_qs(urlsplit(instructions.qr_url).query)
    assert query == {
        "amount": ["13"],
        "addInfo": ["Order #1 & 2"],
        "accountName": ["Nguyễn Văn A"],
    }
    assert "%26" in instructions.qr_url


def test_vietqr_builder_fails_fast_when_credentials_missing():
    settings = SimpleNamespace(
        vietqr_bank_id="",
        vietqr_bank_name="Military Bank",
        vietqr_account_no="",
        vietqr_account_name="TrueLook",
    )
    import pytest

    with pytest.raises(
        ValueError, match="VietQR bank_id and account_no must be configured"
    ):
        build_vietqr_instructions(Decimal("100"), "TRUELOOK_1", settings)
