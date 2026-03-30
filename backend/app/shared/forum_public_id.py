import uuid

from nanoid import generate


def new_post_public_id() -> str:
    return generate(size=21)


def try_parse_uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


async def next_unique_user_public_id(db) -> str:
    from sqlalchemy import func, select

    from app.db.models.forum import User

    for _ in range(64):
        nid = new_post_public_id()
        taken = await db.scalar(
            select(func.count()).select_from(User).where(User.public_id == nid)
        )
        if not taken:
            return nid
    raise RuntimeError("Could not allocate user public_id")
