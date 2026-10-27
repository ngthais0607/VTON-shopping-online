from decimal import Decimal

import pytest

from app.integrations.vietqr import build_vietqr_instructions
from tests.test_vietqr_webhook import SECRET, WEBHOOK_URL, setup_test_order


@pytest.mark.parametrize(
    "value,expected",
    [
        ("100.49", 100),
        ("100.50", 101),
        ("100.51", 101),
        ("0.5", 1),
        ("1.5", 2),
        ("2.5", 3),
    ],
)
def test_qr_and_webhook_agree_on_half_up_vnd(client, db_session, value, expected):
    order, product = setup_test_order(db_session, total_amount=Decimal(value))
    assert build_vietqr_instructions(Decimal(value), f"TL{order.id}").amount == expected
    response = client.post(
        WEBHOOK_URL,
        json={
            "transaction_id": f"round-{value}",
            "amount": expected,
            "content": f"TL{order.id}",
        },
        headers={"X-Webhook-Secret": SECRET},
    )
    assert response.status_code == 200, response.json()
    assert response.json()["status"] == "success"
    db_session.refresh(order)
    assert order.paid_at is not None


@pytest.mark.parametrize("convert", [Decimal, float, int, str])
@pytest.mark.parametrize("value,expected", [("0", 0), ("1", 1), ("100", 100)])
def test_vnd_helper_accepts_all_supported_types(convert, value, expected):
    from app.integrations.vietqr import to_vnd_amount

    assert to_vnd_amount(convert(value)) == expected


@pytest.mark.parametrize(
    "value,expected", [(0.49, 0), (0.5, 1), (0.51, 1), (1.5, 2), (2.5, 3)]
)
def test_vnd_helper_uses_half_up(value, expected):
    from app.integrations.vietqr import to_vnd_amount

    assert to_vnd_amount(value) == expected
