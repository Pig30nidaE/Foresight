from datetime import datetime, timedelta, timezone

import magic
from fastapi import HTTPException, Request, UploadFile, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.forum import AccountDeletionSurvey, Comment, Post, SavedAnalyzedGame, User
from app.models.forum_schemas import (
    AccountWithdrawRequest,
    MeResponse,
    MyCommentListItem,
    MyCommentListResponse,
    MyPostListItem,
    MyPostListResponse,
    ProfileUpdateRequest,
    SavedAnalyzedGameCreateRequest,
    SavedAnalyzedGameItem,
    SavedAnalyzedGameListResponse,
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
_DISPLAY_NAME_CHANGE_COOLDOWN = timedelta(days=7)
_ANALYZED_GAME_RETENTION = timedelta(days=365)


def _is_protected_account(user: User) -> bool:
    return is_protected_admin_email(user.email)


def _normalize_display_name(value: str) -> str:
    return normalize_display_name(value)


def _display_name_change_available_at(user: User) -> datetime | None:
    changed_at = user.display_name_changed_at
    if changed_at is None:
        return None
    return changed_at + _DISPLAY_NAME_CHANGE_COOLDOWN


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


def _normalize_dashboard_href(value: str | None) -> str | None:
    if value is None:
        return None
    href = value.strip()
    if not href:
        return None
    if len(href) > 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="dashboard_href too long")
    if not href.startswith("/dashboard"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="dashboard_href must start with /dashboard",
        )
    return href


def _to_saved_analyzed_game_item(row: SavedAnalyzedGame) -> SavedAnalyzedGameItem:
    return SavedAnalyzedGameItem(
        id=row.id,
        game_id=row.game_id,
        label=row.label,
        depth=row.depth,
        dashboard_href=row.dashboard_href,
        analyzed_at=row.analyzed_at,
    )


async def _purge_expired_saved_games(db: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        delete(SavedAnalyzedGame).where(SavedAnalyzedGame.expires_at <= now)
    )
    return int(result.rowcount or 0)


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
        display_name_changed_at=me.display_name_changed_at,
        display_name_change_available_at=_display_name_change_available_at(me),
        analysis_tickets=getattr(me, "analysis_tickets", 5),
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
            now = datetime.now(timezone.utc)
            available_at = _display_name_change_available_at(me)
            if available_at is not None and now < available_at:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "닉네임은 7일에 한 번만 변경할 수 있습니다. "
                        f"다음 변경 가능 시각: {available_at.isoformat()}"
                    ),
                )
            if await _is_display_name_taken(db, my_user_id=me.id, display_name=new_name):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="이미 사용 중인 닉네임입니다.",
                )
            me.display_name = new_name
            me.display_name_changed_at = now
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


async def withdraw_my_account_handler(
    *,
    request: Request,
    payload: AccountWithdrawRequest,
    db: AsyncSession,
    me: User,
) -> None:
    _ = request
    feedback = payload.additional_feedback.strip() if payload.additional_feedback else None
    db.add(
        AccountDeletionSurvey(
            reason_code=payload.reason_code,
            additional_feedback=feedback or None,
        )
    )
    await db.delete(me)
    await db.commit()


async def save_analyzed_game_handler(
    *,
    request: Request,
    payload: SavedAnalyzedGameCreateRequest,
    db: AsyncSession,
    me: User,
) -> SavedAnalyzedGameItem:
    _ = request
    game_id = payload.game_id.strip()
    label = payload.label.strip()
    if not game_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="game_id is required")
    if not label:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="label is required")

    now = datetime.now(timezone.utc)
    expires_at = now + _ANALYZED_GAME_RETENTION
    dashboard_href = _normalize_dashboard_href(payload.dashboard_href)

    await _purge_expired_saved_games(db)

    existing = (
        (
            await db.execute(
                select(SavedAnalyzedGame).where(
                    SavedAnalyzedGame.user_id == me.id,
                    SavedAnalyzedGame.game_id == game_id,
                    SavedAnalyzedGame.depth == payload.depth,
                )
            )
        )
        .scalars()
        .first()
    )

    if existing is None:
        row = SavedAnalyzedGame(
            user_id=me.id,
            game_id=game_id,
            label=label,
            depth=payload.depth,
            dashboard_href=dashboard_href,
            analyzed_at=now,
            expires_at=expires_at,
        )
        db.add(row)
    else:
        existing.label = label
        existing.dashboard_href = dashboard_href
        existing.analyzed_at = now
        existing.expires_at = expires_at
        row = existing

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 저장된 분석 게임입니다.",
        ) from exc

    await db.refresh(row)
    return _to_saved_analyzed_game_item(row)


async def get_my_analyzed_games_handler(
    *,
    db: AsyncSession,
    me: User,
    page: int,
    page_size: int,
    q: str | None,
    depth: int | None,
) -> SavedAnalyzedGameListResponse:
    purged = await _purge_expired_saved_games(db)
    if purged > 0:
        await db.commit()

    now = datetime.now(timezone.utc)
    where_clause = [
        SavedAnalyzedGame.user_id == me.id,
        SavedAnalyzedGame.expires_at > now,
    ]
    if depth is not None:
        where_clause.append(SavedAnalyzedGame.depth == depth)

    search = (q or "").strip()
    if search:
        tokens = [token for token in search.split() if token]
        for token in tokens:
            like = f"%{token}%"
            where_clause.append(
                or_(
                    SavedAnalyzedGame.label.ilike(like),
                    SavedAnalyzedGame.game_id.ilike(like),
                )
            )

    total = (
        await db.execute(
            select(func.count()).select_from(SavedAnalyzedGame).where(*where_clause)
        )
    ).scalar_one()

    offset = (page - 1) * page_size
    rows = (
        (
            await db.execute(
                select(SavedAnalyzedGame)
                .where(*where_clause)
                .order_by(SavedAnalyzedGame.analyzed_at.desc())
                .offset(offset)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )

    return SavedAnalyzedGameListResponse(
        total=int(total),
        items=[_to_saved_analyzed_game_item(row) for row in rows],
    )


async def delete_my_analyzed_game_handler(
    *,
    request: Request,
    saved_game_id: str,
    db: AsyncSession,
    me: User,
) -> None:
    _ = request
    parsed_id = try_parse_uuid(saved_game_id)
    if parsed_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved game not found")

    row = await db.get(SavedAnalyzedGame, parsed_id)
    if row is None or row.user_id != me.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved game not found")

    await db.delete(row)
    await db.commit()


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
        object_prefix="forum-post",
    )
    return UploadResponse(url=url, content_type=mime)