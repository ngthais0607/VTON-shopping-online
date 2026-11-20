"""How queries are written: no N+1, no injection, nothing unbounded."""

import re
from contextlib import contextmanager
from pathlib import Path

import pytest
from sqlalchemy import event, text

from app.core.rate_limiter import limiter
from app.features.products.variant_model import ProductVariant
from tests.conftest import engine
from tests.rule_helpers import (
    CATEGORIES,
    ORDERS,
    PRODUCTS,
    SHIPPING,
    USERS,
    VARIANTS,
    make_category,
    make_product,
)

APP = Path(__file__).resolve().parents[1] / "app"
STOCKED = [{"size": "M", "color_name": "Red", "stock_quantity": 50}, {"size": "L", "color_name": "Blue", "stock_quantity": 50}]


@contextmanager
def count_statements():
    seen: list[str] = []

    def record(_conn, _cursor, statement, *_rest):
        if statement.lstrip().upper().startswith(("SELECT", "INSERT", "UPDATE", "DELETE")):
            seen.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", record)


def add_products(client, db, count, start=0):
    category = make_category(db, slug=f"cat-{start}")
    for i in range(start, start + count):
        body = {
            "name": f"Item {i}",
            "price": 100000 + i,
            "gender": "male",
            "category_id": category.id,
            "variants": STOCKED,
            "is_active": True,
        }
        created = client.post(PRODUCTS, json=body)
        assert created.status_code == 201, created.text
        assert client.patch(f"{PRODUCTS}/{created.json()['id']}", json={"is_active": True}).status_code == 200


def statements_for(client, url, **params):
    with count_statements() as seen:
        response = client.get(url, params=params)
    assert response.status_code == 200, response.text[:200]
    return len(seen), response.json()


# --------------------------------------------------------------------- N+1


def test_product_listing_query_count_does_not_grow_with_the_catalogue(client, db_session, mock_admin_auth):
    add_products(client, db_session, 3)
    few, _ = statements_for(client, PRODUCTS, limit=100)
    add_products(client, db_session, 25, start=3)
    many, body = statements_for(client, PRODUCTS, limit=100)
    assert len(body["items"]) == 28
    assert many <= few + 2, f"N+1: {few} statements for 3 products, {many} for 28"


def test_admin_product_listing_query_count_is_flat(client, db_session, mock_admin_auth):
    add_products(client, db_session, 3)
    few, _ = statements_for(client, PRODUCTS, limit=100, is_active="true")
    add_products(client, db_session, 20, start=3)
    many, _ = statements_for(client, PRODUCTS, limit=100, is_active="true")
    assert many <= few + 2, f"N+1: {few} vs {many}"


def test_product_detail_query_count_does_not_grow_with_variants(client, db_session, mock_admin_auth):
    small, _ = make_product(client, db_session, variants=STOCKED, active=True, name="Small")
    few, _ = statements_for(client, f"{PRODUCTS}/{small['id']}")
    matrix = {"sizes": [f"s{i}" for i in range(10)], "colors": [{"name": f"c{i}"} for i in range(10)]}
    assert client.post(f"{PRODUCTS}/{small['id']}/variants/bulk", json=matrix).status_code in (200, 201)
    many, _ = statements_for(client, f"{PRODUCTS}/{small['id']}")
    assert db_session.query(ProductVariant).filter_by(product_id=small["id"]).count() >= 100
    assert many <= few + 2, f"N+1 over variants: {few} vs {many}"


def test_category_listing_and_tree_do_not_query_per_row(client, db_session):
    for i in range(3):
        make_category(db_session, slug=f"c{i}")
    few_list, _ = statements_for(client, CATEGORIES)
    few_tree, _ = statements_for(client, f"{CATEGORIES}/tree")
    for i in range(3, 40):
        make_category(db_session, slug=f"c{i}")
    many_list, _ = statements_for(client, CATEGORIES, limit=100)
    many_tree, _ = statements_for(client, f"{CATEGORIES}/tree")
    assert many_list <= few_list + 2
    assert many_tree <= few_tree + 2


def test_variant_lookup_is_one_query_set_not_one_per_id(client, db_session, mock_admin_auth):
    add_products(client, db_session, 2)
    few, _ = statements_for(client, f"{PRODUCTS}/variants/lookup", ids="1,2")
    add_products(client, db_session, 10, start=2)
    ids = ",".join(str(i) for i in range(1, 41))
    many, _ = statements_for(client, f"{PRODUCTS}/variants/lookup", ids=ids)
    assert many <= few + 2, f"N+1: {few} vs {many}"


def test_admin_order_listing_does_not_query_per_order(client, db_session, mock_admin_auth, mock_user_auth):
    add_products(client, db_session, 2)

    def place_orders(n):
        for _ in range(n):
            limiter.reset()  # this test is about query counts, not throttling
            body = {**SHIPPING, "payment_method": "cod", "items": [{"variant_id": 1, "quantity": 1}, {"variant_id": 2, "quantity": 1}]}
            assert client.post(f"{ORDERS}/checkout-cart", json=body).status_code in (200, 201)

    place_orders(2)
    few, _ = statements_for(client, ORDERS, limit=100)
    place_orders(15)
    many, body = statements_for(client, ORDERS, limit=100)
    assert body["total"] >= 17
    assert many <= few + 2, f"N+1: {few} vs {many}"


# --------------------------------------------------------------------- never unbounded


def test_listings_return_at_most_one_page_however_much_data_exists(client, db_session, mock_admin_auth):
    add_products(client, db_session, 30)
    page = client.get(PRODUCTS, params={"limit": 7}).json()
    assert len(page["items"]) == 7
    assert page["total"] == 30
    tail = client.get(PRODUCTS, params={"limit": 7, "offset": 28}).json()
    assert len(tail["items"]) == 2
    assert client.get(PRODUCTS, params={"offset": 10**6}).json()["items"] == []


def test_paging_is_stable_and_has_no_overlap(client, db_session, mock_admin_auth):
    add_products(client, db_session, 12)
    seen = []
    for offset in range(0, 12, 5):
        seen += [p["id"] for p in client.get(PRODUCTS, params={"limit": 5, "offset": offset, "sort": "price_asc"}).json()["items"]]
    assert len(seen) == len(set(seen)) == 12


def test_every_sort_option_runs_and_is_deterministic(client, db_session, mock_admin_auth):
    add_products(client, db_session, 6)
    for sort in ("latest", "price_asc", "price_desc", "stock_asc", "stock_desc", "sold_desc", "name_asc"):
        first = [p["id"] for p in client.get(PRODUCTS, params={"sort": sort}).json()["items"]]
        second = [p["id"] for p in client.get(PRODUCTS, params={"sort": sort}).json()["items"]]
        assert first == second, sort


@pytest.mark.parametrize("sort", ["id; DROP TABLE products", "price_asc,name", "(select 1)", "", "latest ", "__class__"])
def test_sort_is_a_closed_set(client, sort):
    assert client.get(PRODUCTS, params={"sort": sort}).status_code == 422


# --------------------------------------------------------------------- injection


PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE products; --",
    "\" OR \"\"=\"",
    "1 UNION SELECT username, password_hash, 1, 1, 1 FROM users --",
    "%' AND 1=1 AND '%'='",
    "\\' OR 1=1 --",
    "admin'--",
    "1; SELECT sqlite_version()",
    "' || (SELECT password_hash FROM users LIMIT 1) || '",
]


def table_count(db, name):
    return db.execute(text(f"SELECT count(*) FROM {name}")).scalar()  # noqa: S608 (fixed table names)


@pytest.mark.parametrize("payload", PAYLOADS)
def test_filters_treat_payloads_as_plain_text(client, db_session, mock_admin_auth, payload):
    add_products(client, db_session, 3)
    before = table_count(db_session, "products")
    for key in ("search", "brand", "size", "color", "gender", "category_id", "min_price", "stock_status"):
        response = client.get(PRODUCTS, params={key: payload})
        assert response.status_code < 500, (key, response.status_code, response.text[:150])
        if response.status_code == 200:
            assert response.json()["items"] == [], key
    assert table_count(db_session, "products") == before


@pytest.mark.parametrize("payload", PAYLOADS)
def test_login_and_register_payloads_do_not_bypass_auth(client, payload):
    assert client.post(f"{USERS}/login", json={"identifier": payload, "password": payload}).status_code in (401, 422, 429)
    response = client.post(f"{USERS}/register", json={"username": payload, "email": "x@example.com", "password": "longenough1"})
    assert response.status_code < 500


@pytest.mark.parametrize("payload", PAYLOADS)
def test_writes_store_payloads_as_data(client, db_session, mock_admin_auth, payload):
    made = client.post(CATEGORIES, json={"name": payload[:100]})
    assert made.status_code < 500
    product = client.post(PRODUCTS, json={"name": payload[:100] or "x", "price": 1, "gender": "male", "brand": payload[:100]})
    assert product.status_code < 500
    assert table_count(db_session, "products") <= 1
    assert table_count(db_session, "users") >= 1  # the users table is untouched


@pytest.mark.parametrize("payload", PAYLOADS)
def test_ids_and_skus_in_urls_and_lookups_are_inert(client, mock_admin_auth, payload):
    for url in (f"{PRODUCTS}/{payload}", f"{VARIANTS}/{payload}", f"{CATEGORIES}/{payload}", f"{ORDERS}/{payload}"):
        assert client.get(url).status_code < 500, url
    assert client.get(f"{PRODUCTS}/variants/lookup", params={"skus": payload}).status_code < 500
    assert client.get(f"{PRODUCTS}/variants/lookup", params={"ids": payload}).status_code < 500


def test_like_wildcards_in_search_are_escaped(client, db_session, mock_admin_auth):
    add_products(client, db_session, 2)
    assert client.get(PRODUCTS, params={"search": "%"}).json()["items"] == []
    assert client.get(PRODUCTS, params={"search": "_tem"}).json()["items"] == []
    assert len(client.get(PRODUCTS, params={"search": "item"}).json()["items"]) == 2


# --------------------------------------------------------------------- static audit of the source


def source_files():
    return [p for p in APP.rglob("*.py") if "migrations" not in p.parts and "__pycache__" not in p.parts]


def test_no_sql_is_built_from_strings():
    offenders = []
    patterns = [
        re.compile(r"""(?:execute|text|exec_driver_sql)\(\s*f["']"""),
        re.compile(r"""(?:execute|text|exec_driver_sql)\(\s*["'][^"']*["']\s*(?:%|\+|\.format)"""),
        re.compile(r"""(?:SELECT|INSERT|UPDATE|DELETE)\s[^\n"']*["']\s*(?:%|\+)\s*\w""", re.IGNORECASE),
    ]
    for path in source_files():
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if any(p.search(line) for p in patterns):
                offenders.append(f"{path.relative_to(APP)}:{number}: {line.strip()[:100]}")
    assert not offenders, "SQL built from strings:\n" + "\n".join(offenders)


def test_every_raw_text_statement_is_constant():
    for path in source_files():
        for line in path.read_text(encoding="utf-8").splitlines():
            for call in re.findall(r"text\(([^)]*)\)", line):
                assert re.fullmatch(r"""["'][^"'{}%]*["']""", call.strip()), f"{path.name}: {line.strip()}"


def test_user_facing_services_do_not_load_whole_tables():
    """Full-table `.all()` loads are only allowed in the explicitly listed places."""
    allowed = {
        "products/service.py": "facet lists and slug uniqueness",
        "categories/service.py": "category tree and slug uniqueness",
        "products/variant_service.py": "sku uniqueness for one product",
    }
    unbounded = []
    for path in source_files():
        if "service" not in path.name:
            continue
        rel = path.relative_to(APP / "features").as_posix() if "features" in path.parts else path.name
        lines = path.read_text(encoding="utf-8").splitlines()
        for number, line in enumerate(lines, 1):
            if ".all()" in line:
                window = "\n".join(lines[max(0, number - 12) : number])
                if not re.search(r"\.(limit|in_|filter|where)\(", window):
                    unbounded.append((rel, number))
    flagged = [f"{rel}:{n}" for rel, n in unbounded if rel not in allowed]
    assert not flagged, "unfiltered .all() in: " + ", ".join(flagged)


def test_bulk_variant_creation_does_not_read_every_sku_in_the_shop(client, db_session, mock_admin_auth):
    add_products(client, db_session, 3)
    created, _ = make_product(client, db_session, name="Target", variants=STOCKED)
    body = {"sizes": ["XS"], "colors": [{"name": "Green"}]}
    with count_statements() as seen:
        assert client.post(f"{PRODUCTS}/{created['id']}/variants/bulk", json=body).status_code in (200, 201)
    sku_reads = [q for q in seen if q.lstrip().upper().startswith("SELECT PRODUCT_VARIANTS.SKU ")]
    assert sku_reads, "expected a SKU collision check"
    assert all(" WHERE " in " ".join(q.upper().split()) for q in sku_reads), "unfiltered SKU read loads the whole table"


def test_bulk_variants_still_get_unique_skus_when_another_product_shares_the_name_prefix(client, db_session, mock_admin_auth):
    first, _ = make_product(client, db_session, name="Polo", variants=STOCKED)
    second = client.post(PRODUCTS, json={"name": "Polo", "price": 1, "gender": "male", "variants": STOCKED}).json()
    skus = [v.sku for v in db_session.query(ProductVariant).all()]
    assert len(skus) == len(set(skus)) == 4
    assert first["id"] != second["id"]
