"""
Forum community service — business logic helpers extracted from the forum router.

These functions handle database queries, authorization rules, and data
transformation for the forum feature.
"""
from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.forum import Comment, Post, User
from app.models.forum_schemas import AuthorOut, MeResponse
from app.core.config import settings
from app.shared.display_name import normalize_display_name
from app.shared.forum_public_id import new_post_public_id, try_parse_uuid
from app.shared.signup_helpers import (
    find_user_with_same_email,
    mask_email_for_display,
    normalize_email,
)


async def next_unique_public_id(db: AsyncSession) -> str:
    """Generate a collision-free public post ID."""
    for _ in range(64):
        nid = new_post_public_id()
        taken = await db.scalar(
            select(func.count()).select_from(Post).where(Post.public_id == nid)
        )
        if not taken:
            return nid
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate post id",
    )


# ---------------------------------------------------------------------------
# Post loading
# ---------------------------------------------------------------------------

async def load_visible_post_by_route_key(db: AsyncSession, post_id: str) -> Post | None:
    """Load a non-deleted, non-hidden post by UUID or public_id."""
    pid_uuid = try_parse_uuid(post_id)
    stmt = (
        select(Post)
        .options(selectinload(Post.author), selectinload(Post.comments).selectinload(Comment.author))
        .where(Post.deleted_at.is_(None), Post.is_hidden.is_(False))
    )
    if pid_uuid is not None:
        stmt = stmt.where(Post.id == pid_uuid)
    else:
        stmt = stmt.where(Post.public_id == post_id)
    return (await db.execute(stmt)).scalar_one_or_none()


# ---------------------------------------------------------------------------
# Cursor encoding / decoding
# ---------------------------------------------------------------------------

def encode_cursor(created_at: datetime, post_id: uuid.UUID) -> str:
    payload = json.dumps({"t": created_at.isoformat(), "i": str(post_id)})
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(raw: str) -> tuple[datetime, uuid.UUID]:
    try:
        pad = "=" * (-len(raw) % 4)
        data = json.loads(base64.urlsafe_b64decode(raw + pad).decode())
        return datetime.fromisoformat(data["t"]), uuid.UUID(data["i"])
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor",
        ) from exc


# ---------------------------------------------------------------------------
# Author / comment helpers
# ---------------------------------------------------------------------------

def author_out(user: User) -> AuthorOut:
    return AuthorOut(
        id=user.id,
        public_id=user.public_id,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        role=user.role,
    )


def comment_visible_for_detail(c: Comment) -> bool:
    return c.deleted_at is None and not c.is_hidden


def ordered_threaded_comments(comments: list[Comment]) -> list[Comment]:
    """Return roots first (by created_at), then direct replies; orphans last."""
    vis = [c for c in comments if comment_visible_for_detail(c)]
    roots = [c for c in vis if c.parent_comment_id is None]
    roots.sort(key=lambda x: x.created_at)
    ordered: list[Comment] = []
    seen: set[uuid.UUID] = set()
    for r in roots:
        ordered.append(r)
        seen.add(r.id)
        children = [c for c in vis if c.parent_comment_id == r.id]
        children.sort(key=lambda x: x.created_at)
        for ch in children:
            ordered.append(ch)
            seen.add(ch.id)
    for c in vis:
        if c.id not in seen:
            ordered.append(c)
    return ordered


# ---------------------------------------------------------------------------
# Authorization helpers
# ---------------------------------------------------------------------------

def is_admin_user(user: User) -> bool:
    return (user.role or "").strip().lower() == "admin"


def can_moderate_all_content(user: User) -> bool:
    r = (user.role or "").strip().lower()
    return r in ("admin", "moderator")


def can_edit_post(me: User, post: Post) -> bool:
    if post.board_category in ("notice", "patch"):
        return is_admin_user(me)
    return post.author_id == me.id or can_moderate_all_content(me)


def is_protected_account(user: User) -> bool:
    return (user.email or "").strip().lower() == settings.PROTECTED_ADMIN_EMAIL.strip().lower()


async def assert_not_protected_content(
    db: AsyncSession,
    *,
    actor: User | None = None,
    post: Post | None = None,
    comment: Comment | None = None,
) -> None:
    """Raise 403 if attempting to delete/hide protected admin content."""
    can_manage_own = actor is not None and is_admin_user(actor)
    if post is not None:
        author = await db.get(User, post.author_id)
        if (
            author is not None
            and is_protected_account(author)
            and not (can_manage_own and post.author_id == actor.id)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="보호 계정의 콘텐츠는 삭제/숨김할 수 없습니다.",
            )
    if comment is not None:
        author = await db.get(User, comment.author_id)
        if (
            author is not None
            and is_protected_account(author)
            and not (can_manage_own and comment.author_id == actor.id)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="보호 계정의 콘텐츠는 삭제/숨김할 수 없습니다.",
            )


# ---------------------------------------------------------------------------
# User profile helpers
# ---------------------------------------------------------------------------

def normalize_display_name_value(value: str) -> str:
    return normalize_display_name(value)


async def is_display_name_taken(
    db: AsyncSession, *, my_user_id: uuid.UUID, display_name: str
) -> bool:
    name_key = display_name.strip().lower()
    taken = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(
            User.id != my_user_id,
            func.lower(func.trim(User.display_name)) == name_key,
        )
    )
    return bool(taken)


def validate_avatar_url_value(url: str) -> str:
    u = url.strip()
    if len(u) > 2048:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar URL too long")
    if not u.startswith(("https://", "http://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar URL must start with http:// or https://",
        )
    return u


async def build_me_response(db: AsyncSession, me: User) -> MeResponse:
    norm = normalize_email(me.email)
    other = await find_user_with_same_email(db, my_user_id=me.id, email_normalized=norm)
    email_conflict = other is not None and not me.signup_completed
    masked_conflict = mask_email_for_display(norm) if (email_conflict and norm) else None
    return MeResponse(
        id=me.id,
        public_id=me.public_id,
        email=me.email,
        display_name=me.display_name,
        avatar_url=me.avatar_url,
        role=me.role,
        signup_completed=me.signup_completed,
        profile_public=me.profile_public,
        email_conflict=email_conflict,
        masked_conflict_email=masked_conflict,
        needs_email_verification=False,
        email_verified=True,
    )
