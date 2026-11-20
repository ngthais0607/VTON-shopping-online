"""Original price for sale display.

Revision ID: c1d2e3f4a5b6
Revises: b9c8d7e6f5a4
"""

import sqlalchemy as sa

from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "b9c8d7e6f5a4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("compare_at_price", sa.Numeric(12, 2), nullable=True))


def downgrade():
    op.drop_column("products", "compare_at_price")
