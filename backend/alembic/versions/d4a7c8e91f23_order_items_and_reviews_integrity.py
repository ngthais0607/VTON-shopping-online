"""add order items, product reviews, and integrity constraints

Revision ID: d4a7c8e91f23
Revises: 8f4c2d1a7b90
"""
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = "d4a7c8e91f23"
down_revision: Union[str, None] = "8f4c2d1a7b90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create product_reviews if not exists
    op.create_table(
        "product_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("comment", sa.String(1000), nullable=True),
        sa.Column("is_verified_purchase", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("product_reviews", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_product_reviews_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_product_reviews_product_id"), ["product_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_product_reviews_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_product_reviews_is_verified_purchase"), ["is_verified_purchase"], unique=False)
        batch_op.create_index(batch_op.f("ix_product_reviews_created_at"), ["created_at"], unique=False)

    # 2. Create order_items
    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("order_items", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_order_items_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_order_items_order_id"), ["order_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_order_items_product_id"), ["product_id"], unique=False)

    # 3. Alter orders: add public_code, allow nullable legacy item columns
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.add_column(sa.Column("public_code", sa.String(36), nullable=True))
        batch_op.alter_column("product_id", existing_type=sa.Integer(), nullable=True)
        batch_op.alter_column("product_name", existing_type=sa.String(255), nullable=True)
        batch_op.alter_column("unit_price", existing_type=sa.Float(), type_=sa.Numeric(12, 2), nullable=True)
        batch_op.alter_column("quantity", existing_type=sa.Integer(), nullable=True)
        batch_op.alter_column("total_amount", existing_type=sa.Float(), type_=sa.Numeric(12, 2), nullable=False)

    # Backfill public_code
    bind = op.get_bind()
    orders_table = sa.table("orders", sa.column("id", sa.Integer), sa.column("public_code", sa.String))
    result = bind.execute(sa.select(orders_table.c.id).where(orders_table.c.public_code.is_(None))).fetchall()
    for row in result:
        bind.execute(
            orders_table.update()
            .where(orders_table.c.id == row[0])
            .values(public_code=uuid4().hex)
        )

    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.alter_column("public_code", existing_type=sa.String(36), nullable=False)
        batch_op.create_index(batch_op.f("ix_orders_public_code"), ["public_code"], unique=True)

    # 4. Data backfill from legacy orders to order_items
    op.execute(
        "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal) "
        "SELECT id, product_id, product_name, unit_price, quantity, (unit_price * quantity) "
        "FROM orders WHERE product_id IS NOT NULL"
    )

    # 5. Alter products price to Numeric(12, 2)
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.alter_column("price", existing_type=sa.Float(), type_=sa.Numeric(12, 2), nullable=False)

    # 6. Alter payments amount to Numeric(12, 2) and add unique constraint
    with op.batch_alter_table("payments", schema=None) as batch_op:
        batch_op.alter_column("amount", existing_type=sa.Float(), type_=sa.Numeric(12, 2), nullable=False)
        batch_op.create_unique_constraint(
            "uq_payments_provider_trans_id",
            ["provider", "provider_transaction_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("payments", schema=None) as batch_op:
        batch_op.drop_constraint("uq_payments_provider_trans_id", type_="unique")
        batch_op.alter_column("amount", existing_type=sa.Numeric(12, 2), type_=sa.Float(), nullable=False)

    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.alter_column("price", existing_type=sa.Numeric(12, 2), type_=sa.Float(), nullable=False)

    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_orders_public_code"))
        batch_op.drop_column("public_code")
        batch_op.alter_column("total_amount", existing_type=sa.Numeric(12, 2), type_=sa.Float(), nullable=False)
        batch_op.alter_column("quantity", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("unit_price", existing_type=sa.Numeric(12, 2), type_=sa.Float(), nullable=False)
        batch_op.alter_column("product_name", existing_type=sa.String(255), nullable=False)
        batch_op.alter_column("product_id", existing_type=sa.Integer(), nullable=False)

    op.drop_table("order_items")
    op.drop_table("product_reviews")
