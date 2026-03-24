"""Signup: email normalization, masking, duplicate detection."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.forum import User


def normalize_email(value: str | None) -> str | None:
    if value is None:
        return None
    s = str(value).strip().lower()
    return s or None


def mask_email_for_display(email: str) -> str:
    """Mask local part for privacy; keep domain visible."""
    email = email.strip()
    if "@" not in email:
        return "***"
    local, _, domain = email.rpartition("@")
    if not local:
        return f"***@{domain}"
    keep = min(2, len(local))
    prefix = local[:keep]
    return f"{prefix}{'*' * max(3, len(local) - keep)}@{domain}"


async def find_user_with_same_email(
    db: AsyncSession,
    *,
    my_user_id: uuid.UUID,
    email_normalized: str | None,
) -> User | None:
    if not email_normalized:
        return None
    stmt = (
        select(User)
        .where(
            User.id != my_user_id,
            User.email.isnot(None),
            func.lower(User.email) == email_normalized,
        )
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def duplicate_email_message(masked_email: str) -> str:
    return f"{masked_email}(으)로 이미 가입되어 있습니다."
