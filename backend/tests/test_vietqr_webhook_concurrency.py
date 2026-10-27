from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.features.orders.model import Order, OrderItem
from app.features.orders.schemas import VietQRWebhookPayload
from app.features.orders.service import process_vietqr_webhook
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant


def test_vietqr_concurrent_webhook_does_not_double_count_sold(db_session: Session):
    settings = get_settings()
    secret = settings.vietqr_webhook_secret

    # Setup product, variant, and pending order
    prod = Product(
        name="Shoes",
        slug="shoes-webhook-test",
        price=Decimal("500000.00"),
        currency="VND",
        is_active=True,
    )
    db_session.add(prod)
    db_session.flush()

    variant = ProductVariant(
        product_id=prod.id,
        sku="SHOES-42-WH",
        color_name="Black",
        size="42",
        stock_quantity=10,
        reserved_quantity=2,
        sold_quantity=0,
        is_active=True,
    )
    db_session.add(variant)
    db_session.flush()

    order = Order(
        user_id=None,
        customer_name="Buyer",
        customer_phone="0912345678",
        shipping_address="123 Street",
        total_amount=Decimal("1000000.00"),
        currency="VND",
        status="pending",
        payment_method="vietqr",
    )
    db_session.add(order)
    db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=prod.id,
        variant_id=variant.id,
        sku=variant.sku,
        size=variant.size,
        color_name=variant.color_name,
        product_name=prod.name,
        quantity=2,
        unit_price=Decimal("500000.00"),
        subtotal=Decimal("1000000.00"),
    )
    db_session.add(item)
    db_session.commit()

    order_id = order.id

    payload1 = VietQRWebhookPayload(
        transaction_id="TXN_CONCURRENT_1",
        amount=1000000.0,
        content=f"TRUELOOK_{order_id}",
    )
    payload2 = VietQRWebhookPayload(
        transaction_id="TXN_CONCURRENT_2",
        amount=1000000.0,
        content=f"TRUELOOK_{order_id}",
    )

    # Process first webhook
    res1 = process_vietqr_webhook(db_session, payload1, secret)
    assert res1.status == "success"

    # Process second webhook with different txn_id for already-paid order
    res2 = process_vietqr_webhook(db_session, payload2, secret)
    assert res2.status in ("already_processed", "duplicate_payment")

    db_session.refresh(variant)
    db_session.refresh(order)

    # Sold quantity should be exactly 2 (not 4), reserved should be 0 (not -2)
    assert variant.sold_quantity == 2
    assert variant.reserved_quantity == 0
    assert order.status == "paid"
