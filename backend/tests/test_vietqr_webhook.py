from app.features.orders.model import Order, OrderItem, Payment
from tests.factories import make_product

SECRET = "test-webhook-secret-32-chars-long-abc"
WEBHOOK_URL = "/api/v1/orders/vietqr-webhook"


def setup_test_order(db_session, total_amount=100.0, status="pending", reserved=1):
    product = make_product(
        db_session,
        name="Webhook Product",
        price=total_amount,
        stock_quantity=10,
        reserved_quantity=reserved,
        sold_quantity=0,
    )
    db_session.commit()
    db_session.refresh(product)

    order = Order(
        product_id=None,
        product_name=None,
        unit_price=None,
        quantity=None,
        total_amount=total_amount,
        currency="VND",
        status=status,
        customer_name="Buyer",
        customer_phone="0123456789",
        shipping_address="Hanoi",
        payment_method="vietqr",
    )
    db_session.add(order)
    db_session.flush()

    variant = product.variants[0]
    item = OrderItem(
        order_id=order.id,
        product_id=product.id,
        product_name=product.name,
        unit_price=total_amount,
        quantity=1,
        subtotal=total_amount,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
    )
    db_session.add(item)
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


def test_webhook_expired_or_cancelled_order_records_late_payment(client, db_session):
    order, product = setup_test_order(
        db_session, total_amount=200.0, status="expired", reserved=0
    )
    payload = {
        "transaction_id": "TXN_LATE_1",
        "amount": 200.0,
        "content": f"TRUELOOK_{order.id}",
    }

    res1 = client.post(
        WEBHOOK_URL,
        json=payload,
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "late_payment"

    db_session.refresh(order)
    db_session.refresh(product)
    # Order status and inventory are untouched
    assert order.status == "expired"
    assert product.stock_quantity == 10
    assert product.reserved_quantity == 0
    assert product.sold_quantity == 0

    payment = (
        db_session.query(Payment)
        .filter(Payment.provider_transaction_id == "TXN_LATE_1")
        .one()
    )
    assert payment.status == "late_payment"
    assert payment.amount == 200.0

    # Idempotent retry: same transaction id returns already_processed
    res2 = client.post(
        WEBHOOK_URL,
        json=payload,
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "already_processed"


def test_get_late_payments_admin_endpoint(client, db_session, mock_admin_auth):
    order, _ = setup_test_order(
        db_session, total_amount=300.0, status="expired", reserved=0
    )
    payload = {
        "transaction_id": "TXN_LATE_ADMIN_1",
        "amount": 300.0,
        "content": f"TRUELOOK_{order.id}",
    }
    client.post(
        WEBHOOK_URL,
        json=payload,
        headers={"X-Webhook-Secret": SECRET},
    )

    # Admin access
    res = client.get("/api/v1/orders/late-payments")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert data["total"] >= 1
    item = next(
        p for p in data["items"] if p["provider_transaction_id"] == "TXN_LATE_ADMIN_1"
    )
    assert item["status"] == "late_payment"
    assert item["order_id"] == order.id
    assert item["customer_name"] == order.customer_name
