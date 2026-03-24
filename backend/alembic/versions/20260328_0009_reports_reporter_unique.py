"""unique reporter per post/comment for reports

Revision ID: 20260328_0009
Revises: 20260327_0008
Create Date: 2026-03-28

"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0009"
down_revision = "20260327_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_reports_reporter_post",
        "reports",
        ["reporter_id", "post_id"],
        unique=True,
        postgresql_where=sa.text("post_id IS NOT NULL"),
    )
    op.create_index(
        "uq_reports_reporter_comment",
        "reports",
        ["reporter_id", "comment_id"],
        unique=True,
        postgresql_where=sa.text("comment_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_reports_reporter_comment", table_name="reports")
    op.drop_index("uq_reports_reporter_post", table_name="reports")
