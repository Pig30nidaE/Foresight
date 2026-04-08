"""Add optional additional feedback to account deletion surveys.

Revision ID: 20260410_0020
Revises: 20260410_0019
Create Date: 2026-04-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260410_0020"
down_revision: Union[str, None] = "20260410_0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "account_deletion_surveys",
        sa.Column("additional_feedback", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("account_deletion_surveys", "additional_feedback")
