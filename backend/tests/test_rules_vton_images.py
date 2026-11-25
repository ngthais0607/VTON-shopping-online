"""Rule violations on try-on requests and product image uploads."""

import pytest

from tests.rule_helpers import (
    BIG,
    PNG_HEADER,
    PRODUCTS,
    VTON,
    assert_rejected,
    make_product,
)

JPG = ("a.jpg", b"x", "image/jpeg")


def task(client, files=None, data=None, headers=None):
    data = {"product_id": 1, "consent": "true", **(data or {})}
    return client.post(f"{VTON}/tasks", data=data, files=files, headers=headers)


def test_try_on_needs_a_photo(client, mock_user_auth):
    assert_rejected(client.post(f"{VTON}/tasks", data={"product_id": 1}), 422)


def test_try_on_needs_consent(client, mock_user_auth):
    response = client.post(
        f"{VTON}/tasks", data={"product_id": 1}, files={"person_image": JPG}
    )
    assert_rejected(response, 400)


@pytest.mark.parametrize(
    "name,payload,ctype",
    [
        ("a.jpg", b"not an image", "image/jpeg"),
        ("a.exe", b"MZ", "application/octet-stream"),
        ("a.jpg", b"", "image/jpeg"),
        ("a.svg", b"<svg onload=alert(1)/>", "image/svg+xml"),
    ],
)
def test_try_on_rejects_non_photos(client, mock_user_auth, name, payload, ctype):
    response = task(client, files={"person_image": (name, payload, ctype)})
    assert response.status_code in (400, 404, 415, 422)


def test_try_on_unknown_product_and_task(client, mock_user_auth):
    assert_rejected(
        task(client, data={"product_id": 99999}, files={"person_image": JPG}), 404
    )
    assert_rejected(client.get(f"{VTON}/products/99999/eligibility"), 404)
    assert_rejected(client.delete(f"{VTON}/tasks/nope"), 404)


def test_try_on_idempotency_key_is_bounded(client, mock_user_auth):
    response = task(
        client, files={"person_image": JPG}, headers={"Idempotency-Key": "k" * 65}
    )
    assert_rejected(response, 422)


@pytest.fixture
def product_id(client, db_session, mock_admin_auth):
    return make_product(client, db_session)[0]["id"]


def upload(
    client,
    pid,
    name="a.png",
    payload=PNG_HEADER + b"0" * 100,
    ctype="image/png",
    **data,
):
    return client.post(
        f"{PRODUCTS}/{pid}/images", data=data, files={"file": (name, payload, ctype)}
    )


@pytest.mark.parametrize(
    "payload,ctype",
    [
        (b"", "image/png"),
        (b"hello", "image/png"),
        (b"<svg onload=alert(1)/>", "image/svg+xml"),
        (b"<html>", "image/jpeg"),
        (PNG_HEADER + b"0" * 10_000_000, "image/png"),  # right header, undecodable body
    ],
    ids=["empty", "text", "svg", "html", "png-header-junk-body"],
)
def test_corrupt_or_hostile_images_are_refused(client, product_id, payload, ctype):
    assert_rejected(upload(client, product_id, payload=payload, ctype=ctype), 400)


@pytest.mark.parametrize(
    "data", [{"kind": "evil"}, {"sort_order": "-1"}, {"sort_order": str(BIG)}]
)
def test_bad_image_metadata_is_refused(client, product_id, data):
    assert upload(client, product_id, **data).status_code in (400, 422)


def test_filename_traversal_never_reaches_storage(client, product_id, product_storage):
    upload(client, product_id, name="../../x.png")
    assert all(".." not in name for name in product_storage.put_objects)


def test_image_actions_on_unknown_targets_are_404(client, product_id):
    assert_rejected(upload(client, 99999), 404)
    assert_rejected(
        client.patch(f"{PRODUCTS}/{product_id}/images/nope", json={"is_primary": True}),
        404,
    )
    assert_rejected(client.delete(f"{PRODUCTS}/{product_id}/images/nope"), 404)
    assert client.put(
        f"{PRODUCTS}/{product_id}/images/order", json={"image_ids": ["nope"]}
    ).status_code in (400, 404)
