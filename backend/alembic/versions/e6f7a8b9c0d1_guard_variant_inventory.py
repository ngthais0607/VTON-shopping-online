"""Guard variant inventory totals without repairing existing data.

Revision ID: e6f7a8b9c0d1
Revises: d4e5f6a7b8c9
"""

import sqlalchemy as sa

from alembic import op

revision = "e6f7a8b9c0d1"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None

NAME = "ck_variants_inventory_bounds"
CHECK = (
    "reserved_quantity >= 0 AND sold_quantity >= 0 "
    "AND reserved_quantity + sold_quantity <= stock_quantity"
)


def upgrade():
    connection = op.get_bind()
    invalid = (
        connection.execute(
            sa.text(
                "SELECT id FROM product_variants WHERE reserved_quantity < 0 "
                "OR sold_quantity < 0 OR reserved_quantity + sold_quantity > stock_quantity "
                "ORDER BY id LIMIT 10"
            )
        )
        .scalars()
        .all()
    )
    if invalid:
        raise RuntimeError(
            "Cannot create inventory CHECK constraint: product_variants "
            f"contain inconsistent inventory (sample IDs: {invalid}). "
            "Reconcile these rows explicitly before retrying; no data was changed."
        )
    with op.batch_alter_table("product_variants") as batch:
        batch.create_check_constraint(NAME, CHECK)


def downgrade():
    with op.batch_alter_table("product_variants") as batch:
        batch.drop_constraint(NAME, type_="check")
