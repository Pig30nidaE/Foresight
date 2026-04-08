"""Enable RLS on public forum tables and alembic_version (Supabase / PostgREST hardening)

Revision ID: 20260408_0013
Revises: 20260330_0012
Create Date: 2026-04-08

PostgREST-exposed public tables should have RLS enabled. The app uses FastAPI +
SQLAlchemy; table owners and roles with BYPASSRLS (e.g. Supabase service_role via
REST) are unaffected. If DATABASE_URL uses a non-owner role without BYPASSRLS,
add explicit policies for that role.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260408_0013"
down_revision: Union[str, None] = "20260330_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_RLS_TABLES = (
    "alembic_version",
    "users",
    "posts",
    "comments",
    "post_likes",
    "reports",
    "moderation_logs",
)


def upgrade() -> None:
    for name in _RLS_TABLES:
        op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for name in _RLS_TABLES:
        op.execute(f"ALTER TABLE {name} DISABLE ROW LEVEL SECURITY")
