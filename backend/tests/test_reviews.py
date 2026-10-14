from unittest.mock import patch

import pytest

from app.features.orders.model import Order
from app.features.products.model import ProductReview
from app.features.users.model import User
from tests.factories import make_product

REVIEWS_PATH = "/api/v1/products/{product_id}/reviews"


def persist_product(db_session, **overrides):
    defaults = {
        "name": "Review product",
        "price": 99.99,
        "currency": "VND",
        "stock_quantity": 10,
    }
    merged = defaults | overrides
    product = make_product(db_session, **merged)
    db_session.commit()
    db_session.refresh(product)
    return product


def make_order_for_user(
    db_session,
    user_id: int,
    product,
    status: str = "paid",
    payment_method: str = "vietqr",
) -> Order:
    order = Order(
        user_id=user_id,
        product_id=product.id,
        product_name=product.name,
        quantity=1,
        unit_price=product.price,
        total_amount=product.price,
        status=status,
        payment_method=payment_method,
        customer_name="Test Customer",
        customer_phone="0912345678",
        shipping_address="123 Test Street, Hanoi",
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


def test_get_reviews_empty(client, db_session):
    product = persist_product(db_session)

    resp = client.get(REVIEWS_PATH.format(product_id=product.id))

    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["limit"] == 10
    assert data["offset"] == 0
    assert data["summary"] == {
        "average_rating": None,
        "total_reviews": 0,
        "fit_feedback": None,
    }
    # backwards-compatibility fields
    assert data["reviews"] == []
    assert data["total_reviews"] == 0
    assert data["average_rating"] is None
    assert data["fit_feedback"] is None


@pytest.mark.parametrize("rating", [0, 6])
def test_create_review_rejects_rating_outside_one_to_five(
    client,
    mock_user_auth,
    db_session,
    rating,
):
    product = persist_product(db_session)

    response = client.post(
        REVIEWS_PATH.format(product_id=product.id),
        json={"rating": rating},
    )

    assert response.status_code == 422


def test_soft_deleted_product_reviews_use_common_not_found_response(
    client,
    db_session,
):
    product = persist_product(db_session, is_deleted=True)

    response = client.get(REVIEWS_PATH.format(product_id=product.id))

    assert response.status_code == 404
    assert response.json() == {
        "code": "product_not_found",
        "message": f"Product {product.id} was not found",
        "details": None,
    }


def test_create_review_rejects_non_buyer(client, mock_user_auth, db_session):
    product = persist_product(
        db_session,
        name="Unverified Product Test",
        price=49.99,
        stock_quantity=5,
    )

    review_resp = client.post(
        REVIEWS_PATH.format(product_id=product.id),
        json={"rating": 4, "title": "Decent Product", "comment": "Works well overall"},
    )
    assert review_resp.status_code == 403
    assert review_resp.json()["code"] == "review_not_eligible_unpurchased"


def test_create_review_rejects_unpaid_cod_order(client, mock_user_auth, db_session):
    product = persist_product(db_session)
    make_order_for_user(
        db_session,
        mock_user_auth.id,
        product,
        status="confirmed",
        payment_method="cod",
    )

    review_resp = client.post(
        REVIEWS_PATH.format(product_id=product.id),
        json={"rating": 4, "title": "Unpaid COD review"},
    )
    assert review_resp.status_code == 403
    assert review_resp.json()["code"] == "review_not_eligible_unpurchased"


def test_create_review_verified_buyer(client, mock_user_auth, db_session):
    product = persist_product(
        db_session,
        name="Verified Product Test",
        price=199.99,
        stock_quantity=20,
    )

    order_resp = client.post(
        "/api/v1/orders/checkout-cart",
        json={
            "items": [{"variant_id": product.variants[0].id, "quantity": 1}],
            "customer_name": "Verified Buyer",
            "customer_phone": "0912345678",
            "shipping_address": "123 Review Street, Hanoi",
            "payment_method": "vietqr",
        },
    )
    assert order_resp.status_code == 201
    order_id = order_resp.json()["orders"][0]["id"]

    order = db_session.query(Order).filter(Order.id == order_id).first()
    order.status = "paid"
    db_session.commit()

    review_resp = client.post(
        REVIEWS_PATH.format(product_id=product.id),
        json={
            "rating": 5,
            "title": "Must Have!",
            "comment": "Extremely satisfied with this verified purchase.",
        },
    )
    assert review_resp.status_code == 201
    data = review_resp.json()
    assert data["rating"] == 5
    assert data["is_verified_purchase"] is True


def test_create_review_upsert_three_submissions_update_one_row(
    client,
    mock_user_auth,
    db_session,
):
    product = persist_product(db_session)
    make_order_for_user(db_session, mock_user_auth.id, product, status="paid")

    # Submission 1: Initial
    res1 = client.post(
        REVIEWS_PATH.format(product_id=product.id),
        json={
            "rating": 3,
            "title": "Initial Title",
            "comment": "Initial Comment",
            "fit_feedback": "small",
        },
    )
    assert res1.status_code == 201
    data1 = res1.json()
    review_id = data1["id"]

    # Submission 2: Update
    res2 = client.post(
        REVIEWS_PATH.format(product_id=product.id),
        json={
            "rating": 4,
            "title": "Updated Title",
            "comment": "Updated Comment",
            "fit_feedback": "true_to_size",
        },
    )
    assert res2.status_code in {200, 201}
    data2 = res2.json()
    assert data2["id"] == review_id
    assert data2["rating"] == 4
    assert data2["title"] == "Updated Title"
    assert data2["comment"] == "Updated Comment"
    assert data2["fit_feedback"] == "true_to_size"

    # Submission 3: Final
    res3 = client.post(
        REVIEWS_PATH.format(product_id=product.id),
        json={
            "rating": 5,
            "title": "Final Title",
            "comment": "Final Comment",
            "fit_feedback": "large",
        },
    )
    assert res3.status_code in {200, 201}
    data3 = res3.json()
    assert data3["id"] == review_id
    assert data3["rating"] == 5
    assert data3["title"] == "Final Title"
    assert data3["comment"] == "Final Comment"
    assert data3["fit_feedback"] == "large"

    # Verify database has exactly 1 review for this user and product
    rows = (
        db_session.query(ProductReview)
        .filter(
            ProductReview.user_id == mock_user_auth.id,
            ProductReview.product_id == product.id,
        )
        .all()
    )
    assert len(rows) == 1
    assert rows[0].rating == 5
    assert rows[0].title == "Final Title"
    assert rows[0].comment == "Final Comment"
    assert rows[0].fit_feedback == "large"


def test_create_review_service_commits_once(
    db_session,
    mock_user_auth,
):
    from app.features.products.reviews import create_product_review
    from app.features.products.schemas import ReviewCreate

    product = persist_product(db_session)
    make_order_for_user(db_session, mock_user_auth.id, product, status="paid")

    with patch.object(db_session, "commit", wraps=db_session.commit) as commit:
        review = create_product_review(
            db_session,
            product.id,
            mock_user_auth,
            ReviewCreate(rating=3, title="Fine"),
        )

    assert commit.call_count == 1
    assert review.product_id == product.id
    assert review.user_id == mock_user_auth.id
    assert review.is_verified_purchase is True


def test_update_profile_me(client, mock_user_auth):
    update_payload = {
        "username": "updated_testuser",
        "email": "test@example.com",
        "first_name": "John",
        "last_name": "Doe",
    }
    resp = client.patch("/api/v1/users/me", json=update_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["first_name"] == "John"
    assert data["last_name"] == "Doe"


def test_create_review_with_fit_feedback_and_percentage_summary(
    client,
    mock_user_auth,
    db_session,
):
    product = persist_product(db_session, name="Linen Pants")
    make_order_for_user(db_session, mock_user_auth.id, product, status="paid")

    # Review 1: small
    res1 = client.post(
        REVIEWS_PATH.format(product_id=product.id),
        json={"rating": 4, "title": "Runs slightly small", "fit_feedback": "small"},
    )
    assert res1.status_code == 201
    assert res1.json()["fit_feedback"] == "small"

    # Create a second user for Review 2
    user2 = User(
        email="buyer2@example.com",
        username="buyer2",
        password_hash="fake",
        role="customer",
    )
    db_session.add(user2)
    db_session.commit()
    make_order_for_user(db_session, user2.id, product, status="paid")

    from app.features.products.reviews import create_product_review
    from app.features.products.schemas import ReviewCreate

    create_product_review(
        db_session,
        product.id,
        user2,
        ReviewCreate(rating=5, title="Great", fit_feedback="true_to_size"),
    )

    summary = client.get(REVIEWS_PATH.format(product_id=product.id)).json()
    assert summary["total_reviews"] == 2
    assert summary["fit_feedback"] is not None
    assert summary["fit_feedback"]["small"] == 50.0
    assert summary["fit_feedback"]["true_to_size"] == 50.0
    assert summary["fit_feedback"]["large"] == 0.0
    assert summary["fit_feedback"]["total_responses"] == 2


def test_create_review_rejects_invalid_fit_feedback(
    client,
    mock_user_auth,
    db_session,
):
    product = persist_product(db_session)
    response = client.post(
        REVIEWS_PATH.format(product_id=product.id),
        json={"rating": 5, "fit_feedback": "extra_large"},
    )
    assert response.status_code == 422


def test_product_response_includes_truthful_rating_and_review_count(
    client,
    mock_user_auth,
    db_session,
):
    product = persist_product(db_session)
    make_order_for_user(db_session, mock_user_auth.id, product, status="paid")

    # Empty reviews state
    resp = client.get(f"/api/v1/products/{product.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["rating_avg"] is None
    assert data["review_count"] == 0

    # Add review 1 with rating 4
    client.post(
        REVIEWS_PATH.format(product_id=product.id),
        json={"rating": 4, "title": "Good quality"},
    )

    resp = client.get(f"/api/v1/products/{product.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["rating_avg"] == 4.0
    assert data["review_count"] == 1

    # In listing endpoint as well
    list_resp = client.get("/api/v1/products")
    assert list_resp.status_code == 200
    p_item = next(p for p in list_resp.json()["items"] if p["id"] == product.id)
    assert p_item["rating_avg"] == 4.0
    assert p_item["review_count"] == 1


def test_list_product_reviews_pagination_and_whole_dataset_summary(
    client,
    db_session,
):
    product = persist_product(db_session, name="Paginated Product")

    # Create 5 users with 5 reviews having ratings 1, 2, 3, 4, 5
    for i in range(1, 6):
        u = User(
            email=f"page_user_{i}@example.com",
            username=f"page_user_{i}",
            password_hash="fake",
            role="customer",
        )
        db_session.add(u)
        db_session.commit()
        make_order_for_user(db_session, u.id, product, status="paid")

        from app.features.products.reviews import create_product_review
        from app.features.products.schemas import ReviewCreate

        create_product_review(
            db_session,
            product.id,
            u,
            ReviewCreate(rating=i, title=f"Review {i}", comment=f"Comment {i}"),
        )

    # Page 1: limit=2, offset=0
    resp1 = client.get(f"{REVIEWS_PATH.format(product_id=product.id)}?limit=2&offset=0")
    assert resp1.status_code == 200
    p1 = resp1.json()
    assert p1["total"] == 5
    assert len(p1["items"]) == 2
    assert p1["limit"] == 2
    assert p1["offset"] == 0
    # Global summary over all 5 reviews (1+2+3+4+5)/5 = 3.0
    assert p1["summary"]["total_reviews"] == 5
    assert p1["summary"]["average_rating"] == 3.0

    # Page 2: limit=2, offset=2
    resp2 = client.get(f"{REVIEWS_PATH.format(product_id=product.id)}?limit=2&offset=2")
    assert resp2.status_code == 200
    p2 = resp2.json()
    assert p2["total"] == 5
    assert len(p2["items"]) == 2
    assert p2["limit"] == 2
    assert p2["offset"] == 2
    assert p2["summary"]["total_reviews"] == 5
    assert p2["summary"]["average_rating"] == 3.0

    # Page 3: limit=2, offset=4
    resp3 = client.get(f"{REVIEWS_PATH.format(product_id=product.id)}?limit=2&offset=4")
    assert resp3.status_code == 200
    p3 = resp3.json()
    assert p3["total"] == 5
    assert len(p3["items"]) == 1
    assert p3["limit"] == 2
    assert p3["offset"] == 4
    assert p3["summary"]["total_reviews"] == 5
    assert p3["summary"]["average_rating"] == 3.0
