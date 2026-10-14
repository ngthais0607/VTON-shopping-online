from app.features.products.model import Product
from app.features.products.schemas import ProductFilters, ProductSort
from app.features.products.service import list_products
from app.features.products.variant_model import ProductVariant


def _make_product_with_variants(
    db_session,
    name: str,
    base_price: float,
    variants_data: list[dict],
    is_active: bool = True,
) -> Product:
    prod = Product(
        name=name,
        slug=name.lower().replace(" ", "-"),
        price=base_price,
        currency="VND",
        is_active=is_active,
    )
    db_session.add(prod)
    db_session.flush()

    for idx, vdata in enumerate(variants_data):
        v = ProductVariant(
            product_id=prod.id,
            sku=f"{prod.slug}-var-{idx}",
            size=vdata.get("size", f"SIZE_{idx}"),
            color_name=vdata.get("color_name", f"COLOR_{idx}"),
            price=vdata.get("price"),
            stock_quantity=vdata.get("stock_quantity", 10),
            reserved_quantity=0,
            sold_quantity=0,
            is_active=vdata.get("is_active", True),
        )
        db_session.add(v)

    db_session.commit()
    db_session.refresh(prod)
    return prod


def test_variant_price_filtering_matches_minimum_active_variant(db_session):
    # P1: base 100k, variant 50k -> effective price 50k
    p1 = _make_product_with_variants(
        db_session,
        "Product P1",
        100000.0,
        [{"price": 50000.0, "is_active": True}, {"price": 120000.0, "is_active": True}],
    )
    # P2: base 70k, no variant price override -> effective price 70k
    p2 = _make_product_with_variants(
        db_session,
        "Product P2",
        70000.0,
        [{"price": None, "is_active": True}],
    )
    # P3: base 100k, inactive variant 30k, active variant 80k -> effective price 80k
    p3 = _make_product_with_variants(
        db_session,
        "Product P3",
        100000.0,
        [{"price": 30000.0, "is_active": False}, {"price": 80000.0, "is_active": True}],
    )

    # Filter 40k to 60k: should match only P1 (effective price 50k)
    filters = ProductFilters(min_price=40000.0, max_price=60000.0)
    page = list_products(db_session, filters, is_admin=False)
    matched_ids = [p.id for p in page.items]
    assert matched_ids == [p1.id]
    assert page.total == 1

    # Filter 65k to 75k: should match only P2 (effective price 70k)
    filters_p2 = ProductFilters(min_price=65000.0, max_price=75000.0)
    page_p2 = list_products(db_session, filters_p2, is_admin=False)
    assert [p.id for p in page_p2.items] == [p2.id]
    assert page_p2.total == 1

    # Inactive variant 30k does not match 20k to 40k
    filters_inactive = ProductFilters(min_price=20000.0, max_price=40000.0)
    page_inactive = list_products(db_session, filters_inactive, is_admin=False)
    assert p3.id not in [p.id for p in page_inactive.items]


def test_variant_price_sorting_orders_by_effective_price_with_stable_tie_break(db_session):
    p_cheap_var = _make_product_with_variants(
        db_session,
        "Cheap Variant Prod",
        100000.0,
        [{"price": 40000.0, "is_active": True}],
    )
    p_mid = _make_product_with_variants(
        db_session,
        "Mid Price Prod",
        60000.0,
        [{"price": None, "is_active": True}],
    )
    p_high = _make_product_with_variants(
        db_session,
        "High Price Prod",
        90000.0,
        [{"price": None, "is_active": True}],
    )

    # Sort asc: should be p_cheap_var (40k), p_mid (60k), p_high (90k)
    filters_asc = ProductFilters(sort=ProductSort.PRICE_ASC)
    page_asc = list_products(db_session, filters_asc, is_admin=False)
    page_asc_ids = [p.id for p in page_asc.items if p.id in (p_cheap_var.id, p_mid.id, p_high.id)]
    assert page_asc_ids == [p_cheap_var.id, p_mid.id, p_high.id]

    # Sort desc: should be p_high (90k), p_mid (60k), p_cheap_var (40k)
    filters_desc = ProductFilters(sort=ProductSort.PRICE_DESC)
    page_desc = list_products(db_session, filters_desc, is_admin=False)
    page_desc_ids = [p.id for p in page_desc.items if p.id in (p_cheap_var.id, p_mid.id, p_high.id)]
    assert page_desc_ids == [p_high.id, p_mid.id, p_cheap_var.id]


def test_size_filter_preserves_overall_product_effective_price(db_session):
    # P1 has size L (100k) and size S (50k)
    p1 = _make_product_with_variants(
        db_session,
        "Multi-size Prod",
        100000.0,
        [
            {"price": 50000.0, "size": "S", "is_active": True},
            {"price": 100000.0, "size": "L", "is_active": True},
        ],
    )

    # When filtering by size=L: P1 matches the size filter.
    # Its effective price remains MIN(50k, 100k) = 50k.
    # So if min_price=40k and max_price=60k, it still matches.
    filters = ProductFilters(size=["L"], min_price=40000.0, max_price=60000.0)
    page = list_products(db_session, filters, is_admin=False)
    assert p1.id in [p.id for p in page.items]
    assert page.total == 1


def test_admin_product_without_active_variants_falls_back_to_base_price(db_session):
    p_draft = Product(
        name="Draft Product",
        slug="draft-product",
        price=150000.0,
        currency="VND",
        is_active=False,
    )
    db_session.add(p_draft)
    db_session.commit()
    db_session.refresh(p_draft)

    # As admin, filtering by 140k-160k should match p_draft using its base price
    filters = ProductFilters(min_price=140000.0, max_price=160000.0)
    page = list_products(db_session, filters, is_admin=True)
    assert p_draft.id in [p.id for p in page.items]
