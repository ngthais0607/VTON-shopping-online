from datetime import datetime, timezone

import pytest
from sqlalchemy import event, inspect

from app.core.errors import ConflictError
from app.features.dashboard.service import get_metrics
from app.features.orders.model import Order, Payment
from app.features.products import reviews, service
from app.features.products.model import Product, ProductReview
from app.features.products.schemas import ProductCreate, ProductFilters, StockStatus
from app.features.users.model import User
from tests.factories import make_product, make_variant


def test_revenue_retains_paid_fulfilled_orders_and_excludes_cancelled(db_session):
    for status, paid_at, payment_paid in [
        ("paid", None, False),
        ("shipped", datetime.now(timezone.utc), False),
        ("delivered", None, True),
        ("cancelled", datetime.now(timezone.utc), True),
        ("expired", datetime.now(timezone.utc), True),
        ("shipped", None, False),
    ]:
        order = Order(
            status=status,
            paid_at=paid_at,
            total_amount=100,
            customer_name="Test",
            customer_phone="123",
            shipping_address="Test",
            payment_method="vietqr",
        )
        if payment_paid:
            order.payments = [Payment(amount=100, status="paid")]
        db_session.add(order)
    db_session.flush()
    assert get_metrics(db_session, use_cache=False).revenue == 300


@pytest.mark.parametrize(
    "stock_status", [None, StockStatus.IN_STOCK, StockStatus.LOW_STOCK]
)
def test_filters_require_one_matching_variant(db_session, stock_status):
    product = make_product(db_session, auto_create_variant=False)
    make_variant(
        db_session, product_id=product.id, size="S", color_name="Red", stock_quantity=1
    )
    make_variant(
        db_session, product_id=product.id, size="M", color_name="Blue", stock_quantity=1
    )
    page = service.list_products(
        db_session,
        ProductFilters(size=["S"], color=["Blue"], stock_status=stock_status),
    )
    assert page.total == 0


@pytest.mark.parametrize(
    "stock_status, expected",
    [
        (StockStatus.IN_STOCK, 0),
        (StockStatus.LOW_STOCK, 0),
        (StockStatus.OUT_OF_STOCK, 1),
    ],
)
def test_stock_filter_applies_to_selected_variant(db_session, stock_status, expected):
    product = make_product(db_session, auto_create_variant=False)
    make_variant(
        db_session,
        product_id=product.id,
        size="S",
        color_name="Blue",
        stock_quantity=2,
        reserved_quantity=1,
        sold_quantity=1,
    )
    make_variant(
        db_session, product_id=product.id, size="M", color_name="Blue", stock_quantity=1
    )
    page = service.list_products(
        db_session,
        ProductFilters(size=["S"], color=["Blue"], stock_status=stock_status),
    )
    assert page.total == expected


def test_duplicate_sku_rolls_back_product_and_preserves_session(db_session):
    product = make_product(db_session)
    sku = product.variants[0].sku
    db_session.commit()
    command = ProductCreate(
        name="Duplicate SKU",
        price=10,
        variants=[{"size": "S", "color_name": "Blue", "sku": sku}],
    )
    with pytest.raises(ConflictError):
        service.create_product(db_session, command)
    assert db_session.query(Product).filter_by(name="Duplicate SKU").count() == 0
    assert db_session.query(Product).count() == 1


def test_catalog_ratings_and_review_pagination_do_not_load_all_reviews(db_session):
    product = make_product(db_session)
    product_id = product.id
    for index, (rating, feedback) in enumerate(
        [(5, "small"), (4, "true_to_size"), (3, "large"), (2, None)]
    ):
        user = User(
            username=f"reviewer{index}",
            email=f"reviewer{index}@test.com",
            password_hash="hash",
        )
        db_session.add(user)
        db_session.flush()
        db_session.add(
            ProductReview(
                product_id=product_id,
                user_id=user.id,
                rating=rating,
                fit_feedback=feedback,
            )
        )
    db_session.commit()
    db_session.expunge_all()
    statements = []

    def capture(_conn, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        catalog_product = service.list_products(db_session, ProductFilters()).items[0]
        assert catalog_product.rating_avg == 3.5
        assert catalog_product.review_count == 4
        assert "reviews" in inspect(catalog_product).unloaded
        page = reviews.list_product_reviews(db_session, product_id, limit=1, offset=1)
        assert page.total == 4
        assert page.summary.average_rating == 3.5
        assert page.summary.fit_feedback.total_responses == 3
        assert page.summary.fit_feedback.small == 33.3
        assert page.items == page.reviews
        assert len(page.items) == 1
        assert page.items[0].rating == 3
        entity_queries = [
            statement
            for statement in statements
            if "product_reviews.id AS" in statement
        ]
        assert len(entity_queries) == 1
        assert "LIMIT" in entity_queries[0].upper()
    finally:
        event.remove(connection, "before_cursor_execute", capture)
