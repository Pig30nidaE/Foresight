from datetime import datetime, timezone

import magic
from fastapi import HTTPException, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.forum import Comment, Post, User
from app.models.forum_schemas import (
    MeResponse,
    MyCommentListItem,
    MyCommentListResponse,
    MyPostListItem,
    MyPostListResponse,
    ProfileUpdateRequest,
    SignupEmailCodeVerify,
    SignupRequest,
    UploadResponse,
    UserPublicProfileResponse,
)
from app.shared.display_name import normalize_display_name
from app.shared.forum_blob import upload_image_bytes
from app.shared.forum_public_id import try_parse_uuid
from app.shared.protected_admin import is_protected_admin_email, protected_admin_display_name
from app.shared.signup_helpers import (
    duplicate_email_message,
    find_user_with_same_email,
    mask_email_for_display,
    normalize_email,
)

_PREVIEW_LEN = 280
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
_ALLOWED_MIME = frozenset({"image/jpeg", "image/png", "image/gif", "image/webp"})


def _is_protected_account(user: User) -> bool:
    return is_protected_admin_email(user.email)


def _normalize_display_name(value: str) -> str:
    return normalize_display_name(value)


async def _is_display_name_taken(db: AsyncSession, *, my_user_id, display_name: str) -> bool:
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


def _validate_avatar_url_value(url: str) -> str:
    u = url.strip()
    if len(u) > 2048:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar URL too long")
    if not u.startswith(("https://", "http://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar URL must start with http:// or https://",
        )
    return u


async def _me_response(db: AsyncSession, me: User) -> MeResponse:
    norm = normalize_email(me.email)
    other = await find_user_with_same_email(db, my_user_id=me.id, email_normalized=norm)
    email_conflict = other is not None and not me.signup_completed
    masked_conflict = mask_email_for_display(norm) if (email_conflict and norm) else None
    needs_email_verification = False
    email_verified = True
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
        needs_email_verification=needs_email_verification,
        email_verified=email_verified,
    )


async def get_me_handler(*, me: User, db: AsyncSession) -> MeResponse:
    return await _me_response(db, me)


async def request_signup_email_code_handler(
    *,
    request: Request,
    db: AsyncSession,
    me: User,
):
    _ = (request, db, me)
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="이메일 2차 인증 기능은 폐기되었습니다. OAuth 로그인 후 바로 회원가입을 진행해 주세요.",
    )


async def verify_signup_email_code_handler(
    *,
    request: Request,
    payload: SignupEmailCodeVerify,
    db: AsyncSession,
    me: User,
):
    _ = (request, payload, db, me)
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="이메일 2차 인증 기능은 폐기되었습니다. OAuth 로그인 후 바로 회원가입을 진행해 주세요.",
    )


async def complete_signup_handler(
    *,
    request: Request,
    payload: SignupRequest,
    db: AsyncSession,
    me: User,
) -> MeResponse:
    _ = request
    if not payload.agree_terms:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Terms agreement required")
    norm = normalize_email(me.email)
    if norm:
        other = await find_user_with_same_email(db, my_user_id=me.id, email_normalized=norm)
        if other:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=duplicate_email_message(mask_email_for_display(norm)),
            )

    if _is_protected_account(me):
        me.display_name = protected_admin_display_name()
        me.role = "admin"
    else:
        normalized_name = _normalize_display_name(payload.display_name)
        if await _is_display_name_taken(db, my_user_id=me.id, display_name=normalized_name):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 사용 중인 닉네임입니다.",
            )
        me.display_name = normalized_name

    me.terms_accepted_at = datetime.now(timezone.utc)
    me.avatar_sync_oauth = False
    me.avatar_url = None
    me.signup_completed = True
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 닉네임입니다.",
        ) from exc

    await db.refresh(me)
    return await _me_response(db, me)


async def update_my_profile_handler(
    *,
    request: Request,
    payload: ProfileUpdateRequest,
    claims: dict,
    db: AsyncSession,
    me: User,
) -> MeResponse:
    _ = request
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No profile fields provided")

    if data.get("restore_oauth_avatar") and (
        data.get("use_site_default_avatar") is True or "avatar_url" in data
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conflicting avatar options",
        )
    if data.get("use_site_default_avatar") is True and "avatar_url" in data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conflicting avatar options",
        )

    changed = False

    if data.get("restore_oauth_avatar") is True:
        me.avatar_sync_oauth = True
        pic = claims.get("picture")
        me.avatar_url = str(pic).strip() if pic else None
        changed = True
    elif data.get("use_site_default_avatar") is True:
        me.avatar_sync_oauth = False
        me.avatar_url = None
        changed = True
    elif "avatar_url" in data:
        raw = data["avatar_url"]
        if raw is None or (isinstance(raw, str) and not str(raw).strip()):
            me.avatar_sync_oauth = False
            me.avatar_url = None
            changed = True
        else:
            validated_url = _validate_avatar_url_value(str(raw))
            me.avatar_url = validated_url
            me.avatar_sync_oauth = False
            changed = True

    if _is_protected_account(me):
        protected_name = protected_admin_display_name()
        if me.display_name != protected_name:
            me.display_name = protected_name
            changed = True
        if (me.role or "").strip().lower() != "admin":
            me.role = "admin"
            changed = True
    elif "display_name" in data and data["display_name"] is not None:
        new_name = _normalize_display_name(data["display_name"])
        if new_name != me.display_name.strip():
            if await _is_display_name_taken(db, my_user_id=me.id, display_name=new_name):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="이미 사용 중인 닉네임입니다.",
                )
            me.display_name = new_name
            changed = True

    if "profile_public" in data and data["profile_public"] is not None:
        if data["profile_public"] != me.profile_public:
            me.profile_public = data["profile_public"]
            changed = True

    if not changed:
        return await _me_response(db, me)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 닉네임입니다.",
        ) from exc

    await db.refresh(me)
    return await _me_response(db, me)


async def get_my_posts_handler(
    *,
    db: AsyncSession,
    me: User,
    page: int,
    page_size: int,
) -> MyPostListResponse:
    where_posts = (Post.author_id == me.id, Post.deleted_at.is_(None))
    offset = (page - 1) * page_size
    stmt = (
        select(
            Post,
            func.count(Post.id).over().label("_total"),
        )
        .where(*where_posts)
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    rows_with_total = result.all()
    total = rows_with_total[0][1] if rows_with_total else 0
    rows = [r[0] for r in rows_with_total]
    return MyPostListResponse(
        total=int(total),
        items=[
            MyPostListItem(
                id=p.id,
                public_id=p.public_id,
                title=p.title,
                body_preview=p.body if len(p.body) <= _PREVIEW_LEN else p.body[:_PREVIEW_LEN] + "…",
                created_at=p.created_at,
                updated_at=p.updated_at,
                board_category=p.board_category,
            )
            for p in rows
        ],
    )


async def get_my_comments_handler(
    *,
    db: AsyncSession,
    me: User,
    page: int,
    page_size: int,
) -> MyCommentListResponse:
    where_comments = (
        Comment.author_id == me.id,
        Comment.deleted_at.is_(None),
        Post.deleted_at.is_(None),
    )
    offset = (page - 1) * page_size
    stmt = (
        select(
            Comment,
            Post,
            func.count(Comment.id).over().label("_total"),
        )
        .join(Post, Post.id == Comment.post_id)
        .where(*where_comments)
        .order_by(Comment.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    rows_with_total = result.all()
    total = rows_with_total[0][2] if rows_with_total else 0
    rows = [(r[0], r[1]) for r in rows_with_total]
    return MyCommentListResponse(
        total=int(total),
        items=[
            MyCommentListItem(
                id=c.id,
                body=c.body,
                created_at=c.created_at,
                post_id=p.id,
                post_public_id=p.public_id,
                post_title=p.title,
                post_board_category=p.board_category,
            )
            for c, p in rows
        ],
    )


async def get_user_public_profile_handler(
    *,
    request: Request,
    user_id: str,
    db: AsyncSession,
    me: User | None,
    posts_page: int,
    posts_page_size: int,
    comments_page: int,
    comments_page_size: int,
) -> UserPublicProfileResponse:
    _ = request
    uid = try_parse_uuid(user_id)
    if uid is not None:
        user = await db.get(User, uid)
    else:
        user = (await db.execute(select(User).where(User.public_id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    is_owner = me is not None and me.id == user.id
    activity_visible = bool(user.profile_public or is_owner)
    if not activity_visible:
        return UserPublicProfileResponse(
            id=user.id,
            public_id=user.public_id,
            display_name=user.display_name,
            avatar_url=None,
            profile_public=False,
            activity_visible=False,
            posts=[],
            comments=[],
            posts_total=0,
            comments_total=0,
        )

    where_posts = (
        Post.author_id == user.id,
        Post.deleted_at.is_(None),
        Post.is_hidden.is_(False),
    )
    posts_total = (await db.execute(select(func.count()).select_from(Post).where(*where_posts))).scalar_one()
    p_off = (posts_page - 1) * posts_page_size
    posts = (
        await db.execute(
            select(Post)
            .where(*where_posts)
            .order_by(Post.created_at.desc())
            .offset(p_off)
            .limit(posts_page_size)
        )
    ).scalars().all()

    where_comments = (
        Comment.author_id == user.id,
        Comment.deleted_at.is_(None),
        Comment.is_hidden.is_(False),
        Post.deleted_at.is_(None),
        Post.is_hidden.is_(False),
    )
    comments_total = (
        await db.execute(
            select(func.count())
            .select_from(Comment)
            .join(Post, Post.id == Comment.post_id)
            .where(*where_comments)
        )
    ).scalar_one()
    c_off = (comments_page - 1) * comments_page_size
    comments = (
        await db.execute(
            select(Comment, Post)
            .join(Post, Post.id == Comment.post_id)
            .where(*where_comments)
            .order_by(Comment.created_at.desc())
            .offset(c_off)
            .limit(comments_page_size)
        )
    ).all()
    return UserPublicProfileResponse(
        id=user.id,
        public_id=user.public_id,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        profile_public=user.profile_public,
        activity_visible=True,
        posts_total=int(posts_total),
        comments_total=int(comments_total),
        posts=[
            MyPostListItem(
                id=p.id,
                public_id=p.public_id,
                title=p.title,
                body_preview=p.body if len(p.body) <= _PREVIEW_LEN else p.body[:_PREVIEW_LEN] + "…",
                created_at=p.created_at,
                updated_at=p.updated_at,
                board_category=p.board_category,
            )
            for p in posts
        ],
        comments=[
            MyCommentListItem(
                id=c.id,
                body=c.body,
                created_at=c.created_at,
                post_id=p.id,
                post_public_id=p.public_id,
                post_title=p.title,
                post_board_category=p.board_category,
            )
            for c, p in comments
        ],
    )


async def upload_forum_image_handler(
    *,
    request: Request,
    file: UploadFile,
    me: User,
) -> UploadResponse:
    _ = me
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large")
    mime = magic.from_buffer(data, mime=True)
    if mime not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type",
        )
    name = file.filename or "upload"
    url = await upload_image_bytes(
        data,
        content_type=mime,
        original_filename=name,
        public_base_url=str(request.base_url),
        object_prefix="profile",
    )
    return UploadResponse(url=url, content_type=mime)