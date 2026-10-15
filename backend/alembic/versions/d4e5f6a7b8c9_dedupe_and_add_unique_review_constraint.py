"""dedupe reviews and add unique review constraint

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-14 14:00:00.000000
"""

from datetime import datetime
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    product_reviews = sa.Table("product_reviews", metadata, autoload_with=bind)
    rows = bind.execute(
        sa.select(
            product_reviews.c.id,
            product_reviews.c.user_id,
            product_reviews.c.product_id,
            product_reviews.c.created_at,
        )
    ).fetchall()

    seen = {}
    to_delete = []
    for r in rows:
        key = (r.user_id, r.product_id)
        if key not in seen:
            seen[key] = r
        else:
            prev = seen[key]
            prev_dt = prev.created_at or datetime.min
            curr_dt = r.created_at or datetime.min
            if (curr_dt > prev_dt) or (curr_dt == prev_dt and r.id > prev.id):
                to_delete.append(prev.id)
                seen[key] = r
            else:
                to_delete.append(r.id)

    if to_delete:
        bind.execute(
            product_reviews.delete().where(product_reviews.c.id.in_(to_delete))
        )

    with op.batch_alter_table("product_reviews") as batch_op:
        batch_op.create_unique_constraint(
            "uq_product_reviews_user_product",
            ["user_id", "product_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("product_reviews") as batch_op:
        batch_op.drop_constraint("uq_product_reviews_user_product", type_="unique")
