"""profile visibility and nickname uniqueness

Revision ID: 20260323_0004
Revises: 20260323_0002
Create Date: 2026-03-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260323_0004"
down_revision: Union[str, None] = "20260323_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("profile_public", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column("users", "profile_public", server_default=None)
    op.create_index(
        "uq_users_display_name_lower_completed",
        "users",
        [sa.text("lower(display_name)")],
        unique=True,
        postgresql_where=sa.text("signup_completed = true"),
    )


def downgrade() -> None:
    op.drop_index("uq_users_display_name_lower_completed", table_name="users")
    op.drop_column("users", "profile_public")
