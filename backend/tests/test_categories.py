import pytest
from sqlalchemy import update

from app.core.slug import generate_unique_slug
from app.features.categories.model import Category
from app.features.products.model import Product


def persist_category(db_session, **values) -> Category:
    if "slug" not in values:
        name = values.get("name", "category")
        existing_slugs = set(s[0] for s in db_session.query(Category.slug).all())
        values["slug"] = generate_unique_slug(name, existing_slugs)
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
    assert response.json()["slug"] == "menswear"
    assert response.json()["description"] == "Premium menswear"
    assert response.json()["created_by"] == mock_admin_auth.id

    category = db_session.get(Category, response.json()["id"])
    assert category is not None
    assert category.created_by == mock_admin_auth.id
    assert category.slug == "menswear"


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
    assert response.json()["slug"] == "electronics"


def test_get_category_allows_legacy_null_timestamps(client, db_session):
    category = persist_category(db_session, name="Legacy timestamps")
    db_session.execute(
        update(Category)
        .where(Category.id == category.id)
        .values(created_at=None, updated_at=None)
    )
    db_session.commit()
    db_session.expire(category)

    response = client.get(f"/api/v1/categories/{category.id}")

    assert response.status_code == 200
    assert response.json()["created_at"] is None
    assert response.json()["updated_at"] is None


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


def test_patch_category_rejects_null_name(
    client,
    db_session,
    mock_admin_auth,
):
    category = persist_category(db_session, name="Original")

    response = client.patch(
        f"/api/v1/categories/{category.id}",
        json={"name": None},
    )

    assert response.status_code == 422
    db_session.refresh(category)
    assert category.name == "Original"


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


def test_create_subcategory_under_valid_parent(client, db_session, mock_admin_auth):
    root = persist_category(db_session, name="Women")

    response = client.post(
        "/api/v1/categories",
        json={
            "name": "Dresses",
            "parent_id": root.id,
            "description": "Women dresses",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Dresses"
    assert data["parent_id"] == root.id
    assert data["slug"] == "dresses"


def test_create_subcategory_rejects_depth_greater_than_two(
    client, db_session, mock_admin_auth
):
    root = persist_category(db_session, name="Clothing")
    sub = persist_category(db_session, name="Tops", parent_id=root.id)

    # Attempt level 3
    response = client.post(
        "/api/v1/categories",
        json={
            "name": "T-Shirts",
            "parent_id": sub.id,
        },
    )

    assert response.status_code == 400
    assert response.json()["code"] == "category_depth_exceeded"


def test_create_subcategory_rejects_nonexistent_parent(
    client, db_session, mock_admin_auth
):
    response = client.post(
        "/api/v1/categories",
        json={
            "name": "Orphan",
            "parent_id": 88888,
        },
    )

    assert response.status_code == 404
    assert response.json()["code"] == "category_not_found"


def test_update_category_cycle_prevention(client, db_session, mock_admin_auth):
    category = persist_category(db_session, name="Accessories")

    response = client.patch(
        f"/api/v1/categories/{category.id}",
        json={"parent_id": category.id},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "category_cycle_detected"


def test_update_category_rejects_parent_if_has_children(
    client, db_session, mock_admin_auth
):
    root1 = persist_category(db_session, name="Men")
    root2 = persist_category(db_session, name="Outerwear")
    persist_category(db_session, name="Jackets", parent_id=root2.id)

    # Trying to make root2 a child of root1 when root2 already has children
    response = client.patch(
        f"/api/v1/categories/{root2.id}",
        json={"parent_id": root1.id},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "category_depth_exceeded"


def test_get_category_tree_hierarchy(client, db_session):
    root1 = persist_category(db_session, name="Men")
    persist_category(db_session, name="Women")
    persist_category(db_session, name="Shirts", parent_id=root1.id)
    persist_category(db_session, name="Pants", parent_id=root1.id)
    persist_category(db_session, name="Deleted", parent_id=root1.id, is_deleted=True)

    response = client.get("/api/v1/categories/tree")

    assert response.status_code == 200
    tree = response.json()
    assert isinstance(tree, list)
    root_names = [item["name"] for item in tree]
    assert "Men" in root_names
    assert "Women" in root_names

    men_node = next(item for item in tree if item["name"] == "Men")
    assert len(men_node["children"]) == 2
    child_names = [c["name"] for c in men_node["children"]]
    assert "Shirts" in child_names
    assert "Pants" in child_names


def test_delete_category_blocked_by_active_products(
    client, db_session, mock_admin_auth
):
    cat = persist_category(db_session, name="Bags")
    product = Product(
        name="Leather Bag",
        slug="leather-bag",
        price=100000,
        category_id=cat.id,
        is_active=True,
        is_deleted=False,
    )
    db_session.add(product)
    db_session.commit()

    response = client.delete(f"/api/v1/categories/{cat.id}")
    assert response.status_code == 409
    assert response.json()["code"] == "category_in_use"


def test_delete_category_blocked_by_active_subcategories(
    client, db_session, mock_admin_auth
):
    parent = persist_category(db_session, name="Active Parent")
    persist_category(db_session, name="Active Child", parent_id=parent.id)

    response = client.delete(f"/api/v1/categories/{parent.id}")
    assert response.status_code == 409
    assert response.json()["code"] == "category_in_use"
