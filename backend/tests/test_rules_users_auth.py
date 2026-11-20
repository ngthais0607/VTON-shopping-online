"""Rule violations on registration, login, tokens and user admin."""

import pytest

from app.features.users.model import User
from tests.rule_helpers import USERS, assert_rejected

BASE = {"username": "tester", "email": "a@b.co", "password": "Passw0rd!x", "first_name": "T"}

REGISTER_CASES = {
    "bad email": ({"email": "nope"}, 422),
    "empty password": ({"password": ""}, 422),
    "short password": ({"password": "a"}, 422),
    "password of 100k chars": ({"password": "a" * 100000}, 422),
    "password over 72 bytes": ({"password": "Aa1!" * 30}, 422),
    "first name too long": ({"first_name": "n" * 1000}, 422),
    "empty username": ({"username": ""}, 422),
    "username too long": ({"username": "u" * 101}, 422),
    "null byte in email": ({"email": "a\x00@b.co"}, 422),
}


@pytest.mark.parametrize("label", REGISTER_CASES)
def test_register_violations_are_refused(client, label):
    overrides, status = REGISTER_CASES[label]
    assert_rejected(client.post(f"{USERS}/register", json={**BASE, **overrides}), status)


def test_register_without_fields_is_refused(client):
    assert_rejected(client.post(f"{USERS}/register", json={}), 422)


def test_unicode_password_within_the_byte_limit_works(client):
    body = {**BASE, "password": "Mật-khẩu-Rất-Dài-1!"}
    assert client.post(f"{USERS}/register", json=body).status_code == 201


def test_register_cannot_grant_admin(client, db_session):
    body = {**BASE, "role": "admin", "is_admin": True, "is_active": True}
    assert client.post(f"{USERS}/register", json=body).status_code == 201
    assert db_session.query(User).filter_by(username="tester").one().role != "admin"


def test_duplicate_registration_conflicts(client):
    assert client.post(f"{USERS}/register", json=BASE).status_code == 201
    assert_rejected(client.post(f"{USERS}/register", json=BASE), 409)


def test_login_failures_are_uniform_and_clean(client):
    client.post(f"{USERS}/register", json=BASE)
    wrong = client.post(f"{USERS}/login", json={"identifier": "a@b.co", "password": "wrong-password"})
    unknown = client.post(f"{USERS}/login", json={"identifier": "no@b.co", "password": "wrong-password"})
    assert_rejected(wrong, 401)
    assert_rejected(unknown, 401)
    assert wrong.json()["message"] == unknown.json()["message"]  # no account enumeration


@pytest.mark.parametrize(
    "body",
    [{}, {"identifier": "", "password": ""}, {"identifier": "x"}, {"identifier": "a" * 5000, "password": "p"}],
)
def test_malformed_login_is_refused(client, body):
    assert client.post(f"{USERS}/login", json=body).status_code in (401, 422)


def test_login_with_binary_garbage_body_is_refused(client):
    response = client.post(f"{USERS}/login", content=b"\xff\xfe", headers={"content-type": "application/json"})
    assert response.status_code == 422


def test_repeated_login_failures_are_throttled_not_crashed(client):
    client.post(f"{USERS}/register", json=BASE)
    codes = [
        client.post(f"{USERS}/login", json={"identifier": "a@b.co", "password": "wrong-password"}).status_code
        for _ in range(8)
    ]
    assert set(codes) <= {401, 429} and 429 in codes


def test_registration_flood_is_throttled(client):
    codes = [
        client.post(f"{USERS}/register", json={**BASE, "username": f"u{i}", "email": f"u{i}@b.co"}).status_code
        for i in range(8)
    ]
    assert set(codes) <= {201, 429} and 429 in codes


@pytest.mark.parametrize(
    "method,path,kwargs",
    [
        ("get", "/me", {}),
        ("get", "/me", {"headers": {"Authorization": "Bearer x.y.z"}}),
        ("get", "/me", {"headers": {"Authorization": "Bearer"}}),
        ("get", "/me", {"headers": {"Authorization": "Basic abc"}}),
        ("delete", "/1", {}),
        ("post", "", {"json": BASE}),
        ("post", "/refresh", {}),
        ("post", "/refresh", {"json": {"refresh_token": "abc"}}),
    ],
)
def test_missing_or_forged_credentials_are_401(client, method, path, kwargs):
    assert_rejected(getattr(client, method)(f"{USERS}{path}", **kwargs), 401)


def test_customer_cannot_manage_other_users(client, mock_user_auth):
    assert client.delete(f"{USERS}/1").status_code == 403
    assert client.post(USERS, json=BASE).status_code == 403
