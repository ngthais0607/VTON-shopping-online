"""Rule violations on categories."""

import pytest

from tests.rule_helpers import CATEGORIES, PRODUCTS, assert_rejected, product_body

CREATE_CASES = {
    "empty name": ({"name": ""}, 422),
    "name too long": ({"name": "x" * 256}, 422),
    "whitespace-only name": ({"name": "   "}, 422),
    "description too long": ({"name": "D", "description": "d" * 1001}, 422),
    "unknown parent": ({"name": "Kid", "parent_id": 99999}, 404),
    "missing name": ({}, 422),
}


@pytest.mark.parametrize("label", CREATE_CASES)
def test_create_violations_are_refused(client, mock_admin_auth, label):
    body, status = CREATE_CASES[label]
    assert_rejected(client.post(CATEGORIES, json=body), status)


def test_patch_violations_are_refused(client, mock_admin_auth):
    cid = client.post(CATEGORIES, json={"name": "Parent", "slug": "parent"}).json()["id"]
    assert_rejected(client.patch(f"{CATEGORIES}/{cid}", json={"name": None}), 422)
    assert_rejected(client.patch(f"{CATEGORIES}/{cid}", json={"name": "  "}), 422)
    assert_rejected(client.patch(f"{CATEGORIES}/{cid}", json={"parent_id": cid}), 400)
    assert_rejected(client.patch(f"{CATEGORIES}/99999", json={"name": "x"}), 404)


def test_a_category_cannot_become_its_own_ancestor(client, mock_admin_auth):
    parent = client.post(CATEGORIES, json={"name": "Parent"}).json()
    kid = client.post(CATEGORIES, json={"name": "Kid", "parent_id": parent["id"]}).json()
    assert_rejected(client.patch(f"{CATEGORIES}/{parent['id']}", json={"parent_id": kid["id"]}), 400)


def test_category_in_use_cannot_be_deleted(client, mock_admin_auth):
    parent = client.post(CATEGORIES, json={"name": "Parent"}).json()
    kid = client.post(CATEGORIES, json={"name": "Kid", "parent_id": parent["id"]}).json()
    assert_rejected(client.delete(f"{CATEGORIES}/{parent['id']}"), 409)  # has a child
    client.post(PRODUCTS, json=product_body(category_id=kid["id"]))
    assert_rejected(client.delete(f"{CATEGORIES}/{kid['id']}"), 409)  # has a product


@pytest.mark.parametrize("method", ["get", "delete"])
@pytest.mark.parametrize("category_id", [0, -1, 99999])
def test_unknown_category_is_404(client, mock_admin_auth, method, category_id):
    assert_rejected(getattr(client, method)(f"{CATEGORIES}/{category_id}"), 404)


def test_hostile_slug_does_not_crash(client, mock_admin_auth):
    response = client.post(CATEGORIES, json={"name": "W", "slug": "../x y?"})
    assert response.status_code < 500
