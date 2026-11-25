"""Shared helpers for the rule-violation suites (tests/test_rules_*.py)."""

from app.features.categories.model import Category
from app.features.products.variant_model import ProductVariant

PRODUCTS = "/api/v1/products"
CATEGORIES = "/api/v1/categories"
ORDERS = "/api/v1/orders"
VARIANTS = "/api/v1/variants"
USERS = "/api/v1/users"
VTON = "/api/v1/vton"

# Smallest header the image sniffer accepts as PNG; the rest is junk on purpose.
PNG_HEADER = b"\x89PNG\r\n\x1a\n"
BIG = 10**30  # does not fit a 64-bit database integer

SHIPPING = {
    "customer_name": "Tester",
    "customer_phone": "0901234567",
    "shipping_address": "1 Street, HCM city",
}


def product_body(**overrides):
    body = {"name": "Polo Test", "price": 100000, "gender": "male"}
    body.update(overrides)
    return body


def make_category(db, slug="ao-thun", **kw):
    category = Category(name=kw.pop("name", slug), slug=slug, **kw)
    db.add(category)
    db.commit()
    return category


def make_product(client, db, *, variants=None, active=False, **overrides):
    """Create a product through the API and return (product_json, [variant ids])."""
    category = make_category(db)
    body = product_body(category_id=category.id, variants=variants, **overrides)
    response = client.post(PRODUCTS, json=body)
    assert response.status_code == 201, response.text
    product = response.json()
    if active:
        assert (
            client.patch(
                f"{PRODUCTS}/{product['id']}", json={"is_active": True}
            ).status_code
            == 200
        )
    ids = [
        v.id
        for v in db.query(ProductVariant)
        .filter_by(product_id=product["id"])
        .order_by(ProductVariant.id)
    ]
    return product, ids


def assert_rejected(response, status):
    """The request is refused with the expected 4xx and never a server error."""
    assert response.status_code < 500, (
        f"server error: {response.status_code} {response.text[:200]}"
    )
    assert response.status_code == status, (
        f"{response.status_code} {response.text[:200]}"
    )
