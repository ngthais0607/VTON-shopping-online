import pytest

from app.features.categories.model import Category


def persist_category(db_session, **values) -> Category:
    category = Category(**values)
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)
    return category


def test_create_category_uses_authenticated_admin_for_audit(
    client,
    db_session,
    mock_admin_auth,
):
    response = client.post(
        "/api/v1/categories",
        json={
            "name": "Menswear",
            "description": "Premium menswear",
            "created_by": 123,
        },
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Menswear"
    assert response.json()["description"] == "Premium menswear"
    assert response.json()["created_by"] == mock_admin_auth.id

    category = db_session.get(Category, response.json()["id"])
    assert category is not None
    assert category.created_by == mock_admin_auth.id


def test_list_categories_returns_paginated_active_matches(client, db_session):
    persist_category(db_session, name="Books", description="Reference books")
    persist_category(db_session, name="Bookcases", description="Office furniture")
    persist_category(db_session, name="Shoes", description="Footwear")
    persist_category(db_session, name="Deleted books", is_deleted=True)

    response = client.get(
        "/api/v1/categories",
        params={"search": "book", "limit": 1, "offset": 1},
    )

    assert response.status_code == 200
    assert response.json().keys() == {"items", "total", "limit", "offset"}
    assert response.json()["total"] == 2
    assert response.json()["limit"] == 1
    assert response.json()["offset"] == 1
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["name"] == "Bookcases"


def test_get_category_returns_active_category(client, db_session):
    category = persist_category(
        db_session,
        name="Electronics",
        description="Home electronics",
    )

    response = client.get(f"/api/v1/categories/{category.id}")

    assert response.status_code == 200
    assert response.json()["id"] == category.id
    assert response.json()["name"] == "Electronics"


def test_patch_category_is_partial_and_uses_authenticated_admin_for_audit(
    client,
    db_session,
    mock_admin_auth,
):
    category = persist_category(
        db_session,
        name="Original",
        description="Keep this description",
    )

    response = client.patch(
        f"/api/v1/categories/{category.id}",
        json={"name": "Updated", "updated_by": 123},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated"
    assert response.json()["description"] == "Keep this description"
    assert response.json()["updated_by"] == mock_admin_auth.id

    db_session.refresh(category)
    assert category.name == "Updated"
    assert category.description == "Keep this description"
    assert category.updated_by == mock_admin_auth.id


def test_delete_category_soft_deletes_with_authenticated_admin(
    client,
    db_session,
    mock_admin_auth,
):
    category = persist_category(db_session, name="Cosmetics")

    response = client.request(
        "DELETE",
        f"/api/v1/categories/{category.id}",
        json={"deleted_by": 123},
    )

    assert response.status_code == 204
    assert response.content == b""

    db_session.refresh(category)
    assert category.is_deleted is True
    assert category.deleted_at is not None
    assert category.deleted_by == mock_admin_auth.id


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_missing_category_uses_common_not_found_response(
    client,
    mock_admin_auth,
    method,
):
    request = getattr(client, method)
    kwargs = {"json": {"name": "Updated"}} if method == "patch" else {}

    response_404 = request("/api/v1/categories/999999", **kwargs)

    assert response_404.status_code == 404
    assert response_404.json()["code"] == "category_not_found"
    assert response_404.json()["details"] is None
