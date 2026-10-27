import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import event, update

from app.features.orders.model import Order, OrderItem, Payment
from app.features.products.model import Product
from app.features.products.variant_model import ProductVariant


def _product(name, *, stock=30, reserved=0, sold=0, active=True, deleted=False):
    prod = Product(
        name=name,
        slug=f"p-{uuid.uuid4().hex[:8]}",
        price=10,
        is_active=active,
        is_deleted=deleted,
    )
    variant = ProductVariant(
        sku=f"SKU-{uuid.uuid4().hex[:8]}",
        size="ONE_SIZE",
        color_name="Default",
        price=10,
        stock_quantity=stock,
        reserved_quantity=reserved,
        sold_quantity=sold,
        is_active=True,
    )
    prod.variants = [variant]
    return prod


def _order(product, status, amount, created_at):
    return Order(
        product=product,
        product_name=product.name,
        unit_price=amount,
        quantity=1,
        total_amount=amount,
        currency="USD",
        status=status,
        payment_method="vietqr",
        customer_name="Customer",
        customer_phone="123",
        shipping_address="Address",
        created_at=created_at,
    )


def _capture_selects(db_session, call):
    statements = []

    def record(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", record)
    try:
        result = call()
    finally:
        event.remove(connection, "before_cursor_execute", record)
    return result, statements


def _count_selects(db_session, call):
    result, statements = _capture_selects(db_session, call)
    return result, len(statements)


def test_dashboard_routes_are_versioned_and_return_typed_shapes(
    client, mock_admin_auth
):
    for path, expected in (
        (
            "metrics",
            {
                "total_products": 0,
                "active_products": 0,
                "low_stock": 0,
                "pending_orders": 0,
                "revenue": 0,
            },
        ),
        ("recent-orders", []),
        ("low-stock-products", []),
    ):
        response = client.get(f"/api/v1/dashboard/{path}")
        assert response.status_code == 200
        assert response.json() == expected
        assert client.get(f"/dashboard/{path}").status_code == 404


def test_dashboard_metrics_count_visible_available_stock_and_paid_revenue(db_session):
    from app.features.dashboard.service import get_metrics

    visible_low = _product("Reserved low", stock=25, reserved=6)
    sold_low = _product("Sold low", stock=20, sold=2, active=False)
    zero = _product("Sold out", stock=0)
    high = _product("At threshold", stock=20)
    deleted_low = _product("Deleted", stock=1, deleted=True)
    db_session.add_all([visible_low, sold_low, zero, high, deleted_low])
    db_session.flush()
    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            _order(high, "pending", 11, now),
            _order(high, "confirmed", 13, now),
            _order(high, "paid", 17, now),
            _order(high, "paid", 19, now),
            _order(high, "cancelled", 23, now),
            _order(high, "expired", 29, now),
        ]
    )
    db_session.flush()

    metrics, query_count = _count_selects(db_session, lambda: get_metrics(db_session))

    assert metrics.model_dump() == {
        "total_products": 4,
        "active_products": 3,
        "low_stock": 3,
        "pending_orders": 1,
        "revenue": 36,
    }
    assert query_count <= 2


def test_recent_orders_are_bounded_newest_first_and_have_payment_status(db_session):
    from app.features.dashboard.service import get_recent_orders

    product = _product("Order product")
    db_session.add(product)
    db_session.flush()
    now = datetime.now(timezone.utc)
    orders = [
        _order(product, "pending", 10 + index, now + timedelta(minutes=index))
        for index in range(25)
    ]
    orders[-1].status = "paid"
    orders[-3].status = "expired"
    orders[-4].status = "paid"
    db_session.add_all(orders)
    db_session.flush()
    db_session.add(Payment(order=orders[-1], amount=34, status="paid"))
    db_session.flush()

    result, query_count = _count_selects(
        db_session, lambda: get_recent_orders(db_session, limit=20)
    )

    assert len(result) == 20
    assert [row.id for row in result] == [order.id for order in reversed(orders[-20:])]
    assert result[0].product_name == "Order product"
    assert result[0].total == 34
    assert result[0].payment_status == "paid"
    assert result[1].payment_status == "pending"
    assert result[2].payment_status == "failed"
    assert result[3].payment_status == "paid"
    assert query_count <= 2


def test_recent_orders_endpoint_allows_legacy_null_created_at(
    client, db_session, mock_admin_auth
):
    product = _product("Legacy product")
    order = _order(product, "pending", 12, datetime.now(timezone.utc))
    db_session.add(order)
    db_session.flush()
    db_session.execute(
        update(Order).where(Order.id == order.id).values(created_at=None)
    )
    db_session.expire_all()

    response = client.get("/api/v1/dashboard/recent-orders")

    assert response.status_code == 200
    assert response.json()[0]["created_at"] is None


def test_recent_orders_support_cart_orders_without_legacy_summary(
    client, db_session, mock_admin_auth
):
    shirt, trousers = _product("Cotton shirt"), _product("Linen trousers")
    db_session.add_all([shirt, trousers])
    db_session.flush()
    order = Order(
        total_amount=30,
        currency="VND",
        status="confirmed",
        payment_method="cod",
        customer_name="Customer",
        customer_phone="123",
        shipping_address="Address",
    )
    for product, quantity in ((shirt, 1), (trousers, 2)):
        variant = product.variants[0]
        order.items.append(
            OrderItem(
                product_id=product.id,
                variant_id=variant.id,
                sku=variant.sku,
                size=variant.size,
                color_name=variant.color_name,
                product_name=product.name,
                unit_price=10,
                quantity=quantity,
                subtotal=10 * quantity,
            )
        )
    db_session.add(order)
    db_session.flush()

    response = client.get("/api/v1/dashboard/recent-orders")

    assert response.status_code == 200
    summary = response.json()[0]
    assert "Cotton shirt" in summary["product_name"]
    assert "Linen trousers" in summary["product_name"]
    assert summary["quantity"] == 3


def test_recent_orders_reads_summary_columns_and_only_latest_payment(db_session):
    from app.features.dashboard.service import get_recent_orders

    product = _product("Many payments")
    order = _order(product, "pending", 45, datetime.now(timezone.utc))
    db_session.add(order)
    db_session.flush()
    db_session.add_all(
        [Payment(order=order, amount=45, status="pending") for _ in range(40)]
    )
    db_session.add(Payment(order=order, amount=45, status="paid"))
    db_session.flush()
    db_session.expunge_all()

    result, statements = _capture_selects(
        db_session, lambda: get_recent_orders(db_session, limit=5)
    )

    assert [(item.id, item.payment_status) for item in result] == [(order.id, "paid")]
    assert len(statements) == 1
    assert "orders.customer_phone" not in statements[0].lower()
    assert "payments.amount" not in statements[0].lower()


def test_low_stock_list_excludes_deleted_and_threshold(db_session):
    from app.features.dashboard.service import get_low_stock_products

    products = [
        _product("Zero", stock=0),
        _product("Reserved", stock=25, reserved=6),
        _product("Sold", stock=20, sold=2),
        _product("Threshold", stock=20),
        _product("Deleted", stock=0, deleted=True),
    ]
    db_session.add_all(products)
    db_session.flush()

    result, query_count = _count_selects(
        db_session, lambda: get_low_stock_products(db_session, limit=20)
    )

    assert [(row.name, row.available_stock) for row in result] == [
        ("Zero", 0),
        ("Sold", 18),
        ("Reserved", 19),
    ]
    assert query_count <= 1
    assert [row.name for row in get_low_stock_products(db_session, limit=2)] == [
        "Zero",
        "Sold",
    ]
