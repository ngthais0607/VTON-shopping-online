"""Virtual try-on tasks.

Revision ID: a7d3e1f9c2b4
Revises: f8a1b2c3d4e5
"""

import sqlalchemy as sa

from alembic import op

revision = "a7d3e1f9c2b4"
down_revision = "f8a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "vton_tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False
        ),
        sa.Column(
            "variant_id",
            sa.Integer(),
            sa.ForeignKey("product_variants.id"),
            nullable=True,
        ),
        sa.Column("cloth_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("engine", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_code", sa.String(50), nullable=True),
        sa.Column("idempotency_key", sa.String(64), nullable=True),
        sa.Column("person_object", sa.String(255), nullable=True),
        sa.Column("garment_object", sa.String(255), nullable=False),
        sa.Column("result_object", sa.String(255), nullable=True),
        sa.Column("consent_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("purged_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "user_id", "idempotency_key", name="uq_vton_tasks_user_idempotency"
        ),
    )
    op.create_index(
        "ix_vton_tasks_user_created", "vton_tasks", ["user_id", "created_at"]
    )
    op.create_index(
        "ix_vton_tasks_status_created", "vton_tasks", ["status", "created_at"]
    )


def downgrade():
    op.drop_table("vton_tasks")
