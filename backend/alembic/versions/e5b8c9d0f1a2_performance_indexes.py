"""add performance composite and fulltext indexes

Revision ID: e5b8c9d0f1a2
Revises: d4a7c8e91f23
Create Date: 2026-10-12 22:15:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5b8c9d0f1a2'
down_revision: Union[str, None] = 'd4a7c8e91f23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Base FK indexes to prevent InnoDB from locking composite indexes for FK enforcement
    try:
        op.create_index('ix_orders_user_id', 'orders', ['user_id'], unique=False)
    except Exception:
        pass
    try:
        op.create_index('ix_products_category_id', 'products', ['category_id'], unique=False)
    except Exception:
        pass

    # 2. Composite indexes on orders
    op.create_index(
        'ix_orders_user_status',
        'orders',
        ['user_id', 'status'],
        unique=False,
    )
    op.create_index(
        'ix_orders_status_created_at',
        'orders',
        ['status', 'created_at'],
        unique=False,
    )
    op.create_index(
        'ix_orders_status_expires_at',
        'orders',
        ['status', 'expires_at'],
        unique=False,
    )

    # 3. Composite catalog index on products
    op.create_index(
        'ix_products_cat_active_price',
        'products',
        ['category_id', 'is_active', 'price'],
        unique=False,
    )

    # 4. FULLTEXT index for MariaDB/MySQL text search
    if bind.dialect.name in ('mysql', 'mariadb'):
        try:
            op.execute(
                'ALTER TABLE products ADD FULLTEXT INDEX IF NOT EXISTS ix_products_name_desc_ft (name, description)'
            )
        except Exception:
            try:
                op.execute(
                    'ALTER TABLE products ADD FULLTEXT INDEX ix_products_name_desc_ft (name, description)'
                )
            except Exception:
                pass


def downgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name in ('mysql', 'mariadb'):
        try:
            op.execute('ALTER TABLE products DROP INDEX IF EXISTS ix_products_name_desc_ft')
        except Exception:
            pass

    for idx_name, table in [
        ('ix_products_cat_active_price', 'products'),
        ('ix_orders_status_expires_at', 'orders'),
        ('ix_orders_status_created_at', 'orders'),
        ('ix_orders_user_status', 'orders'),
    ]:
        try:
            op.drop_index(idx_name, table_name=table)
        except Exception:
            pass
