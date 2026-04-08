"""Add analysis_tickets column to users table.

Revision ID: 20260408_0016
Revises: 20260408_0015
Create Date: 2026-04-08

"""
import sqlalchemy as sa
from alembic import op

revision = "20260408_0016"
down_revision = "20260408_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("analysis_tickets", sa.Integer(), nullable=False, server_default="5"),
    )


def downgrade() -> None:
    op.drop_column("users", "analysis_tickets")
