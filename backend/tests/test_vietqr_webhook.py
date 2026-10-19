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


def test_webhook_records_amount_mismatch_and_retry(client, db_session):
    from decimal import Decimal

    order, product = setup_test_order(db_session, total_amount=250.0)
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
    assert res.status_code == 200
    assert res.json()["status"] == "amount_mismatch"

    payment = (
        db_session.query(Payment).filter_by(provider_transaction_id="TXN_003").one()
    )
    assert payment.status == "amount_mismatch"
    assert payment.amount == Decimal("200.00")
    retry = client.post(
        WEBHOOK_URL,
        json={**payload, "amount": 201.0},
        headers={"X-Webhook-Secret": SECRET},
    )
    assert retry.status_code == 200
    assert (
        db_session.query(Payment).filter_by(provider_transaction_id="TXN_003").count()
        == 1
    )
    db_session.refresh(payment)
    assert payment.amount == Decimal("200.00")

    db_session.refresh(order)
    assert order.status == "pending"
    db_session.refresh(product.variants[0])
    assert product.variants[0].reserved_quantity == 1
    assert product.variants[0].sold_quantity == 0
    correct = client.post(
        WEBHOOK_URL,
        json={**payload, "transaction_id": "TXN_CORRECT", "amount": 250.0},
        headers={"X-Webhook-Secret": SECRET},
    )
    assert correct.status_code == 200
    db_session.refresh(order)
    assert order.status == "paid"


def test_amount_mismatch_is_visible_to_admin(client, db_session, mock_admin_auth):
    order, _ = setup_test_order(db_session)
    client.post(
        WEBHOOK_URL,
        json={
            "transaction_id": "MISMATCH_ADMIN",
            "amount": 1,
            "content": f"TL{order.id}",
        },
        headers={"X-Webhook-Secret": SECRET},
    )
    result = client.get("/api/v1/orders/late-payments")
    assert result.status_code == 200
    assert any(row["status"] == "amount_mismatch" for row in result.json()["items"])


def test_webhook_rejects_unrepresentable_amounts(client):
    for amount in ("NaN", "Infinity", "10000000000.00", "1.001"):
        result = client.post(
            WEBHOOK_URL,
            json={"transaction_id": "INVALID", "amount": amount, "content": "TL1"},
            headers={"X-Webhook-Secret": SECRET},
        )
        assert result.status_code == 422


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


def test_webhook_rejects_multi_order_memo(client, db_session):
    order1, _ = setup_test_order(db_session, total_amount=100.0)
    order2, _ = setup_test_order(db_session, total_amount=100.0)

    # Multi-order memo TRUELOOK_1_2 is rejected
    payload = {
        "transaction_id": "TXN_MULTI_1",
        "amount": 200.0,
        "content": f"TRUELOOK_{order1.id}_{order2.id}",
    }
    res = client.post(
        WEBHOOK_URL,
        json=payload,
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res.status_code == 400
    assert res.json()["code"] == "unsupported_multi_order_payment"

    # Repeated order ID TRUELOOK_1_1 normalizes to single order and succeeds
    payload_repeat = {
        "transaction_id": "TXN_REPEAT_1",
        "amount": 100.0,
        "content": f"TRUELOOK_{order1.id}_{order1.id}",
    }
    res_repeat = client.post(
        WEBHOOK_URL,
        json=payload_repeat,
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res_repeat.status_code == 200
    assert res_repeat.json()["status"] == "success"


def test_webhook_rejects_transaction_order_mismatch(client, db_session):
    order1, _ = setup_test_order(db_session, total_amount=100.0)
    order2, _ = setup_test_order(db_session, total_amount=100.0)

    # First order succeeds
    res1 = client.post(
        WEBHOOK_URL,
        json={
            "transaction_id": "TXN_SHARED_1",
            "amount": 100.0,
            "content": f"TRUELOOK_{order1.id}",
        },
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res1.status_code == 200

    # Reusing same transaction for order 2 raises transaction_order_mismatch
    res2 = client.post(
        WEBHOOK_URL,
        json={
            "transaction_id": "TXN_SHARED_1",
            "amount": 100.0,
            "content": f"TRUELOOK_{order2.id}",
        },
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res2.status_code == 400
    assert res2.json()["code"] == "transaction_order_mismatch"


def test_webhook_rejects_confirmed_and_unsupported_status(client, db_session):
    order, _ = setup_test_order(
        db_session, total_amount=100.0, status="confirmed", reserved=1
    )
    res = client.post(
        WEBHOOK_URL,
        json={
            "transaction_id": "TXN_CONFIRMED_1",
            "amount": 100.0,
            "content": f"TRUELOOK_{order.id}",
        },
        headers={"X-Webhook-Secret": SECRET},
    )
    assert res.status_code == 400
    assert res.json()["code"] == "invalid_payment_order_status"

    # Verify no payment was added
    payments = db_session.query(Payment).filter(Payment.order_id == order.id).all()
    assert len(payments) == 0


def test_is_payment_transaction_uniqueness_error():
    from sqlalchemy.exc import IntegrityError

    from app.features.orders.service import _is_payment_transaction_uniqueness_error

    # MariaDB / MySQL named constraint error
    mariadb_err = IntegrityError(
        "INSERT INTO payments ...",
        {},
        Exception(
            "1062 (23000): Duplicate entry 'vietqr-TXN123' for key 'uq_payments_provider_trans_id'"
        ),
    )
    assert _is_payment_transaction_uniqueness_error(mariadb_err) is True

    # SQLite unique constraint error
    sqlite_err = IntegrityError(
        "INSERT INTO payments ...",
        {},
        Exception(
            "UNIQUE constraint failed: payments.provider, payments.provider_transaction_id"
        ),
    )
    assert _is_payment_transaction_uniqueness_error(sqlite_err) is True

    # Unrelated constraint (e.g. check constraint or foreign key)
    unrelated_err = IntegrityError(
        "INSERT INTO orders ...",
        {},
        Exception("CHECK constraint failed: total_amount >= 0"),
    )
    assert _is_payment_transaction_uniqueness_error(unrelated_err) is False
