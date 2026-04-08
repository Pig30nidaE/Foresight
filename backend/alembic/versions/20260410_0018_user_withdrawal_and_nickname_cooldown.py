"""Add nickname cooldown timestamp and account deletion survey table.

Revision ID: 20260410_0018
Revises: 20260410_0017
Create Date: 2026-04-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260410_0018"
down_revision: Union[str, None] = "20260410_0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("display_name_changed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "account_deletion_surveys",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason_code", sa.String(length=40), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_account_deletion_surveys_reason_code",
        "account_deletion_surveys",
        ["reason_code"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_account_deletion_surveys_reason_code", table_name="account_deletion_surveys")
    op.drop_table("account_deletion_surveys")
    op.drop_column("users", "display_name_changed_at")
