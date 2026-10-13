"""enforce orders public_code not null

Revision ID: f7c2a1b9e8d3
Revises: e5b8c9d0f1a2
Create Date: 2026-10-13 10:30:00.000000

"""
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f7c2a1b9e8d3'
down_revision: Union[str, None] = 'e5b8c9d0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # Defensive backfill for any legacy rows that might lack a public_code
    orders_table = sa.table(
        "orders",
        sa.column("id", sa.Integer),
        sa.column("public_code", sa.String),
    )
    null_rows = bind.execute(
        sa.select(orders_table.c.id).where(orders_table.c.public_code.is_(None))
    ).fetchall()

    for row in null_rows:
        bind.execute(
            orders_table.update()
            .where(orders_table.c.id == row[0])
            .values(public_code=uuid4().hex)
        )

    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.alter_column(
            "public_code",
            existing_type=sa.String(36),
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.alter_column(
            "public_code",
            existing_type=sa.String(36),
            nullable=True,
        )
