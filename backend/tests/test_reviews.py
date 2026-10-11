from unittest.mock import patch

import pytest

from app.features.orders.model import Order
from app.features.products.model import Product

REVIEWS_PATH = "/api/v1/products/{product_id}/reviews"


def persist_product(db_session, **overrides):
    values = {
        "name": "Review product",
        "price": 99.99,
        "stock_quantity": 10,
    }
    product = Product(**(values | overrides))
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)
    return product


def test_get_reviews_empty(client, db_session):
    product = persist_product(db_session)

    resp = client.get(REVIEWS_PATH.format(product_id=product.id))

    assert resp.status_code == 200
    assert resp.json() == {
        "average_rating": None,
        "total_reviews": 0,
        "reviews": [],
    }


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


def test_create_review_unverified(client, mock_user_auth, db_session):
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
    assert review_resp.status_code == 201
    data = review_resp.json()
    assert data["rating"] == 4
    assert data["title"] == "Decent Product"
    assert data["is_verified_purchase"] is False

    reviews_list = client.get(REVIEWS_PATH.format(product_id=product.id)).json()
    assert reviews_list["total_reviews"] == 1
    assert reviews_list["average_rating"] == 4.0


def test_create_review_verified_buyer(client, mock_user_auth, db_session):
    product = persist_product(
        db_session,
        name="Verified Product Test",
        price=199.99,
        stock_quantity=20,
    )

    order_resp = client.post(
        "/orders/checkout-cart",
        json={
            "items": [{"product_id": product.id, "quantity": 1}],
            "customer_name": "Verified Buyer",
            "customer_phone": "0123456789",
            "shipping_address": "123 Review Street",
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


def test_create_review_service_commits_once(
    db_session,
    mock_user_auth,
):
    from app.features.products.reviews import create_product_review
    from app.features.products.schemas import ReviewCreate

    product = persist_product(db_session)

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
    assert review.is_verified_purchase is False


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
