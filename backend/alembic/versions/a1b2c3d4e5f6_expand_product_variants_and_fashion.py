"""expand product variants and fashion attributes

Revision ID: a1b2c3d4e5f6
Revises: f7c2a1b9e8d3
Create Date: 2026-10-13 14:15:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op
from app.core.slug import generate_unique_slug

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f7c2a1b9e8d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create product_variants table
    op.create_table(
        'product_variants',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('sku', sa.String(length=64), nullable=False),
        sa.Column('size', sa.String(length=20), server_default='ONE_SIZE', nullable=False),
        sa.Column('color_name', sa.String(length=50), server_default='Default', nullable=False),
        sa.Column('color_hex', sa.String(length=7), nullable=True),
        sa.Column('price', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('stock_quantity', sa.Integer(), server_default='0', nullable=False),
        sa.Column('reserved_quantity', sa.Integer(), server_default='0', nullable=False),
        sa.Column('sold_quantity', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], name='fk_variants_product_id'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sku', name='uq_product_variants_sku'),
        sa.UniqueConstraint('product_id', 'size', 'color_name', name='uq_variants_product_size_color'),
        sa.CheckConstraint('stock_quantity >= 0', name='ck_variants_stock_non_negative'),
        sa.CheckConstraint('reserved_quantity >= 0', name='ck_variants_reserved_non_negative'),
        sa.CheckConstraint('sold_quantity >= 0', name='ck_variants_sold_non_negative'),
        sa.CheckConstraint('reserved_quantity + sold_quantity <= stock_quantity', name='ck_variants_reserved_sold_lte_stock')
    )
    op.create_index('ix_product_variants_id', 'product_variants', ['id'], unique=False)
    op.create_index('ix_product_variants_product_id', 'product_variants', ['product_id'], unique=False)
    op.create_index('ix_product_variants_product_active', 'product_variants', ['product_id', 'is_active'], unique=False)
    op.create_index('ix_product_variants_sku', 'product_variants', ['sku'], unique=False)
    op.create_index('ix_product_variants_is_active', 'product_variants', ['is_active'], unique=False)

    # 2. Add columns to products
    op.add_column('products', sa.Column('slug', sa.String(length=255), nullable=True))
    op.add_column('products', sa.Column('brand', sa.String(length=100), nullable=True))
    op.add_column('products', sa.Column('gender', sa.String(length=20), server_default='unisex', nullable=False))
    op.add_column('products', sa.Column('material', sa.String(length=255), nullable=True))
    op.add_column('products', sa.Column('fit', sa.String(length=50), nullable=True))
    op.add_column('products', sa.Column('care_instructions', sa.String(length=500), nullable=True))
    op.add_column('products', sa.Column('size_chart', sa.JSON(), nullable=True))
    op.create_index('ix_products_slug', 'products', ['slug'], unique=True)
    op.create_index('ix_products_gender_active', 'products', ['gender', 'is_active'], unique=False)

    # 3. Add columns to categories
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.add_column(sa.Column('slug', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('parent_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_categories_parent_id', 'categories', ['parent_id'], ['id'])
        batch_op.create_index('ix_categories_slug', ['slug'], unique=True)
        batch_op.create_index('ix_categories_parent_id', ['parent_id'], unique=False)

    # 4. Add columns to product_images
    op.add_column('product_images', sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False))
    op.add_column('product_images', sa.Column('is_primary', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('product_images', sa.Column('color_name', sa.String(length=50), nullable=True))
    op.add_column('product_images', sa.Column('kind', sa.String(length=30), server_default='model_photo', nullable=False))

    # 5. Add columns to order_items
    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('variant_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('sku', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('size', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('color_name', sa.String(length=50), nullable=True))
        batch_op.create_foreign_key('fk_order_items_variant_id', 'product_variants', ['variant_id'], ['id'])
        batch_op.create_index('ix_order_items_variant_id', ['variant_id'], unique=False)


    # 6. Add column to product_reviews
    op.add_column('product_reviews', sa.Column('fit_feedback', sa.String(length=20), nullable=True))

    # 7. Data Backfill
    bind = op.get_bind()

    # Backfill categories slug
    cats = bind.execute(sa.text("SELECT id, name FROM categories ORDER BY id ASC")).fetchall()
    cat_slugs: set[str] = set()
    for cat_id, cat_name in cats:
        c_slug = generate_unique_slug(cat_name, cat_slugs)
        cat_slugs.add(c_slug)
        bind.execute(
            sa.text("UPDATE categories SET slug = :slug WHERE id = :id"),
            {"slug": c_slug, "id": cat_id}
        )

    # Backfill products slug and create default ProductVariant
    prods = bind.execute(sa.text(
        "SELECT id, name, stock_quantity, reserved_quantity, sold_quantity, is_active, created_at, updated_at FROM products ORDER BY id ASC"
    )).fetchall()
    prod_slugs: set[str] = set()

    for p_id, p_name, p_stock, p_reserved, p_sold, p_active, p_created, p_updated in prods:
        p_slug = generate_unique_slug(p_name, prod_slugs)
        prod_slugs.add(p_slug)
        bind.execute(
            sa.text("UPDATE products SET slug = :slug WHERE id = :id"),
            {"slug": p_slug, "id": p_id}
        )

        variant_sku = f"P{p_id}-DEFAULT"
        bind.execute(
            sa.text(
                """
                INSERT INTO product_variants
                (product_id, sku, size, color_name, stock_quantity, reserved_quantity, sold_quantity, is_active, created_at, updated_at)
                VALUES (:pid, :sku, 'ONE_SIZE', 'Default', :stock, :reserved, :sold, :active, :created, :updated)
                """
            ),
            {
                "pid": p_id,
                "sku": variant_sku,
                "stock": p_stock if p_stock is not None else 0,
                "reserved": p_reserved if p_reserved is not None else 0,
                "sold": p_sold if p_sold is not None else 0,
                "active": p_active if p_active is not None else True,
                "created": p_created,
                "updated": p_updated,
            }
        )

    # Backfill order_items.variant_id and snapshot columns
    if bind.dialect.name == "sqlite":
        bind.execute(
            sa.text(
                """
                UPDATE order_items
                SET variant_id = (SELECT pv.id FROM product_variants pv WHERE pv.product_id = order_items.product_id LIMIT 1),
                    sku = (SELECT pv.sku FROM product_variants pv WHERE pv.product_id = order_items.product_id LIMIT 1),
                    size = 'ONE_SIZE',
                    color_name = 'Default'
                """
            )
        )
    else:
        bind.execute(
            sa.text(
                """
                UPDATE order_items oi
                JOIN product_variants pv ON pv.product_id = oi.product_id AND pv.sku = CONCAT('P', oi.product_id, '-DEFAULT')
                SET oi.variant_id = pv.id,
                    oi.sku = pv.sku,
                    oi.size = 'ONE_SIZE',
                    oi.color_name = 'Default'
                """
            )
        )



def downgrade() -> None:
    # 1. Drop order_items foreign keys and columns
    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.drop_constraint('fk_order_items_variant_id', type_='foreignkey')
        batch_op.drop_index('ix_order_items_variant_id')
        batch_op.drop_column('color_name')
        batch_op.drop_column('size')
        batch_op.drop_column('sku')
        batch_op.drop_column('variant_id')

    # 2. Drop product_reviews fit_feedback
    op.drop_column('product_reviews', 'fit_feedback')

    # 3. Drop product_images columns
    op.drop_column('product_images', 'kind')
    op.drop_column('product_images', 'color_name')
    op.drop_column('product_images', 'is_primary')
    op.drop_column('product_images', 'sort_order')

    # 4. Drop categories columns & foreign key
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.drop_constraint('fk_categories_parent_id', type_='foreignkey')
        batch_op.drop_index('ix_categories_parent_id')
        batch_op.drop_index('ix_categories_slug')
        batch_op.drop_column('parent_id')
        batch_op.drop_column('slug')


    # 5. Drop products columns & indexes
    op.drop_index('ix_products_gender_active', table_name='products')
    op.drop_index('ix_products_slug', table_name='products')
    op.drop_column('products', 'size_chart')
    op.drop_column('products', 'care_instructions')
    op.drop_column('products', 'fit')
    op.drop_column('products', 'material')
    op.drop_column('products', 'gender')
    op.drop_column('products', 'brand')
    op.drop_column('products', 'slug')

    # 6. Drop product_variants table
    op.drop_table('product_variants')
