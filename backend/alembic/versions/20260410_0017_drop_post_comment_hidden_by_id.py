"""Drop redundant hidden_by_id on posts/comments (audit lives in moderation_logs).

Revision ID: 20260410_0017
Revises: 20260408_0016
Create Date: 2026-04-10

hide_post / hide_comment already write ModerationLog(actor_user_id, details=reason).
These UUID columns were never read by the API.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260410_0017"
down_revision: Union[str, None] = "20260408_0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("comments", "hidden_by_id")
    op.drop_column("posts", "hidden_by_id")


def downgrade() -> None:
    op.add_column(
        "posts",
        sa.Column("hidden_by_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "comments",
        sa.Column("hidden_by_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
