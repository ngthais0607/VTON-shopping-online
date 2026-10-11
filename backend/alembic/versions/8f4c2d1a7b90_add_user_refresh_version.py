"""add a dedicated durable version for refresh token rotation

Revision ID: 8f4c2d1a7b90
Revises: c91f8a4e2b10
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "8f4c2d1a7b90"
down_revision: Union[str, None] = "c91f8a4e2b10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column(
                "refresh_version",
                sa.BigInteger(),
                nullable=False,
                server_default="0",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("refresh_version")
