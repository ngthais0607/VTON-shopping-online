import pytest

from app.features.orders.constants import OrderPaymentMethod, OrderStatus
from app.features.orders.domain import apply_order_transition
from app.features.orders.model import Order, OrderItem
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant


def test_checkout_rejects_payload_with_only_product_id(client, mock_user_auth):
    payload = {
        "items": [{"product_id": 123, "quantity": 1}],
        "customer_name": "Nguyen Van A",
        "customer_phone": "0912345678",
        "shipping_address": "123 Le Loi, Q1, HCMC",
        "payment_method": "vietqr",
    }
    response = client.post("/api/v1/orders/checkout-cart", json=payload)
    assert response.status_code == 422


def test_checkout_multi_variant_allocates_exact_variant(
    client, db_session, mock_user_auth
):
    product = Product(
        name="Multi Size Jacket",
        slug="multi-size-jacket",
        price=500000.0,
        currency="VND",
        is_active=True,
    )
    db_session.add(product)
    db_session.flush()

    v_xl = ProductVariant(
        product_id=product.id,
        sku="JACKET-XL",
        size="XL",
        color_name="Black",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    v_s = ProductVariant(
        product_id=product.id,
        sku="JACKET-S",
        size="S",
        color_name="Black",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    v_m = ProductVariant(
        product_id=product.id,
        sku="JACKET-M",
        size="M",
        color_name="Black",
        stock_quantity=10,
        reserved_quantity=0,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add_all([v_xl, v_s, v_m])
    db_session.commit()

    # Checkout explicitly variant M
    payload = {
        "items": [{"variant_id": v_m.id, "quantity": 2}],
        "customer_name": "Tran Van B",
        "customer_phone": "0987654321",
        "shipping_address": "456 Nguyen Hue, Q1, HCMC",
        "payment_method": "vietqr",
    }
    response = client.post("/api/v1/orders/checkout-cart", json=payload)
    assert response.status_code == 201
    data = response.json()
    order_id = data["orders"][0]["id"]

    db_session.refresh(v_xl)
    db_session.refresh(v_s)
    db_session.refresh(v_m)

    # XL and S must remain untouched
    assert v_xl.reserved_quantity == 0
    assert v_s.reserved_quantity == 0
    # M must have reserved_quantity = 2
    assert v_m.reserved_quantity == 2

    order = db_session.get(Order, order_id)
    assert len(order.items) == 1
    item = order.items[0]
    assert item.variant_id == v_m.id
    assert item.sku == "JACKET-M"
    assert item.size == "M"
    assert item.quantity == 2


def test_apply_order_transition_raises_when_item_lacks_variant():
    order = Order(
        id=999,
        public_code="ord-test-no-var",
        user_id=1,
        customer_name="Test",
        customer_phone="123",
        shipping_address="Street",
        payment_method=OrderPaymentMethod.VIETQR.value,
        total_amount=100.0,
        currency="VND",
        status=OrderStatus.PENDING.value,
    )
    item = OrderItem(
        id=999,
        order_id=999,
        product_id=1,
        product_name="Test",
        unit_price=100.0,
        quantity=1,
        subtotal=100.0,
        variant_id=None,
    )
    item.variant = None
    order.items = [item]

    with pytest.raises(RuntimeError, match="missing variant"):
        apply_order_transition(order, OrderStatus.PAID)
