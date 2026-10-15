from datetime import datetime, timezone

import pytest

from app.features.orders import domain
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from tests.test_vietqr_webhook import setup_test_order


@pytest.mark.parametrize("method", list(OrderPaymentMethod))
@pytest.mark.parametrize("status", list(OrderStatus))
def test_customer_cancel_api_matches_domain_policy(
    client, db_session, mock_user_auth, method, status
):
    order, product = setup_test_order(db_session)
    order.user_id = mock_user_auth.id
    order.payment_method = method.value
    order.status = status.value
    variant = product.variants[0]
    if status in {OrderStatus.CANCELLED, OrderStatus.EXPIRED}:
        variant.reserved_quantity = 0
    elif status == OrderStatus.PAID or (
        method == OrderPaymentMethod.VIETQR
        and status in {OrderStatus.SHIPPED, OrderStatus.DELIVERED}
    ):
        order.paid_at = datetime.now(timezone.utc)
        variant.reserved_quantity, variant.sold_quantity = 0, 1
    db_session.commit()
    allowed = status in domain.CUSTOMER_CANCELLABLE[method]
    # Assert the intended default policy independently of the constant.
    assert allowed == (
        (method.value, status.value) in {("vietqr", "pending"), ("cod", "confirmed")}
    )
    response = client.post(f"/api/v1/orders/{order.id}/cancel")
    assert response.status_code == (200 if allowed else 400), response.json()
    if allowed:
        assert response.json()["status"] == "cancelled"
        db_session.refresh(variant)
        assert (variant.reserved_quantity, variant.sold_quantity) == (0, 0)
    else:
        assert response.json()["code"] == "order_not_cancellable"


def test_customer_cancel_consumes_the_domain_policy(
    client, db_session, mock_user_auth, monkeypatch
):
    # A policy edit must reach the service without changing a second copy.
    monkeypatch.setitem(
        domain.CUSTOMER_CANCELLABLE, OrderPaymentMethod.COD, {OrderStatus.PENDING}
    )
    order, _ = setup_test_order(db_session)
    order.user_id = mock_user_auth.id
    order.payment_method = "cod"
    db_session.commit()
    response = client.post(f"/api/v1/orders/{order.id}/cancel")
    assert response.status_code == 200, response.json()
