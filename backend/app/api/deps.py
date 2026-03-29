from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.models.forum import User
from app.db.session import get_async_session
from app.shared.forum_public_id import next_unique_user_public_id

_PROTECTED_ADMIN_EMAIL = "pig30nidae@gmail.com"
_PROTECTED_ADMIN_DISPLAY_NAME = "관리자"


def _is_protected_admin_email(email: str | None) -> bool:
    return (email or "").strip().lower() == _PROTECTED_ADMIN_EMAIL


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def get_token_payload(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> dict:
    token = _bearer_token(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return decode_access_token(token)


async def get_optional_token_payload(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> dict | None:
    token = _bearer_token(authorization)
    if not token:
        return None
    try:
        return decode_access_token(token)
    except HTTPException:
        return None


async def upsert_user_from_claims(db: AsyncSession, claims: dict) -> User:
    """OAuth login bootstrap/update.

    If a different provider already owns the same completed email, reject the sign-in.
    If the duplicate row is still incomplete, clean it up so the user can retry cleanly.
    """
    provider = str(claims.get("provider") or "").strip()
    provider_account_id = str(claims.get("provider_account_id") or "").strip()
    if not provider or not provider_account_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing provider identity",
        )
    email = claims.get("email")
    if email is not None:
        email = str(email).strip() or None
    display_name = str(claims.get("name") or claims.get("email") or "User").strip() or "User"
    avatar = claims.get("picture")
    if avatar is not None:
        avatar = str(avatar).strip() or None

    result = await db.execute(
        select(User).where(
            User.provider == provider,
            User.provider_account_id == provider_account_id,
        )
    )
    user = result.scalar_one_or_none()

    conflict_user = None
    if email:
        conflict_user = (
            await db.execute(
                select(User).where(
                    User.email == email,
                    ~(
                        (User.provider == provider)
                        & (User.provider_account_id == provider_account_id)
                    ),
                )
            )
        ).scalar_one_or_none()

    if conflict_user is not None:
        if conflict_user.signup_completed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "EMAIL_CONFLICT",
                    "masked_email": email,
                },
            )
        await db.execute(delete(User).where(User.id == conflict_user.id))
        await db.flush()

    if user:
        user.email = email
        if getattr(user, "avatar_sync_oauth", True):
            user.avatar_url = avatar
        if not user.signup_completed:
            user.display_name = display_name
    else:
        pub = await next_unique_user_public_id(db)
        user = User(
            public_id=pub,
            provider=provider,
            provider_account_id=provider_account_id,
            email=email,
            display_name=display_name,
            avatar_url=avatar,
            avatar_sync_oauth=True,
        )
        db.add(user)

    if _is_protected_admin_email(user.email):
        user.role = "admin"
        user.display_name = _PROTECTED_ADMIN_DISPLAY_NAME

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="계정 정보를 동기화하는 중 충돌이 발생했습니다. 잠시 후 다시 시도해 주세요.",
        ) from exc
    await db.refresh(user)
    return user


async def get_current_user(
    claims: Annotated[dict, Depends(get_token_payload)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> User:
    return await upsert_user_from_claims(db, claims)


async def get_current_user_completed(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not user.signup_completed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Signup required",
        )
    return user


async def get_current_admin(
    user: Annotated[User, Depends(get_current_user_completed)],
) -> User:
    if user.role not in ("admin", "moderator"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return user


async def get_optional_current_user(
    claims: Annotated[dict | None, Depends(get_optional_token_payload)],
    db: Annotated[AsyncSession, Depends(get_async_session)],
) -> User | None:
    if not claims:
        return None
    return await upsert_user_from_claims(db, claims)
