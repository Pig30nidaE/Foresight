"""signup and moderation schema

Revision ID: 20260323_0002
Revises: 20250323_0001
Create Date: 2026-03-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260323_0002"
down_revision: Union[str, None] = "20250323_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(length=20), nullable=False, server_default="user"))
    op.add_column("users", sa.Column("signup_completed", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("users", "role", server_default=None)
    op.alter_column("users", "signup_completed", server_default=None)

    op.add_column("posts", sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("posts", sa.Column("hidden_reason", sa.String(length=500), nullable=True))
    op.add_column("posts", sa.Column("hidden_by_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("posts", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("posts", "is_hidden", server_default=None)

    op.add_column("comments", sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("comments", sa.Column("hidden_reason", sa.String(length=500), nullable=True))
    op.add_column("comments", sa.Column("hidden_by_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("comments", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("comments", "is_hidden", server_default=None)

    op.create_table(
        "reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reporter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("comment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["comment_id"], ["comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reporter_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_reports_reporter_id"), "reports", ["reporter_id"], unique=False)
    op.create_index(op.f("ix_reports_post_id"), "reports", ["post_id"], unique=False)
    op.create_index(op.f("ix_reports_comment_id"), "reports", ["comment_id"], unique=False)

    op.create_table(
        "moderation_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("target_type", sa.String(length=20), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_moderation_logs_actor_user_id"), "moderation_logs", ["actor_user_id"], unique=False)
    op.create_index(op.f("ix_moderation_logs_target_id"), "moderation_logs", ["target_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_moderation_logs_target_id"), table_name="moderation_logs")
    op.drop_index(op.f("ix_moderation_logs_actor_user_id"), table_name="moderation_logs")
    op.drop_table("moderation_logs")

    op.drop_index(op.f("ix_reports_comment_id"), table_name="reports")
    op.drop_index(op.f("ix_reports_post_id"), table_name="reports")
    op.drop_index(op.f("ix_reports_reporter_id"), table_name="reports")
    op.drop_table("reports")

    op.drop_column("comments", "deleted_at")
    op.drop_column("comments", "hidden_by_id")
    op.drop_column("comments", "hidden_reason")
    op.drop_column("comments", "is_hidden")

    op.drop_column("posts", "deleted_at")
    op.drop_column("posts", "hidden_by_id")
    op.drop_column("posts", "hidden_reason")
    op.drop_column("posts", "is_hidden")

    op.drop_column("users", "terms_accepted_at")
    op.drop_column("users", "signup_completed")
    op.drop_column("users", "role")
