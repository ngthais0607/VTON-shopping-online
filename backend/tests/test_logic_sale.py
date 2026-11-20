"""Sale pricing: original price, discount percent, validation and the on_sale filter."""

import pytest

from tests.rule_helpers import PRODUCTS, VARIANTS, assert_rejected, make_product


def detail(client, pid):
    return client.get(f"{PRODUCTS}/{pid}").json()


def test_product_without_original_price_is_not_on_sale(client, db_session, mock_admin_auth):
    created, _ = make_product(client, db_session, price=100000)
    body = detail(client, created["id"])
    assert (body["compare_at_price"], body["on_sale"], body["discount_percent"]) == (None, False, 0)


def test_original_price_above_price_puts_the_product_on_sale(client, db_session, mock_admin_auth):
    created, _ = make_product(client, db_session, price=80000, compare_at_price=100000)
    body = detail(client, created["id"])
    assert body["on_sale"] is True
    assert body["compare_at_price"] == 100000
    assert body["discount_percent"] == 20


@pytest.mark.parametrize("compare_at", [100000, 99999, 1])
def test_original_price_must_exceed_the_price_on_create(client, db_session, mock_admin_auth, compare_at):
    with pytest.raises(AssertionError):
        make_product(client, db_session, price=100000, compare_at_price=compare_at)
    assert_rejected(client.post(PRODUCTS, json={"name": "S", "price": 100000, "gender": "male", "compare_at_price": compare_at}), 422)


@pytest.mark.parametrize("compare_at", [0, -5, 10**15, "abc"])
def test_nonsense_original_prices_are_refused(client, mock_admin_auth, compare_at):
    body = {"name": "S", "price": 10, "gender": "male", "compare_at_price": compare_at}
    assert_rejected(client.post(PRODUCTS, json=body), 422)


def test_patch_validates_against_the_effective_values(client, db_session, mock_admin_auth):
    created, _ = make_product(client, db_session, price=80000, compare_at_price=100000)
    url = f"{PRODUCTS}/{created['id']}"
    # Raising the price up to the original price would silently end the sale -> refused.
    assert_rejected(client.patch(url, json={"price": 100000}), 400)
    # An original price at or below the current price is refused.
    assert_rejected(client.patch(url, json={"compare_at_price": 80000}), 400)
    assert detail(client, created["id"])["discount_percent"] == 20
    # Both together are checked as a pair.
    assert client.patch(url, json={"price": 150000, "compare_at_price": 200000}).status_code == 200
    assert detail(client, created["id"])["discount_percent"] == 25


def test_clearing_the_original_price_ends_the_sale(client, db_session, mock_admin_auth):
    created, _ = make_product(client, db_session, price=80000, compare_at_price=100000)
    url = f"{PRODUCTS}/{created['id']}"
    assert client.patch(url, json={"compare_at_price": None}).status_code == 200
    body = detail(client, created["id"])
    assert (body["compare_at_price"], body["on_sale"]) == (None, False)


def test_a_cheaper_variant_deepens_the_discount_and_an_expensive_one_ends_it(client, db_session, mock_admin_auth):
    variants = [
        {"size": "S", "color_name": "Red", "price": 50000, "stock_quantity": 5},
        {"size": "M", "color_name": "Red", "stock_quantity": 5},
    ]
    created, (cheap, other) = make_product(client, db_session, variants=variants, price=80000, compare_at_price=100000)
    # Listing price is the cheapest active variant (50000): 50% off.
    assert detail(client, created["id"])["discount_percent"] == 50
    client.patch(f"{VARIANTS}/{cheap}", json={"is_active": False})
    # Only the 80000 variant is left: back to 20%.
    assert detail(client, created["id"])["discount_percent"] == 20
    # Pricing every remaining variant above the original price removes the sale.
    client.patch(f"{VARIANTS}/{other}", json={"price": 120000})
    assert detail(client, created["id"])["on_sale"] is False


def test_tiny_discounts_never_show_as_zero_percent(client, db_session, mock_admin_auth):
    created, _ = make_product(client, db_session, price=999999, compare_at_price=1000000)
    body = detail(client, created["id"])
    assert body["on_sale"] is True
    assert body["discount_percent"] >= 1


STOCKED = [{"size": "M", "color_name": "Red", "stock_quantity": 5}]


def test_on_sale_filter_splits_the_catalogue(client, db_session, mock_admin_auth):
    sale, _ = make_product(client, db_session, variants=STOCKED, price=80000, compare_at_price=100000, active=True)
    regular = client.post(
        PRODUCTS, json={"name": "Regular", "price": 50000, "gender": "male", "variants": STOCKED}
    ).json()
    client.patch(f"{PRODUCTS}/{regular['id']}", json={"is_active": True})

    def ids(**params):
        return {p["id"] for p in client.get(PRODUCTS, params=params).json()["items"]}

    assert ids(on_sale="true") == {sale["id"]}
    assert ids(on_sale="false") == {regular["id"]}
    assert ids() == {sale["id"], regular["id"]}


def test_listing_items_expose_the_sale_fields(client, db_session, mock_admin_auth):
    make_product(client, db_session, variants=STOCKED, price=80000, compare_at_price=100000, active=True)
    item = client.get(PRODUCTS, params={"on_sale": "true"}).json()["items"][0]
    assert (item["compare_at_price"], item["on_sale"], item["discount_percent"]) == (100000, True, 20)


def test_invalid_on_sale_value_is_a_client_error(client):
    assert_rejected(client.get(PRODUCTS, params={"on_sale": "maybe"}), 422)


def test_clients_cannot_set_the_computed_fields(client, mock_admin_auth):
    body = {"name": "S", "price": 10, "gender": "male", "on_sale": True, "discount_percent": 90}
    assert_rejected(client.post(PRODUCTS, json=body), 422)
