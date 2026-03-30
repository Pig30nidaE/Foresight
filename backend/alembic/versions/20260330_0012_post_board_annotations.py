"""posts.board_annotations JSONB — highlights / emojis

Revision ID: 20260330_0012
Revises: 20260330_0011
Create Date: 2026-03-30

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260330_0012"
down_revision = "20260330_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "posts",
        sa.Column("board_annotations", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("posts", "board_annotations")
