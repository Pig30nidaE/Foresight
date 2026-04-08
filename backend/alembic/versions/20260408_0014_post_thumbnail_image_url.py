"""posts.thumbnail_image_url — custom image thumbnail

Revision ID: 20260408_0014
Revises: 20260408_0013
Create Date: 2026-04-08

"""
import sqlalchemy as sa
from alembic import op

revision = "20260408_0014"
down_revision = "20260408_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "posts",
        sa.Column("thumbnail_image_url", sa.String(2048), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("posts", "thumbnail_image_url")
