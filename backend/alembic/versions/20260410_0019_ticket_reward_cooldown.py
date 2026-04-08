"""Add last ticket reward timestamp for cooldown.

Revision ID: 20260410_0019
Revises: 20260410_0018
Create Date: 2026-04-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260410_0019"
down_revision: Union[str, None] = "20260410_0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("last_ticket_earned_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "last_ticket_earned_at")
