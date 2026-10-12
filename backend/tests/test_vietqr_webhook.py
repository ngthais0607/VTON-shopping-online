import pytest
from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.model import Order, Payment
from app.features.products.model import Product

SECRET = "test-webhook-secret-32-chars-long-abc"
WEBHOOK_URL = "/api/v1/orders/vietqr-webhook"


def setup_test_order(db_session, total_amount=100.0, status="pending", reserved=1):
    product = Product(
        name="Webhook Product",
        price=total_amount,
        stock_quantity=10,
        reserved_quantity=reserved,
        sold_quantity=0,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    order = Order(
        product_id=product.id,
        product_name=product.name,
        unit_price=total_amount,
        quantity=1,
        total_amount=total_amount,
        status=status,
        customer_name="Buyer",
        customer_phone="0123456789",
        shipping_address="Hanoi",
        payment_method="vietqr",
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order, product


def test_webhook_rejects_missing_or_invalid_secret(client, db_session):
    order, _ = setup_test_order(db_session)
    payload = {
        "transaction_id": "TXN_001",
        "amount": 100.0,
        "content": f"TRUELOOK_{order.id}",
    }

    # Missing secret
    res1 = client.post(WEBHOOK_URL, json=payload)
    assert res1.status_code == 401
    assert res1.json()["code"] == "unauthorized_webhook"

    # Invalid secret
    res2 = client.post(
        WEBHOOK_URL,
        json=payload,
        headers={"X-Webhook-Secret": "wrong-secret"},
    )
    assert res2.status_code == 401
    assert res2.json()["code"] == "unauthorized_webhook"


def test_webhook_rejects_invalid_memo_pattern(client, db_session):
    order, _ = setup_test_order(db_session)
    payload = {
        "transaction_id": "TXN_002",
        "amount": 100.0,
        "content": "random transfer text 12345",
    }
    res = client.post(
        WEBHOOK_URL,
        json=payload,
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res.status_code == 400
    assert res.json()["code"] == "invalid_webhook_memo"


def test_webhook_rejects_amount_mismatch(client, db_session):
    order, _ = setup_test_order(db_session, total_amount=250.0)
    payload = {
        "transaction_id": "TXN_003",
        "amount": 200.0,  # Mismatched amount
        "content": f"TRUELOOK_{order.id}",
    }
    res = client.post(
        WEBHOOK_URL,
        json=payload,
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res.status_code == 400
    assert res.json()["code"] == "amount_mismatch"

    db_session.refresh(order)
    assert order.status == "pending"


def test_webhook_success_marks_order_paid_and_idempotent(client, db_session):
    order, product = setup_test_order(db_session, total_amount=150.0, reserved=1)
    payload = {
        "transaction_id": "TXN_SUCCESS_1",
        "amount": 150.0,
        "content": f"TRUELOOK_{order.id}",
    }

    # First call: processes successfully
    res1 = client.post(
        WEBHOOK_URL,
        json=payload,
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "success"

    db_session.refresh(order)
    db_session.refresh(product)
    assert order.status == "paid"
    assert product.reserved_quantity == 0
    assert product.sold_quantity == 1

    payment = (
        db_session.query(Payment)
        .filter(Payment.provider_transaction_id == "TXN_SUCCESS_1")
        .one()
    )
    assert payment.status == "paid"
    assert payment.amount == 150.0

    # Duplicate call: idempotent, does not process again or double-decrement stock
    res2 = client.post(
        WEBHOOK_URL,
        json=payload,
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "already_processed"

    db_session.refresh(product)
    assert product.reserved_quantity == 0
    assert product.sold_quantity == 1
