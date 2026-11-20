"""One active try-on per user, enforced by the database.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
"""

import sqlalchemy as sa

from alembic import op

revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None

ACTIVE = "status IN ('queued', 'processing')"


def upgrade():
    # Keep only the newest active task per user so the unique index can be built.
    op.execute(
        sa.text(
            f"""
            UPDATE vton_tasks
            SET status = 'failed', error_code = 'superseded'
            WHERE {ACTIVE} AND EXISTS (
                SELECT 1 FROM vton_tasks newer
                WHERE newer.user_id = vton_tasks.user_id
                  AND newer.status IN ('queued', 'processing')
                  AND (newer.created_at > vton_tasks.created_at
                       OR (newer.created_at = vton_tasks.created_at
                           AND newer.id > vton_tasks.id))
            )
            """
        )
    )
    if op.get_bind().dialect.name in ("mysql", "mariadb"):
        # No partial indexes here (the WHERE clause would be ignored and the index would
        # forbid a second task per user). Index a generated column that is NULL for
        # finished tasks instead: unique indexes allow any number of NULLs.
        op.execute(
            sa.text(
                "ALTER TABLE vton_tasks ADD COLUMN active_user_id INT "
                f"AS (IF({ACTIVE}, user_id, NULL)) VIRTUAL"
            )
        )
        op.execute(
            sa.text(
                "CREATE UNIQUE INDEX uq_vton_tasks_one_active_per_user "
                "ON vton_tasks (active_user_id)"
            )
        )
        return
    op.create_index(
        "uq_vton_tasks_one_active_per_user",
        "vton_tasks",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text(ACTIVE),
        sqlite_where=sa.text(ACTIVE),
    )


def downgrade():
    if op.get_bind().dialect.name in ("mysql", "mariadb"):
        op.execute(
            sa.text("DROP INDEX uq_vton_tasks_one_active_per_user ON vton_tasks")
        )
        op.execute(sa.text("ALTER TABLE vton_tasks DROP COLUMN active_user_id"))
        return
    op.drop_index("uq_vton_tasks_one_active_per_user", table_name="vton_tasks")
