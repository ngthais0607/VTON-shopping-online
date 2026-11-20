"""Request-volume and hostile-input abuse: nothing here may crash the server (5xx) or hang it."""

import io
import time

import pytest

from tests.rule_helpers import (
    BIG,
    CATEGORIES,
    ORDERS,
    PNG_HEADER,
    PRODUCTS,
    USERS,
    VARIANTS,
    VTON,
    assert_rejected,
    make_product,
)

LAB = "/api/v1/vton-lab"
STOCKED = [{"size": "M", "color_name": "Red", "stock_quantity": 5}]


# --------------------------------------------------------------------- request flood


def test_hundreds_of_catalogue_requests_never_fail_or_slow_down(client, db_session, mock_admin_auth):
    make_product(client, db_session, variants=STOCKED, active=True)
    started = time.monotonic()
    codes = {client.get(PRODUCTS, params={"limit": 100}).status_code for _ in range(300)}
    assert codes == {200}
    assert time.monotonic() - started < 30


def test_login_flood_is_throttled_not_crashed(client):
    codes = [
        client.post(f"{USERS}/login", json={"identifier": "ghost", "password": "wrong-password"}).status_code
        for _ in range(80)
    ]
    assert 429 in codes
    assert all(code < 500 for code in codes)
    assert 200 not in codes


def test_register_flood_is_throttled(client):
    codes = [
        client.post(
            f"{USERS}/register",
            json={"username": f"flood{i}", "email": f"flood{i}@example.com", "password": "longenough1"},
        ).status_code
        for i in range(15)
    ]
    assert 429 in codes
    assert all(code < 500 for code in codes)


def test_one_client_cannot_borrow_another_clients_budget_with_a_spoofed_forwarded_header(client):
    # An untrusted peer sending X-Forwarded-For must not get a fresh bucket per request.
    codes = [
        client.post(
            f"{USERS}/login",
            json={"identifier": "ghost", "password": "wrong-password"},
            headers={"X-Forwarded-For": f"10.0.{i // 250}.{i % 250}"},
        ).status_code
        for i in range(80)
    ]
    assert 429 in codes


def test_order_creation_flood_is_throttled(client, db_session, mock_user_auth):
    body = {"customer_name": "Tester", "customer_phone": "0901234567", "shipping_address": "1 Street, HCM city", "items": [{"variant_id": 999999, "quantity": 1}]}
    codes = [client.post(f"{ORDERS}/checkout-cart", json=body).status_code for _ in range(80)]
    assert 429 in codes
    assert all(code < 500 for code in codes)


def test_a_user_cannot_pile_up_unpaid_orders(client, db_session, mock_admin_auth, mock_user_auth):
    from app.features.orders.service import MAX_OPEN_PENDING_ORDERS
    from tests.rule_helpers import SHIPPING, make_product

    make_product(client, db_session, variants=[{"size": "M", "color_name": "Red", "stock_quantity": 500}], active=True)
    body = {**SHIPPING, "items": [{"variant_id": 1, "quantity": 1}]}
    codes = []
    for _ in range(MAX_OPEN_PENDING_ORDERS + 3):
        from app.core.rate_limiter import limiter

        limiter.reset()  # isolate the per-user cap from the per-minute throttle
        codes.append(client.post(f"{ORDERS}/checkout-cart", json=body).status_code)
    assert codes[:MAX_OPEN_PENDING_ORDERS] == [201] * MAX_OPEN_PENDING_ORDERS
    assert set(codes[MAX_OPEN_PENDING_ORDERS:]) == {429}


def test_try_on_upload_flood_is_throttled(client, db_session, mock_user_auth):
    files = {"person_image": ("p.png", PNG_HEADER + b"junk", "image/png")}
    codes = [client.post(f"{VTON}/tasks", files=files, data={"product_id": "1"}).status_code for _ in range(30)]
    assert 429 in codes
    assert all(code < 500 for code in codes)


# --------------------------------------------------------------------- unbounded inputs


@pytest.mark.parametrize("limit", [0, -1, 101, 10**9, BIG, "all", ""])
def test_page_size_is_always_capped(client, limit):
    assert_rejected(client.get(PRODUCTS, params={"limit": limit}), 422)


@pytest.mark.parametrize("offset", [-1, BIG, "x"])
def test_bad_offsets_are_refused_or_empty(client, offset):
    response = client.get(PRODUCTS, params={"offset": offset})
    assert response.status_code in (200, 422), response.text[:200]


def test_a_huge_variant_lookup_list_is_refused_or_bounded(client):
    ids = ",".join(str(i) for i in range(1, 8001))
    response = client.get(f"{PRODUCTS}/variants/lookup", params={"ids": ids})
    assert response.status_code in (200, 400, 413, 414, 422), response.status_code
    if response.status_code == 200:
        assert len(response.json()) <= 200  # never a full-table dump


def test_variant_lookup_rejects_garbage_ids(client):
    for ids in ["1,abc", "1;DROP TABLE products", "1, ,2,,", "9" * 400, "-1,-2"]:
        assert client.get(f"{PRODUCTS}/variants/lookup", params={"ids": ids}).status_code < 500


def test_thousands_of_filter_values_do_not_crash(client):
    params = [("brand", f"b{i}") for i in range(2000)] + [("size", f"s{i}") for i in range(2000)]
    response = client.get(PRODUCTS, params=params)
    assert response.status_code < 500


@pytest.mark.parametrize("length", [1_000, 20_000])
def test_giant_search_text_is_handled(client, length):
    assert client.get(PRODUCTS, params={"search": "a" * length}).status_code < 500


def test_wildcard_search_matches_literally(client, db_session, mock_admin_auth):
    make_product(client, db_session, variants=STOCKED, active=True)
    for pattern in ["%", "_", "%%%%%%%%%", "\\", "[a-z]", "%' OR '1'='1"]:
        body = client.get(PRODUCTS, params={"search": pattern}).json()
        assert body["items"] == [], pattern


# --------------------------------------------------------------------- bodies and bulk writes


def test_variant_bulk_is_capped(client, db_session, mock_admin_auth):
    created, _ = make_product(client, db_session)
    variants = [{"size": f"s{i}", "color_name": f"c{i}"} for i in range(5000)]
    response = client.post(f"{PRODUCTS}/{created['id']}/variants/bulk", json={"variants": variants})
    assert_rejected(response, 422)


def test_matrix_cannot_explode_into_a_million_rows(client, db_session, mock_admin_auth):
    created, _ = make_product(client, db_session)
    body = {"sizes": [f"s{i}" for i in range(30)], "colors": [{"name": f"c{i}"} for i in range(30)]}
    response = client.post(f"{PRODUCTS}/{created['id']}/variants/bulk", json=body)
    assert response.status_code < 500
    assert response.status_code in (200, 201, 422)


def test_a_product_cannot_carry_unlimited_variants_at_creation(client, mock_admin_auth):
    variants = [{"size": f"s{i}", "color_name": f"c{i}"} for i in range(3000)]
    assert_rejected(client.post(PRODUCTS, json={"name": "Big", "price": 1, "gender": "male", "variants": variants}), 422)


def test_oversized_text_fields_are_refused(client, mock_admin_auth):
    huge = "x" * 1_000_000
    for field in ("name", "description", "brand"):
        response = client.post(PRODUCTS, json={"name": "N", "price": 1, "gender": "male", field: huge})
        assert_rejected(response, 422)


def test_deeply_nested_json_is_a_client_error(client, mock_admin_auth):
    nested = "[" * 5000 + "]" * 5000
    response = client.post(PRODUCTS, content=nested, headers={"content-type": "application/json"})
    assert response.status_code in (400, 413, 422)


@pytest.mark.parametrize("payload", ["", "{", "null", "[]", '"str"', "\x00", "{'a': 1}", "NaN"])
def test_malformed_bodies_are_client_errors(client, mock_admin_auth, payload):
    for url in (PRODUCTS, CATEGORIES, f"{ORDERS}/checkout-cart", f"{USERS}/register", f"{USERS}/login"):
        response = client.post(url, content=payload, headers={"content-type": "application/json"})
        assert response.status_code < 500, (url, response.status_code)


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity", "1e999"])
def test_nan_and_infinity_prices_are_refused(client, mock_admin_auth, value):
    raw = f'{{"name":"N","price":{value},"gender":"male"}}'
    response = client.post(PRODUCTS, content=raw, headers={"content-type": "application/json"})
    assert response.status_code in (400, 422), (value, response.status_code)


def test_oversized_order_is_refused(client, db_session, mock_user_auth):
    items = [{"variant_id": 1, "quantity": 1}] * 5000
    body = {"customer_name": "T", "customer_phone": "0901234567", "shipping_address": "1 Street, HCM", "items": items}
    assert client.post(f"{ORDERS}/checkout-cart", json=body).status_code in (400, 413, 422)


# --------------------------------------------------------------------- uploads (user + admin, incl. try-on)


def upload(client, content, *, name="p.png", mime="image/png", data=None):
    return client.post(
        f"{VTON}/tasks",
        files={"person_image": (name, io.BytesIO(content), mime)},
        data=data or {"product_id": "1", "consent": "true"},
    )


def test_user_try_on_rejects_non_images_and_fake_extensions(client, db_session, mock_user_auth):
    cases = [
        (b"", "p.png", "image/png"),
        (b"MZ\x90\x00" + b"\x00" * 100, "p.png", "image/png"),
        (b"<?php system($_GET['c']); ?>", "p.php", "image/png"),
        (b"<svg onload=alert(1)/>", "p.svg", "image/svg+xml"),
        (PNG_HEADER + b"\x00" * 50, "p.png", "image/png"),
        (b"GIF89a" + b"\x00" * 50, "p.png", "image/png"),
        (b"%PDF-1.4", "p.png", "image/png"),
    ]
    for content, name, mime in cases:
        response = upload(client, content, name=name, mime=mime)
        assert 400 <= response.status_code < 500, (name, response.status_code, response.text[:150])


def test_user_try_on_rejects_oversized_photo(client, db_session, mock_user_auth):
    response = upload(client, PNG_HEADER + b"\x00" * (12 * 1024 * 1024))
    assert 400 <= response.status_code < 500


def test_user_try_on_rejects_hostile_form_values(client, db_session, mock_user_auth):
    for data in [
        {"product_id": "abc"},
        {"product_id": str(BIG)},
        {"product_id": "-1"},
        {"product_id": "1", "variant_id": "x"},
        {"product_id": "1", "variant_id": str(BIG)},
        {"product_id": "1", "image_id": "i" * 5000},
        {"product_id": "1", "consent": "maybe"},
        {},
    ]:
        response = upload(client, PNG_HEADER + b"\x00" * 20, data=data)
        assert 400 <= response.status_code < 500, (data, response.status_code)


def test_try_on_without_a_photo_part_is_a_client_error(client, mock_user_auth):
    assert_rejected(client.post(f"{VTON}/tasks", data={"product_id": "1"}), 422)


@pytest.mark.parametrize("task_id", ["../../etc/passwd", "%2e%2e%2f", "x" * 5000, "'; DROP TABLE vton_tasks;--", "0", "null"])
def test_try_on_task_ids_are_never_trusted(client, mock_user_auth, task_id):
    for suffix in ("", "/person", "/result"):
        assert client.get(f"{VTON}/tasks/{task_id}{suffix}").status_code < 500


def test_try_on_history_page_is_bounded(client, mock_user_auth):
    assert_rejected(client.get(f"{VTON}/tasks", params={"limit": 500}), 422)
    assert_rejected(client.get(f"{VTON}/tasks", params={"offset": -1}), 422)


def test_try_on_requires_login(client):
    assert client.get(f"{VTON}/quota").status_code == 401
    assert client.get(f"{VTON}/tasks").status_code == 401
    assert client.post(f"{VTON}/tasks", files={"person_image": ("p.png", b"x", "image/png")}, data={"product_id": "1"}).status_code == 401


def test_a_customer_cannot_use_the_admin_lab(client, mock_user_auth):
    assert client.get(f"{LAB}/engines").status_code in (401, 403)
    files = {"person": ("p.png", PNG_HEADER, "image/png"), "garment": ("g.png", PNG_HEADER, "image/png")}
    assert client.post(f"{LAB}/try-on", files=files).status_code in (401, 403)


def test_the_lab_rejects_hostile_admin_input(client, mock_admin_auth):
    junk = {"person": ("p.png", b"not an image", "image/png"), "garment": ("g.png", b"", "image/png")}
    assert client.post(f"{LAB}/try-on", files=junk).status_code < 500
    png = {"person": ("p.png", PNG_HEADER, "image/png"), "garment": ("g.png", PNG_HEADER, "image/png")}
    for data in [{"seed": "-1"}, {"seed": str(BIG)}, {"seed": "x"}, {"cloth_type": "x" * 10000}, {"engine": "../../x"}, {"cloth_type": "nope"}]:
        assert client.post(f"{LAB}/try-on", files=png, data=data).status_code < 500, data


def test_the_lab_refuses_oversized_uploads(client, mock_admin_auth):
    big = ("p.png", PNG_HEADER + b"\x00" * (9 * 1024 * 1024), "image/png")
    response = client.post(f"{LAB}/try-on", files={"person": big, "garment": big})
    assert 400 <= response.status_code < 500


# --------------------------------------------------------------------- authorisation abuse


ADMIN_ROUTES = [
    ("post", PRODUCTS),
    ("patch", f"{PRODUCTS}/1"),
    ("delete", f"{PRODUCTS}/1"),
    ("post", f"{PRODUCTS}/1/variants/bulk"),
    ("patch", f"{VARIANTS}/1"),
    ("delete", f"{VARIANTS}/1"),
    ("post", f"{VARIANTS}/1/adjust-stock"),
    ("post", CATEGORIES),
    ("patch", f"{CATEGORIES}/1"),
    ("delete", f"{CATEGORIES}/1"),
]


@pytest.mark.parametrize("method,url", ADMIN_ROUTES)
def test_anonymous_and_customer_cannot_use_admin_routes(client, mock_user_auth, method, url):
    response = client.request(method.upper(), url, json={})
    assert response.status_code in (401, 403), (method, url, response.status_code)


@pytest.mark.parametrize("token", ["", "Bearer", "Bearer ", "Bearer x", "Bearer " + "a" * 10000, "Basic abc", "Bearer null"])
def test_garbage_authorization_headers_are_401_not_500(client, token):
    response = client.get(f"{VTON}/quota", headers={"Authorization": token})
    assert response.status_code == 401


def test_http_verbs_the_api_does_not_define_are_refused(client):
    assert client.request("TRACE", PRODUCTS).status_code in (404, 405)
    assert client.put(PRODUCTS).status_code in (404, 405)
    assert client.delete(PRODUCTS).status_code in (404, 405)
