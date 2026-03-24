"""posts.public_id (nanoid) for public URLs

Revision ID: 20260325_0006
Revises: 20260324_0005
Create Date: 2026-03-25

"""

from alembic import op
import sqlalchemy as sa
from nanoid import generate


revision = "20260325_0006"
down_revision = "20260324_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("public_id", sa.String(length=21), nullable=True))
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM posts")).fetchall()
    for (pid,) in rows:
        for _ in range(64):
            nid = generate(size=21)
            taken = conn.execute(
                sa.text("SELECT 1 FROM posts WHERE public_id = :pid LIMIT 1"),
                {"pid": nid},
            ).fetchone()
            if taken:
                continue
            conn.execute(
                sa.text("UPDATE posts SET public_id = :nid WHERE id = :id"),
                {"nid": nid, "id": pid},
            )
            break
    op.create_index("ix_posts_public_id", "posts", ["public_id"], unique=True)
    op.alter_column("posts", "public_id", nullable=False)


def downgrade() -> None:
    op.drop_index("ix_posts_public_id", table_name="posts")
    op.drop_column("posts", "public_id")
