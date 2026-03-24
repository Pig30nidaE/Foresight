"""post board_category for forum vs board (notice/free)

Revision ID: 20260324_0005
Revises: 20260323_0004
Create Date: 2026-03-24

"""

from alembic import op
import sqlalchemy as sa


revision = "20260324_0005"
down_revision = "20260323_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "posts",
        sa.Column("board_category", sa.String(length=20), nullable=True),
    )
    op.create_index("ix_posts_board_category", "posts", ["board_category"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_posts_board_category", table_name="posts")
    op.drop_column("posts", "board_category")
