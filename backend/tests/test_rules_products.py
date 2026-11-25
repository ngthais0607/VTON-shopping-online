"""Rule violations on the product feature: every one is refused cleanly (never a 5xx)."""

import re

import pytest

from tests.rule_helpers import PRODUCTS, assert_rejected, make_category, product_body

VARIANT = {"size": "M", "color_name": "Red", "stock_quantity": 1}

CREATE_CASES = {
    "negative price": ({"price": -1}, 422),
    "price is text": ({"price": "abc"}, 422),
    "price above the cap": ({"price": 1e30}, 422),
    "empty name": ({"name": ""}, 422),
    "name too long": ({"name": "x" * 256}, 422),
    "whitespace-only name": ({"name": "   "}, 422),
    "unknown field": ({"hacker": 1}, 422),
    "gender too long": ({"gender": "g" * 21}, 422),
    "empty currency": ({"currency": ""}, 422),
    "description too long": ({"description": "d" * 1001}, 422),
    "slug too long": ({"slug": "s" * 256}, 422),
    "chart is a string": ({"size_chart": "abc"}, 422),
    "chart is a list": ({"size_chart": [1, 2]}, 422),
    "chart negative number": ({"size_chart": {"M": {"chest": -5}}}, 422),
    "chart zero number": ({"size_chart": {"M": {"chest": 0}}}, 422),
    "chart row is null": ({"size_chart": {"M": None}}, 422),
    "chart value is text": ({"size_chart": {"M": {"chest": "abc"}}}, 422),
    "chart value is bool": ({"size_chart": {"M": {"chest": True}}}, 422),
    "chart value absurd": ({"size_chart": {"M": {"chest": 10**9}}}, 422),
    "chart with 5000 sizes": (
        {"size_chart": {f"S{i}": {"chest": 1} for i in range(5000)}},
        422,
    ),
    "chart size name too long": ({"size_chart": {"S" * 21: {"chest": 1}}}, 422),
    "activate without variants": ({"is_active": True}, 400),
    "unknown category": ({"category_id": 99999}, 404),
    "category zero": ({"category_id": 0}, 404),
    "category negative": ({"category_id": -1}, 404),
    "duplicate variants": ({"variants": [VARIANT, VARIANT]}, 409),
}


@pytest.mark.parametrize("label", CREATE_CASES)
def test_create_rule_violations_are_refused(client, mock_admin_auth, label):
    overrides, status = CREATE_CASES[label]
    response = client.post(PRODUCTS, json=product_body(**overrides))
    assert_rejected(response, status)


def test_a_chart_in_the_documented_shape_is_accepted(
    client, db_session, mock_admin_auth
):
    category = make_category(db_session)
    chart = {"M": {"chest": 102.5, "length": 68}}
    response = client.post(
        PRODUCTS, json=product_body(category_id=category.id, size_chart=chart)
    )
    assert response.status_code == 201 and response.json()["size_chart"] == chart


def test_hostile_slug_is_sanitised(client, mock_admin_auth):
    response = client.post(PRODUCTS, json=product_body(slug="../../etc/passwd"))
    assert response.status_code == 201
    assert re.fullmatch(r"[a-z0-9-]+", response.json()["slug"])


PATCH_CASES = {
    "price null": ({"price": None}, 422),
    "name null": ({"name": None}, 422),
    "name whitespace": ({"name": "  "}, 422),
    "unknown field": ({"zzz": 1}, 422),
    "price above the cap": ({"price": 1e30}, 422),
    "chart negative": ({"size_chart": {"M": {"chest": -1}}}, 422),
    "activate without variants": ({"is_active": True}, 400),
    "unknown category": ({"category_id": 99999}, 404),
}


@pytest.mark.parametrize("label", PATCH_CASES)
def test_patch_rule_violations_are_refused(client, mock_admin_auth, label):
    created = client.post(PRODUCTS, json=product_body(name="Patch me")).json()
    payload, status = PATCH_CASES[label]
    assert_rejected(client.patch(f"{PRODUCTS}/{created['id']}", json=payload), status)


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
@pytest.mark.parametrize("product_id", [0, -1, 99999])
def test_unknown_product_is_404(client, mock_admin_auth, method, product_id):
    kwargs = {"json": {"name": "x"}} if method == "patch" else {}
    assert_rejected(getattr(client, method)(f"{PRODUCTS}/{product_id}", **kwargs), 404)


LIST_CASES = {
    "limit 0": ({"limit": 0}, 422),
    "limit 101": ({"limit": 101}, 422),
    "negative offset": ({"offset": -1}, 422),
    "unknown sort": ({"sort": "evil"}, 422),
    "negative min price": ({"min_price": -1}, 422),
}


@pytest.mark.parametrize("label", LIST_CASES)
def test_list_query_violations_are_refused(client, label):
    params, status = LIST_CASES[label]
    assert_rejected(client.get(PRODUCTS, params=params), status)


@pytest.mark.parametrize(
    "params",
    [
        {"search": "' OR 1=1 --"},
        {"search": "%" * 150},
        {"search": "_" * 150},
        {"search": "\x00"},
        {"min_price": 100, "max_price": 1},
        {"gender": ",,,"},
        {"size": "," * 300},
    ],
)
def test_odd_but_legal_list_queries_do_not_crash(client, params):
    response = client.get(PRODUCTS, params=params)
    assert response.status_code == 200 and response.json()["items"] == []


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("post", "", {"name": "x", "price": 1}),
        ("patch", "/1", {"name": "x"}),
        ("delete", "/1", None),
        ("get", "/size-chart-presets", None),
    ],
)
def test_customers_cannot_use_admin_product_endpoints(
    client, mock_user_auth, method, path, body
):
    kwargs = {"json": body} if body is not None else {}
    assert_rejected(getattr(client, method)(f"{PRODUCTS}{path}", **kwargs), 403)
