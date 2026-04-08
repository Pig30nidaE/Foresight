"""Allow anonymous posting: make author_id nullable on posts and comments.

Revision ID: 20260408_0015
Revises: 20260408_0014
Create Date: 2026-04-08

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260408_0015"
down_revision = "20260408_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "posts",
        "author_id",
        existing_type=postgresql.UUID(),
        nullable=True,
    )
    op.alter_column(
        "comments",
        "author_id",
        existing_type=postgresql.UUID(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "comments",
        "author_id",
        existing_type=postgresql.UUID(),
        nullable=False,
    )
    op.alter_column(
        "posts",
        "author_id",
        existing_type=postgresql.UUID(),
        nullable=False,
    )
