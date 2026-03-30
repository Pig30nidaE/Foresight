"""users.avatar_sync_oauth — allow custom avatar without OAuth overwrite

Revision ID: 20260329_0010
Revises: 20260328_0009
Create Date: 2026-03-29

"""
from alembic import op
import sqlalchemy as sa


revision = "20260329_0010"
down_revision = "20260328_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "avatar_sync_oauth",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.alter_column("users", "avatar_sync_oauth", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "avatar_sync_oauth")
