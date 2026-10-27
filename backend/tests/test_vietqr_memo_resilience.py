import pytest

from app.features.orders.service import (
    generate_order_payment_memo,
    parse_order_ids_from_memo,
)


def test_vietqr_memo_format():
    assert generate_order_payment_memo(12) == "TL12"
    with pytest.raises(ValueError):
        generate_order_payment_memo(0)
    with pytest.raises(ValueError):
        generate_order_payment_memo(-5)


@pytest.mark.parametrize(
    "memo,expected_ids",
    [
        ("TL12", [12]),
        ("TL-12", [12]),
        ("TL 12", [12]),
        ("TRUELOOK_12", [12]),
        ("TRUELOOK12", [12]),
        ("TRUELOOK-12", [12]),
        ("LUXESTORE_12", [12]),
        ("LUXESTORE12", [12]),
        ("Chuyen tien TL12 tu Nguyen Van A", [12]),
        ("MBVCB.123456.TL-12.CT tu 0912345", [12]),
        ("TL12X13", [12, 13]),
        ("TL12x13", [12, 13]),
        ("TRUELOOK_12_13", [12, 13]),
        ("LUXESTORE_12_13", [12, 13]),
        ("TL12X12", [12]),
    ],
)
def test_parse_vietqr_memo_valid(memo, expected_ids):
    assert parse_order_ids_from_memo(memo) == expected_ids


@pytest.mark.parametrize(
    "memo",
    [
        "TL0",
        "TL-0",
        "SOMETHING_ELSE_12",
        "TL12ABC",
        "TL12 TL13",
        "",
        "No memo here",
    ],
)
def test_parse_vietqr_memo_invalid(memo):
    assert parse_order_ids_from_memo(memo) == []
