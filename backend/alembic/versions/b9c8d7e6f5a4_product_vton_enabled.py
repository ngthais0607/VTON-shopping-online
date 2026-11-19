"""Per-product virtual try-on switch.

Revision ID: b9c8d7e6f5a4
Revises: a7d3e1f9c2b4
"""

import sqlalchemy as sa

from alembic import op

revision = "b9c8d7e6f5a4"
down_revision = "a7d3e1f9c2b4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "products",
        sa.Column(
            "vton_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade():
    op.drop_column("products", "vton_enabled")
