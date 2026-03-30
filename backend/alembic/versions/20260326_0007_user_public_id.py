"""users.public_id for profile URLs

Revision ID: 20260326_0007
Revises: 20260325_0006
Create Date: 2026-03-26

"""

from alembic import op
import sqlalchemy as sa
from nanoid import generate


revision = "20260326_0007"
down_revision = "20260325_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("public_id", sa.String(length=21), nullable=True))
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM users")).fetchall()
    for (uid,) in rows:
        for _ in range(64):
            nid = generate(size=21)
            taken = conn.execute(
                sa.text("SELECT 1 FROM users WHERE public_id = :pid LIMIT 1"),
                {"pid": nid},
            ).fetchone()
            if taken:
                continue
            conn.execute(
                sa.text("UPDATE users SET public_id = :nid WHERE id = :id"),
                {"nid": nid, "id": uid},
            )
            break
    op.create_index("ix_users_public_id", "users", ["public_id"], unique=True)
    op.alter_column("users", "public_id", nullable=False)


def downgrade() -> None:
    op.drop_index("ix_users_public_id", table_name="users")
    op.drop_column("users", "public_id")
