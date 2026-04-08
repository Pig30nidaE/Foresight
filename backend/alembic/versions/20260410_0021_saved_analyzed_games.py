"""Create saved analyzed games table.

Revision ID: 20260410_0021
Revises: 20260410_0020
Create Date: 2026-04-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260410_0021"
down_revision: Union[str, None] = "20260410_0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saved_analyzed_games",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("game_id", sa.String(length=120), nullable=False),
        sa.Column("label", sa.String(length=300), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column("dashboard_href", sa.String(length=1024), nullable=True),
        sa.Column(
            "analyzed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "game_id",
            "depth",
            name="uq_saved_analyzed_games_user_game_depth",
        ),
    )
    op.create_index(
        "ix_saved_analyzed_games_user_id",
        "saved_analyzed_games",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_saved_analyzed_games_game_id",
        "saved_analyzed_games",
        ["game_id"],
        unique=False,
    )
    op.create_index(
        "ix_saved_analyzed_games_user_analyzed_at",
        "saved_analyzed_games",
        ["user_id", "analyzed_at"],
        unique=False,
    )
    op.create_index(
        "ix_saved_analyzed_games_expires_at",
        "saved_analyzed_games",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_saved_analyzed_games_expires_at", table_name="saved_analyzed_games")
    op.drop_index("ix_saved_analyzed_games_user_analyzed_at", table_name="saved_analyzed_games")
    op.drop_index("ix_saved_analyzed_games_game_id", table_name="saved_analyzed_games")
    op.drop_index("ix_saved_analyzed_games_user_id", table_name="saved_analyzed_games")
    op.drop_table("saved_analyzed_games")
