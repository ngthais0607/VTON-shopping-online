import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.features.orders.model import Order
from app.features.products.model import Product, ProductReview
from app.features.products.reviews import create_product_review
from app.features.products.schemas import ReviewCreate
from app.features.products.variant_model import ProductVariant
from app.features.users.model import User

pytestmark = pytest.mark.integration


def test_review_migration_dedupe_and_unique_constraint():
    db_url = os.environ.get("TEST_DATABASE_URL")
    if not db_url:
        pytest.skip("TEST_DATABASE_URL is required for migration roundtrip test")

    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    ini_path = os.path.join(backend_dir, "alembic.ini")
    alembic_cfg = Config(ini_path)
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)

    engine = create_engine(db_url)
    session_factory = sessionmaker(bind=engine)

    # 1. Downgrade to c3d4e5f6a7b8 (before unique review constraint)
    command.downgrade(alembic_cfg, "c3d4e5f6a7b8")

    session = session_factory()
    suffix = uuid4().hex[:8]

    # Insert user and product
    u = User(
        username=f"rev_user_{suffix}",
        email=f"rev_{suffix}@example.com",
        password_hash="pw",
        role="customer",
    )
    p = Product(
        name=f"Review Test Prod {suffix}",
        slug=f"rev-prod-{suffix}",
        price=100.0,
        currency="VND",
    )
    session.add_all([u, p])
    session.flush()

    now = datetime.now(timezone.utc)
    old_dt = now - timedelta(days=2)
    new_dt = now - timedelta(days=1)

    # Insert 3 duplicate reviews directly using raw SQL
    conn = session.connection()
    conn.execute(
        text(
            "INSERT INTO product_reviews (user_id, product_id, rating, title, comment, is_verified_purchase, created_at) "
            "VALUES (:uid, :pid, 2, 'Old Review 1', 'Oldest', 1, :dt1)"
        ),
        {"uid": u.id, "pid": p.id, "dt1": old_dt},
    )
    conn.execute(
        text(
            "INSERT INTO product_reviews (user_id, product_id, rating, title, comment, is_verified_purchase, created_at) "
            "VALUES (:uid, :pid, 4, 'Newer Review 2', 'Newer', 1, :dt2)"
        ),
        {"uid": u.id, "pid": p.id, "dt2": new_dt},
    )
    conn.execute(
        text(
            "INSERT INTO product_reviews (user_id, product_id, rating, title, comment, is_verified_purchase, created_at) "
            "VALUES (:uid, :pid, 5, 'Tie-break Review 3', 'Same date higher ID', 1, :dt2)"
        ),
        {"uid": u.id, "pid": p.id, "dt2": new_dt},
    )
    user_id, product_id = u.id, p.id
    session.commit()
    session.close()

    # 2. Upgrade to d4e5f6a7b8c9: dedupes and adds unique constraint
    command.upgrade(alembic_cfg, "d4e5f6a7b8c9")

    # 3. Verify exactly 1 review remains and it is the newest/highest id
    session = session_factory()
    surviving = (
        session.query(ProductReview)
        .filter(
            ProductReview.user_id == user_id, ProductReview.product_id == product_id
        )
        .all()
    )
    assert len(surviving) == 1
    assert surviving[0].rating == 5
    assert surviving[0].title == "Tie-break Review 3"
    session.close()

    # 4. Downgrade drops constraint without restoring deleted duplicates
    command.downgrade(alembic_cfg, "c3d4e5f6a7b8")
    session = session_factory()
    after_downgrade = (
        session.query(ProductReview)
        .filter(
            ProductReview.user_id == user_id, ProductReview.product_id == product_id
        )
        .all()
    )
    assert len(after_downgrade) == 1
    session.close()

    # Restore head for subsequent test isolation
    command.upgrade(alembic_cfg, "head")
    engine.dispose()


def test_concurrent_review_first_submission_upsert():
    db_url = os.environ.get("TEST_DATABASE_URL")
    if not db_url:
        pytest.skip("TEST_DATABASE_URL is required for concurrency test")

    engine = create_engine(db_url, pool_pre_ping=True)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    setup_session = session_factory()
    suffix = uuid4().hex[:8]
    user = User(
        username=f"race_rev_{suffix}",
        email=f"race_rev_{suffix}@example.com",
        password_hash="pw",
        role="customer",
    )
    product = Product(
        name=f"Race Prod {suffix}",
        slug=f"race-prod-{suffix}",
        price=200.0,
        currency="VND",
    )
    setup_session.add_all([user, product])
    setup_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"RACE-{suffix}",
        size="ONE_SIZE",
        color_name="Default",
        stock_quantity=10,
        price=200.0,
        is_active=True,
    )
    order = Order(
        user_id=user.id,
        product_id=product.id,
        product_name=product.name,
        quantity=1,
        unit_price=200.0,
        total_amount=200.0,
        status="paid",
        payment_method="vietqr",
        customer_name="Race User",
        customer_phone="0912345678",
        shipping_address="123 Race St",
    )
    setup_session.add_all([variant, order])
    setup_session.commit()
    user_id = user.id
    product_id = product.id
    setup_session.close()

    barrier = Barrier(2)

    def submit_review(rating: int, title: str):
        session = session_factory()
        try:
            barrier.wait()
            review = create_product_review(
                session,
                product_id,
                user_id,
                ReviewCreate(rating=rating, title=title, comment="Concurrent submit"),
            )
            return "ok", review.rating
        except Exception as e:
            return "error", str(e)
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(submit_review, 4, "Concurrent 4")
        f2 = executor.submit(submit_review, 5, "Concurrent 5")
        res1 = f1.result()
        res2 = f2.result()

    assert res1[0] == "ok"
    assert res2[0] == "ok"

    # Exactly 1 review in database
    verify_session = session_factory()
    reviews = (
        verify_session.query(ProductReview)
        .filter(
            ProductReview.user_id == user_id, ProductReview.product_id == product_id
        )
        .all()
    )
    assert len(reviews) == 1
    verify_session.close()
