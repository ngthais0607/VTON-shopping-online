"""add order fulfillment fields

Revision ID: c91f8a4e2b10
Revises: 6ea70e2e94f1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c91f8a4e2b10"
down_revision: Union[str, None] = "6ea70e2e94f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(sa.Column("customer_name", sa.String(255), nullable=False))
        batch_op.add_column(sa.Column("customer_phone", sa.String(50), nullable=False))
        batch_op.add_column(sa.Column("shipping_address", sa.String(1000), nullable=False))
        batch_op.add_column(sa.Column("notes", sa.String(2000), nullable=True))
        batch_op.add_column(sa.Column("payment_method", sa.String(20), nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_column("payment_method")
        batch_op.drop_column("notes")
        batch_op.drop_column("shipping_address")
        batch_op.drop_column("customer_phone")
        batch_op.drop_column("customer_name")
