"""contract drop product stock and paddle columns

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-13 15:30:00.000000
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

logger = logging.getLogger("alembic.runtime.migration")

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    # Preflight Check 1: order_items variant snapshot columns must not be NULL
    invalid_oi = bind.execute(sa.text(
        "SELECT id FROM order_items WHERE variant_id IS NULL OR sku IS NULL OR size IS NULL OR color_name IS NULL LIMIT 20"
    )).fetchall()
    if invalid_oi:
        ids_str = ", ".join(str(r[0]) for r in invalid_oi)
        raise RuntimeError(
            f"Preflight check failed in b2c3d4e5f6a7: order_items contains NULL in variant snapshot columns (sample IDs: {ids_str}). "
            "Ensure a1b2c3d4e5f6 backfill completed successfully before contracting."
        )

    # Preflight Check 2: categories slug must not be NULL or empty or duplicated
    invalid_cat_slugs = bind.execute(sa.text(
        "SELECT id FROM categories WHERE slug IS NULL OR TRIM(slug) = '' LIMIT 20"
    )).fetchall()
    if invalid_cat_slugs:
        ids_str = ", ".join(str(r[0]) for r in invalid_cat_slugs)
        raise RuntimeError(
            f"Preflight check failed in b2c3d4e5f6a7: categories contains NULL/empty slug (sample IDs: {ids_str})."
        )

    dup_cat_slugs = bind.execute(sa.text(
        "SELECT slug, COUNT(*) FROM categories GROUP BY slug HAVING COUNT(*) > 1 LIMIT 20"
    )).fetchall()
    if dup_cat_slugs:
        slugs_str = ", ".join(f"'{r[0]}' ({r[1]}x)" for r in dup_cat_slugs)
        raise RuntimeError(
            f"Preflight check failed in b2c3d4e5f6a7: duplicate slugs found in categories: {slugs_str}."
        )

    # Preflight Check 3: products slug must not be NULL or empty or duplicated
    invalid_prod_slugs = bind.execute(sa.text(
        "SELECT id FROM products WHERE slug IS NULL OR TRIM(slug) = '' LIMIT 20"
    )).fetchall()
    if invalid_prod_slugs:
        ids_str = ", ".join(str(r[0]) for r in invalid_prod_slugs)
        raise RuntimeError(
            f"Preflight check failed in b2c3d4e5f6a7: products contains NULL/empty slug (sample IDs: {ids_str})."
        )

    dup_prod_slugs = bind.execute(sa.text(
        "SELECT slug, COUNT(*) FROM products GROUP BY slug HAVING COUNT(*) > 1 LIMIT 20"
    )).fetchall()
    if dup_prod_slugs:
        slugs_str = ", ".join(f"'{r[0]}' ({r[1]}x)" for r in dup_prod_slugs)
        raise RuntimeError(
            f"Preflight check failed in b2c3d4e5f6a7: duplicate slugs found in products: {slugs_str}."
        )

    # 1. Enforce NOT NULL on order_items variant snapshots
    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.alter_column('variant_id', existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column('sku', existing_type=sa.String(length=64), nullable=False)
        batch_op.alter_column('size', existing_type=sa.String(length=20), nullable=False)
        batch_op.alter_column('color_name', existing_type=sa.String(length=50), nullable=False)

    # 2. Enforce NOT NULL on slugs
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.alter_column('slug', existing_type=sa.String(length=255), nullable=False)

    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.alter_column('slug', existing_type=sa.String(length=255), nullable=False)

        # 3. Drop check constraints if present and legacy columns on products
        if not is_sqlite:
            inspector = sa.inspect(bind)
            existing_checks = {c['name'] for c in inspector.get_check_constraints('products')}
            for ck in ['ck_products_stock_quantity_nonneg', 'ck_products_reserved_quantity_nonneg', 'ck_products_sold_quantity_nonneg']:
                if ck in existing_checks:
                    batch_op.drop_constraint(ck, type_='check')

        batch_op.drop_column('stock_quantity')
        batch_op.drop_column('reserved_quantity')
        batch_op.drop_column('sold_quantity')
        batch_op.drop_column('paddle_product_id')
        batch_op.drop_column('paddle_price_id')


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    # 1. Re-add legacy columns to products
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.add_column(sa.Column('stock_quantity', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('reserved_quantity', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('sold_quantity', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('paddle_product_id', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('paddle_price_id', sa.String(length=100), nullable=True))
        batch_op.alter_column('slug', existing_type=sa.String(length=255), nullable=True)

        if not is_sqlite:
            batch_op.create_check_constraint('ck_products_stock_quantity_nonneg', 'stock_quantity >= 0')
            batch_op.create_check_constraint('ck_products_reserved_quantity_nonneg', 'reserved_quantity >= 0')
            batch_op.create_check_constraint('ck_products_sold_quantity_nonneg', 'sold_quantity >= 0')

    # 2. Backfill aggregated variant stock to products
    bind.execute(
        sa.text(
            """
            UPDATE products p
            SET stock_quantity = COALESCE((SELECT SUM(stock_quantity) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = 1), 0),
                reserved_quantity = COALESCE((SELECT SUM(reserved_quantity) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = 1), 0),
                sold_quantity = COALESCE((SELECT SUM(sold_quantity) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = 1), 0)
            """
        )
    )

    # 3. Relax slug & snapshot column constraints
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.alter_column('slug', existing_type=sa.String(length=255), nullable=True)

    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.alter_column('variant_id', existing_type=sa.Integer(), nullable=True)
        batch_op.alter_column('sku', existing_type=sa.String(length=64), nullable=True)
        batch_op.alter_column('size', existing_type=sa.String(length=20), nullable=True)
        batch_op.alter_column('color_name', existing_type=sa.String(length=50), nullable=True)
