import pytest
from app.features.orders.model import Order
from app.features.products.model import Product

def test_get_reviews_empty(client, db_session):
    product = Product(
        name="Test Product for Reviews",
        price=99.99,
        stock_quantity=10,
        description="Awesome product"
    )
    db_session.add(product)
    db_session.commit()

    resp = client.get(f"/products/{product.id}/reviews")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_reviews"] == 0
    assert data["average_rating"] == 5.0
    assert data["reviews"] == []


def test_create_review_unverified(client, mock_user_auth, db_session):
    product = Product(
        name="Unverified Product Test",
        price=49.99,
        stock_quantity=5
    )
    db_session.add(product)
    db_session.commit()

    review_resp = client.post(f"/products/{product.id}/reviews", json={
        "rating": 4,
        "title": "Decent Product",
        "comment": "Works well overall"
    })
    assert review_resp.status_code == 201
    data = review_resp.json()
    assert data["rating"] == 4
    assert data["title"] == "Decent Product"
    assert data["is_verified_purchase"] == False

    reviews_list = client.get(f"/products/{product.id}/reviews").json()
    assert reviews_list["total_reviews"] == 1
    assert reviews_list["average_rating"] == 4.0


def test_create_review_verified_buyer(client, mock_user_auth, db_session):
    product = Product(
        name="Verified Product Test",
        price=199.99,
        stock_quantity=20
    )
    db_session.add(product)
    db_session.commit()

    order_resp = client.post("/orders/", json={
        "product_id": product.id,
        "quantity": 1
    })
    assert order_resp.status_code == 201
    order_id = order_resp.json()["id"]

    order = db_session.query(Order).filter(Order.id == order_id).first()
    order.status = "paid"
    db_session.commit()

    review_resp = client.post(f"/products/{product.id}/reviews", json={
        "rating": 5,
        "title": "Must Have!",
        "comment": "Extremely satisfied with this verified purchase."
    })
    assert review_resp.status_code == 201
    data = review_resp.json()
    assert data["rating"] == 5
    assert data["is_verified_purchase"] == True


def test_update_profile_me(client, mock_user_auth):
    update_payload = {
        "username": "updated_testuser",
        "email": "test@example.com",
        "first_name": "John",
        "last_name": "Doe"
    }
    resp = client.put("/users/me", json=update_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["first_name"] == "John"
    assert data["last_name"] == "Doe"
