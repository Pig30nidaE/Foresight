"""signup email verification columns

Revision ID: 20260327_0008
Revises: 20260326_0007
Create Date: 2026-03-27

"""

from alembic import op
import sqlalchemy as sa


revision = "20260327_0008"
down_revision = "20260326_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("signup_email_code_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("signup_email_code_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "signup_email_verify_attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.alter_column("users", "signup_email_verify_attempts", server_default=None)
    # Existing completed accounts: treat email as already verified for this feature rollout.
    op.execute(
        sa.text(
            "UPDATE users SET email_verified_at = COALESCE(terms_accepted_at, created_at) "
            "WHERE signup_completed = true AND email IS NOT NULL AND email_verified_at IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_column("users", "signup_email_verify_attempts")
    op.drop_column("users", "signup_email_code_expires_at")
    op.drop_column("users", "signup_email_code_hash")
    op.drop_column("users", "email_verified_at")
