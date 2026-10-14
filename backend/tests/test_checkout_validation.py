import pytest
from pydantic import ValidationError

from app.features.orders.schemas import CheckoutCommand
from tests.factories import make_product


def test_checkout_command_normalization_and_trimming():
    command = CheckoutCommand(
        items=[{"variant_id": 1, "quantity": 1}],
        customer_name=" Nguyen Van B ",
        customer_phone=" +84 912.345-678 ",
        shipping_address=" 123 Duong Le Loi, Quan 1 ",
        payment_method="cod",
    )
    assert command.customer_name == "Nguyen Van B"
    assert command.customer_phone == "0912345678"
    assert command.shipping_address == "123 Duong Le Loi, Quan 1"


@pytest.mark.parametrize(
    "raw_phone,expected",
    [
        ("0912-345-678", "0912345678"),
        ("0912.345.678", "0912345678"),
        ("0912 345 678", "0912345678"),
        ("+84 912 345 678", "0912345678"),
        ("+84912345678", "0912345678"),
        ("0323456789", "0323456789"),
        ("0523456789", "0523456789"),
        ("0723456789", "0723456789"),
        ("0823456789", "0823456789"),
    ],
)
def test_checkout_command_phone_formats_accepted(raw_phone, expected):
    command = CheckoutCommand(
        items=[{"variant_id": 1, "quantity": 1}],
        customer_name="Nguyen Van B",
        customer_phone=raw_phone,
        shipping_address="123 Duong Le Loi, Quan 1",
    )
    assert command.customer_phone == expected


@pytest.mark.parametrize(
    "invalid_phone",
    [
        "0123456789",  # obsolete 11-digit prefix 01
        "091234567",  # 9 digits
        "091234567890",  # 12 digits
        "091234567a",  # contains letter
        "+83912345678",  # wrong country code
        "letters_only",
        "",
        "   ",
    ],
)
def test_checkout_command_rejects_invalid_phone(invalid_phone):
    with pytest.raises(ValidationError):
        CheckoutCommand(
            items=[{"variant_id": 1, "quantity": 1}],
            customer_name="Valid Name",
            customer_phone=invalid_phone,
            shipping_address="123 Duong Le Loi, Quan 1",
        )


@pytest.mark.parametrize(
    "invalid_name",
    [
        "",
        " ",
        "A",  # less than 2 chars
        "   X   ",
        "A" * 101,  # more than 100 chars
    ],
)
def test_checkout_command_rejects_invalid_name(invalid_name):
    with pytest.raises(ValidationError):
        CheckoutCommand(
            items=[{"variant_id": 1, "quantity": 1}],
            customer_name=invalid_name,
            customer_phone="0912345678",
            shipping_address="123 Duong Le Loi, Quan 1",
        )


@pytest.mark.parametrize(
    "invalid_address",
    [
        "",
        " ",
        "Hanoi",  # less than 10 chars
        " 123 St ",
        "A" * 1001,  # more than 1000 chars
    ],
)
def test_checkout_command_rejects_invalid_address(invalid_address):
    with pytest.raises(ValidationError):
        CheckoutCommand(
            items=[{"variant_id": 1, "quantity": 1}],
            customer_name="Valid Name",
            customer_phone="0912345678",
            shipping_address=invalid_address,
        )


def test_checkout_api_validates_and_normalizes_inputs(
    client, db_session, mock_user_auth
):
    product = make_product(
        db_session, name="Checkout Validation Item", price=100.0, stock_quantity=10
    )
    db_session.commit()

    # 1. Successful checkout with raw unnormalized inputs
    resp = client.post(
        "/api/v1/orders/checkout-cart",
        json={
            "items": [{"variant_id": product.variants[0].id, "quantity": 1}],
            "customer_name": "  Nguyen Van B  ",
            "customer_phone": " +84 912.345-678 ",
            "shipping_address": "  123 Duong Le Loi, Quan 1, TP HCM  ",
            "payment_method": "cod",
        },
    )
    assert resp.status_code == 201
    order_data = resp.json()["orders"][0]
    assert order_data["customer_name"] == "Nguyen Van B"
    assert order_data["customer_phone"] == "0912345678"
    assert order_data["shipping_address"] == "123 Duong Le Loi, Quan 1, TP HCM"

    # 2. Reject short name
    bad_name = client.post(
        "/api/v1/orders/checkout-cart",
        json={
            "items": [{"variant_id": product.variants[0].id, "quantity": 1}],
            "customer_name": "X",
            "customer_phone": "0912345678",
            "shipping_address": "123 Duong Le Loi, Quan 1, TP HCM",
        },
    )
    assert bad_name.status_code == 422

    # 3. Reject invalid phone
    bad_phone = client.post(
        "/api/v1/orders/checkout-cart",
        json={
            "items": [{"variant_id": product.variants[0].id, "quantity": 1}],
            "customer_name": "Nguyen Van B",
            "customer_phone": "0123456789",
            "shipping_address": "123 Duong Le Loi, Quan 1, TP HCM",
        },
    )
    assert bad_phone.status_code == 422

    # 4. Reject short address
    bad_address = client.post(
        "/api/v1/orders/checkout-cart",
        json={
            "items": [{"variant_id": product.variants[0].id, "quantity": 1}],
            "customer_name": "Nguyen Van B",
            "customer_phone": "0912345678",
            "shipping_address": "Short",
        },
    )
    assert bad_address.status_code == 422
