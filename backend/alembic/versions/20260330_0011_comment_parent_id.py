"""comments.parent_comment_id — one-level reply thread

Revision ID: 20260330_0011
Revises: 20260329_0010
Create Date: 2026-03-30

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260330_0011"
down_revision = "20260329_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "comments",
        sa.Column("parent_comment_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        op.f("ix_comments_parent_comment_id"),
        "comments",
        ["parent_comment_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_comments_parent_comment_id",
        "comments",
        "comments",
        ["parent_comment_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_comments_parent_comment_id", "comments", type_="foreignkey")
    op.drop_index(op.f("ix_comments_parent_comment_id"), table_name="comments")
    op.drop_column("comments", "parent_comment_id")
