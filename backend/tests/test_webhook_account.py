import pytest

from app.features.orders.model import Payment
from tests.test_vietqr_webhook import SECRET, WEBHOOK_URL, setup_test_order


@pytest.mark.parametrize(
    "account,allowed",
    [(None, True), ("0382912048", True), ("wrong-account", False), ("", False)],
)
def test_webhook_checks_supplied_recipient_account(
    client, db_session, account, allowed
):
    order, product = setup_test_order(db_session)
    payload = {
        "transaction_id": "recipient-check",
        "amount": 100,
        "content": f"TL{order.id}",
    }
    if account is not None:
        payload["account_number"] = account
    response = client.post(
        WEBHOOK_URL, json=payload, headers={"X-Webhook-Secret": SECRET}
    )
    assert response.status_code == (200 if allowed else 400), response.json()
    if not allowed:
        assert response.json()["code"] == "account_mismatch"
    db_session.refresh(order)
    db_session.refresh(product.variants[0])
    assert order.status == ("paid" if allowed else "pending")
    assert db_session.query(Payment).filter_by(order_id=order.id).count() == (
        1 if allowed else 0
    )
    assert (
        product.variants[0].reserved_quantity,
        product.variants[0].sold_quantity,
    ) == ((0, 1) if allowed else (1, 0))
