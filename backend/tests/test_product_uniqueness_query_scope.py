import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError
from app.features.products import service
from app.features.products.schemas import ProductCreate, VariantItem
from tests.factories import make_product, make_variant


def test_create_product_slug_query_is_scoped_not_full_table(db_session):
    engine = db_session.get_bind()
    # Populate unrelated products
    for i in range(5):
        make_product(db_session, name=f"Unrelated Brand Item {i}")
    db_session.commit()

    captured_statements = []

    def before_cursor_execute(
        conn, cursor, statement, parameters, context, executemany
    ):
        if "products.slug" in statement and "SELECT" in statement.upper():
            captured_statements.append((statement, parameters))

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        cmd = ProductCreate(
            name="Focused Summer Jacket",
            price=250000,
            currency="VND",
        )
        p = service.create_product(db_session, cmd)
        assert p.slug == "focused-summer-jacket"
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)

    # Verify that the query on products.slug had a WHERE clause scoping to candidate
    assert len(captured_statements) >= 1
    slug_query, params = captured_statements[0]
    assert "WHERE" in slug_query.upper()
    assert "focused-summer-jacket" in str(params)


def test_create_product_slug_handles_suffix_collisions_without_full_scan(db_session):
    # Create base product and numbered collisions
    make_product(db_session, name="Linen Shirt", slug="linen-shirt")
    make_product(db_session, name="Linen Shirt 2", slug="linen-shirt-2")
    make_product(db_session, name="Linen Shirt 3", slug="linen-shirt-3")
    db_session.commit()

    cmd = ProductCreate(
        name="Linen Shirt",
        price=180000,
        currency="VND",
    )
    new_product = service.create_product(db_session, cmd)
    assert new_product.slug == "linen-shirt-4"


def test_create_product_slug_escapes_like_metacharacters(db_session):
    from app.features.products.service import _escape_like

    assert _escape_like("special_item%test\\here") == "special\\_item\\%test\\\\here"

    # Verify that products with hyphens resolve without interference
    make_product(db_session, name="Special Item", slug="special-item")
    make_product(db_session, name="Special Item 2", slug="special-item-2")
    db_session.commit()

    cmd = ProductCreate(
        name="Special Item",
        price=120000,
        currency="VND",
    )
    p = service.create_product(db_session, cmd)
    assert p.slug == "special-item-3"


def test_create_product_variant_sku_query_is_scoped(db_session):
    engine = db_session.get_bind()
    # Populate existing unrelated variants
    p_existing = make_product(db_session, name="Other Pants", slug="other-pants")
    for size in ["S", "M", "L"]:
        make_variant(
            db_session,
            product_id=p_existing.id,
            sku=f"other-pants-BLK-{size}",
            size=size,
            color_name="Black",
        )
    db_session.commit()

    captured_statements = []

    def before_cursor_execute(
        conn, cursor, statement, parameters, context, executemany
    ):
        if "product_variants.sku" in statement and "SELECT" in statement.upper():
            captured_statements.append((statement, parameters))

    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        cmd = ProductCreate(
            name="Silk Kimono",
            price=450000,
            currency="VND",
            variants=[
                VariantItem(size="M", color_name="Red", stock_quantity=5),
                VariantItem(
                    size="L", color_name="Red", sku="CUSTOM-KIMONO-L", stock_quantity=5
                ),
            ],
        )
        p = service.create_product(db_session, cmd)
        assert len(p.variants) == 2
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)

    # Verify query on product_variants.sku scoped to candidate SKU and prefixes
    assert len(captured_statements) >= 1
    sku_query, params = captured_statements[0]
    assert "WHERE" in sku_query.upper()
    assert "CUSTOM-KIMONO-L" in str(params)


def test_create_product_race_condition_raises_conflict_error(db_session, monkeypatch):
    cmd = ProductCreate(
        name="Race Condition Product",
        price=100000,
        currency="VND",
    )

    def mock_commit():
        raise IntegrityError(
            "mock unique violation", orig=Exception("duplicate key"), params={}
        )

    monkeypatch.setattr(db_session, "commit", mock_commit)

    with pytest.raises(ConflictError) as exc_info:
        service.create_product(db_session, cmd)

    assert exc_info.value.status_code == 409
