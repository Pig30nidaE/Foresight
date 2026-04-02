import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Annotated

import magic
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, literal, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_admin,
    get_current_user,
    get_current_user_completed,
    get_optional_current_user,
    get_token_payload,
)
from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import parse_uuid
from app.db.models.forum import Comment, ModerationLog, Post, PostLike, Report, User
from app.db.session import get_async_session
from app.models.forum_schemas import (
    AuthorOut,
    BoardPostCreate,
    CommentCreate,
    CommentOut,
    CommentUpdate,
    MeResponse,
    MyCommentListItem,
    MyCommentListResponse,
    MyPostListItem,
    MyPostListResponse,
    ModerationRequest,
    PostCreate,
    PostDetail,
    PostListItem,
    PostListResponse,
    PostUpdate,
    ReportCreate,
    ProfileUpdateRequest,
    SignupEmailCodeVerify,
    SignupRequest,
    UserPublicProfileResponse,
    UploadResponse,
)
from app.shared.signup_helpers import (
    duplicate_email_message,
    find_user_with_same_email,
    mask_email_for_display,
    normalize_email,
)
from app.shared.display_name import normalize_display_name
from app.shared.forum_blob import upload_image_bytes
from app.shared.forum_board_annotations import validate_board_annotations_payload
from app.shared.forum_chess import thumbnail_fen_for_post, validate_fen_optional, validate_pgn_optional
from app.shared.forum_public_id import new_post_public_id, try_parse_uuid

router = APIRouter()

_PREVIEW_LEN = 280
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
_ALLOWED_MIME = frozenset({"image/jpeg", "image/png", "image/gif", "image/webp"})
_PROTECTED_ADMIN_EMAIL = "pig30nidae@gmail.com"
_PROTECTED_ADMIN_DISPLAY_NAME = "관리자"


async def _next_unique_public_id(db: AsyncSession) -> str:
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


async def _load_visible_post_by_route_key(db: AsyncSession, post_id: str) -> Post | None:
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


def _encode_cursor(created_at: datetime, post_id: uuid.UUID) -> str:
    payload = json.dumps({"t": created_at.isoformat(), "i": str(post_id)})
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def _decode_cursor(raw: str) -> tuple[datetime, uuid.UUID]:
    try:
        pad = "=" * (-len(raw) % 4)
        data = json.loads(base64.urlsafe_b64decode(raw + pad).decode())
        return datetime.fromisoformat(data["t"]), uuid.UUID(data["i"])
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor",
        ) from exc


def _author_out(user: User) -> AuthorOut:
    return AuthorOut(
        id=user.id,
        public_id=user.public_id,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        role=user.role,
    )


def _comment_visible_for_detail(c: Comment) -> bool:
    return c.deleted_at is None and not c.is_hidden


def _ordered_threaded_comments(comments: list[Comment]) -> list[Comment]:
    """Roots first (by created_at), then direct replies under each root; orphans last."""
    vis = [c for c in comments if _comment_visible_for_detail(c)]
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


def _is_admin_user(user: User) -> bool:
    return (user.role or "").strip().lower() == "admin"


def _can_moderate_all_content(user: User) -> bool:
    r = (user.role or "").strip().lower()
    return r in ("admin", "moderator")


def _can_edit_post(me: User, post: Post) -> bool:
    if post.board_category in ("notice", "patch"):
        return _is_admin_user(me)
    return post.author_id == me.id or _can_moderate_all_content(me)


def _is_protected_account(user: User) -> bool:
    return (user.email or "").strip().lower() == _PROTECTED_ADMIN_EMAIL


async def _assert_not_protected_content(
    db: AsyncSession,
    *,
    actor: User | None = None,
    post: Post | None = None,
    comment: Comment | None = None,
) -> None:
    can_manage_own_protected_content = actor is not None and _is_admin_user(actor)
    if post is not None:
        author = await db.get(User, post.author_id)
        if (
            author is not None
            and _is_protected_account(author)
            and not (can_manage_own_protected_content and post.author_id == actor.id)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="보호 계정의 콘텐츠는 삭제/숨김할 수 없습니다.",
            )
    if comment is not None:
        author = await db.get(User, comment.author_id)
        if (
            author is not None
            and _is_protected_account(author)
            and not (can_manage_own_protected_content and comment.author_id == actor.id)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="보호 계정의 콘텐츠는 삭제/숨김할 수 없습니다.",
            )


def _normalize_display_name(value: str) -> str:
    return normalize_display_name(value)


async def _is_display_name_taken(db: AsyncSession, *, my_user_id: uuid.UUID, display_name: str) -> bool:
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
    needs_email_verification = (
        False
    )
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


@router.get("/me", response_model=MeResponse)
async def get_me(
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await _me_response(db, me)


@router.post("/signup/email-code/request")
@limiter.limit("5/minute")
async def request_signup_email_code(
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user),
):
    _ = (request, db, me)
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="이메일 2차 인증 기능은 폐기되었습니다. OAuth 로그인 후 바로 회원가입을 진행해 주세요.",
    )


@router.post("/signup/email-code/verify", response_model=MeResponse)
@limiter.limit("30/minute")
async def verify_signup_email_code(
    request: Request,
    payload: SignupEmailCodeVerify,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user),
):
    _ = (request, payload, db, me)
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="이메일 2차 인증 기능은 폐기되었습니다. OAuth 로그인 후 바로 회원가입을 진행해 주세요.",
    )


@router.post("/signup", response_model=MeResponse)
@limiter.limit("10/minute")
async def complete_signup(
    request: Request,
    payload: SignupRequest,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user),
):
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
        me.display_name = _PROTECTED_ADMIN_DISPLAY_NAME
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
    # 가입 완료 시점에는 OAuth 프로필 이미지를 기본값으로 사용하지 않습니다.
    # (프론트의 기본 아바타를 노출하고, 사용자가 직접 선택할 수 있게 유지)
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


@router.patch("/me/profile", response_model=MeResponse)
@limiter.limit("20/minute")
async def update_my_profile(
    request: Request,
    payload: ProfileUpdateRequest,
    claims: Annotated[dict, Depends(get_token_payload)],
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
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
            try:
                validated_url = _validate_avatar_url_value(str(raw))
                # Explicitly set avatar_url first, then set avatar_sync_oauth
                me.avatar_url = validated_url
                me.avatar_sync_oauth = False
                changed = True
            except HTTPException:
                raise  # Re-raise validation errors immediately

    if _is_protected_account(me):
        if me.display_name != _PROTECTED_ADMIN_DISPLAY_NAME:
            me.display_name = _PROTECTED_ADMIN_DISPLAY_NAME
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


@router.get("/me/posts", response_model=MyPostListResponse)
async def get_my_posts(
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    # Optimize: Use window function COUNT(*)OVER() to get total in single query instead of 2 queries
    where_posts = (Post.author_id == me.id, Post.deleted_at.is_(None))
    offset = (page - 1) * page_size
    stmt = (
        select(
            Post,
            func.count(Post.id).over().label('_total')
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


@router.get("/me/comments", response_model=MyCommentListResponse)
async def get_my_comments(
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    # Optimize: Use window function COUNT(*)OVER() to get total in single query instead of 2 queries
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
            func.count(Comment.id).over().label('_total')
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


@router.get("/users/{user_id}", response_model=UserPublicProfileResponse)
@limiter.limit("60/minute")
async def get_user_public_profile(
    request: Request,
    user_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User | None = Depends(get_optional_current_user),
    posts_page: int = Query(1, ge=1),
    posts_page_size: int = Query(10, ge=1, le=50),
    comments_page: int = Query(1, ge=1),
    comments_page_size: int = Query(10, ge=1, le=50),
):
    _ = request
    uid = try_parse_uuid(user_id)
    if uid is not None:
        user = await db.get(User, uid)
    else:
        user = (
            await db.execute(select(User).where(User.public_id == user_id))
        ).scalar_one_or_none()
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
    posts_total = (
        await db.execute(select(func.count()).select_from(Post).where(*where_posts))
    ).scalar_one()
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


async def _list_posts_core(
    db: AsyncSession,
    me: User | None,
    *,
    forum_only: bool,
    board_kind: str | None,
    limit: int,
    cursor: str | None,
    sort: str,
    page: int,
    q: str | None,
) -> PostListResponse:
    c_count = select(func.count(Comment.id)).where(Comment.post_id == Post.id).scalar_subquery()
    l_count = (
        select(func.count())
        .select_from(PostLike)
        .where(PostLike.post_id == Post.id)
        .scalar_subquery()
    )
    if me is not None:
        liked = (
            select(func.count())
            .select_from(PostLike)
            .where(PostLike.post_id == Post.id, PostLike.user_id == me.id)
            .scalar_subquery()
        )
    else:
        liked = select(literal(0)).scalar_subquery()

    where_clauses = [Post.deleted_at.is_(None), Post.is_hidden.is_(False)]
    if forum_only:
        where_clauses.append(Post.board_category.is_(None))
    else:
        if board_kind is None:
            where_clauses.append(Post.board_category.in_(("notice", "free", "patch")))
        else:
            where_clauses.append(Post.board_category == board_kind)

    q_norm = (q or "").strip()
    if q_norm:
        escaped = q_norm.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        where_clauses.append(
            or_(
                Post.title.ilike(pattern, escape="\\"),
                Post.body.ilike(pattern, escape="\\"),
            )
        )

    sort_key = (sort or "new").lower()
    if sort_key not in ("new", "old", "likes", "comments"):
        sort_key = "new"

    stmt = (
        select(Post, c_count, l_count, liked)
        .join(User, Post.author_id == User.id)
        .options(selectinload(Post.author))
        .where(*where_clauses)
    )

    next_cursor: str | None = None
    next_page: int | None = None

    if sort_key in ("likes", "comments"):
        if sort_key == "likes":
            stmt = stmt.order_by(l_count.desc(), Post.created_at.desc(), Post.id.desc())
        else:
            stmt = stmt.order_by(c_count.desc(), Post.created_at.desc(), Post.id.desc())
        offset = max(0, (page - 1) * limit)
        stmt = stmt.offset(offset).limit(limit + 1)
        rows = (await db.execute(stmt)).all()
        has_more = len(rows) > limit
        rows = rows[:limit]
        if has_more:
            next_page = page + 1
    else:
        ascending = sort_key == "old"
        if ascending:
            stmt = stmt.order_by(Post.created_at.asc(), Post.id.asc())
        else:
            stmt = stmt.order_by(Post.created_at.desc(), Post.id.desc())
        stmt = stmt.limit(limit + 1)
        if cursor:
            t, i = _decode_cursor(cursor)
            if ascending:
                stmt = stmt.where((Post.created_at > t) | ((Post.created_at == t) & (Post.id > i)))
            else:
                stmt = stmt.where((Post.created_at < t) | ((Post.created_at == t) & (Post.id < i)))
        rows = (await db.execute(stmt)).all()
        has_more = len(rows) > limit
        rows = rows[:limit]
        if has_more and rows:
            last = rows[-1][0]
            next_cursor = _encode_cursor(last.created_at, last.id)

    items: list[PostListItem] = []
    for post, cc, lc, lm in rows:
        body_preview = post.body if len(post.body) <= _PREVIEW_LEN else post.body[:_PREVIEW_LEN] + "…"
        pgn_stripped = post.pgn_text.strip() if post.pgn_text and post.pgn_text.strip() else None
        items.append(
            PostListItem(
                id=post.id,
                public_id=post.public_id,
                title=post.title,
                body_preview=body_preview,
                created_at=post.created_at,
                updated_at=post.updated_at,
                board_category=post.board_category,
                author=_author_out(post.author),
                comment_count=int(cc),
                like_count=int(lc),
                liked_by_me=bool(lm),
                has_pgn=bool(pgn_stripped),
                has_fen=bool(post.fen_initial and post.fen_initial.strip()),
                thumbnail_fen=thumbnail_fen_for_post(post.pgn_text, post.fen_initial),
                pgn_text=pgn_stripped,
            )
        )

    return PostListResponse(items=items, next_cursor=next_cursor, next_page=next_page)


@router.get("/posts", response_model=PostListResponse)
@limiter.limit("120/minute")
async def list_posts(
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    me: User | None = Depends(get_optional_current_user),
    limit: int = Query(20, ge=1, le=50),
    cursor: str | None = None,
    sort: str = Query("new"),
    page: int = Query(1, ge=1, le=500),
    q: str | None = Query(None, min_length=1, max_length=100),
):
    _ = request
    return await _list_posts_core(
        db,
        me,
        forum_only=True,
        board_kind=None,
        limit=limit,
        cursor=cursor,
        sort=sort,
        page=page,
        q=q,
    )


@router.get("/board/posts", response_model=PostListResponse)
@limiter.limit("120/minute")
async def list_board_posts(
    request: Request,
    kind: str | None = Query(
        None,
        description="Optional: notice, free, or patch. Omit to list all board kinds.",
    ),
    db: AsyncSession = Depends(get_async_session),
    me: User | None = Depends(get_optional_current_user),
    limit: int = Query(20, ge=1, le=50),
    cursor: str | None = None,
    sort: str = Query("new"),
    page: int = Query(1, ge=1, le=500),
    q: str | None = Query(None, min_length=1, max_length=100),
):
    _ = request
    if kind is not None and kind not in ("notice", "free", "patch"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="kind must be notice, free, patch, or omitted",
        )
    return await _list_posts_core(
        db,
        me,
        forum_only=False,
        board_kind=kind,
        limit=limit,
        cursor=cursor,
        sort=sort,
        page=page,
        q=q,
    )


@router.get("/posts/{post_id}", response_model=PostDetail)
@limiter.limit("60/minute")
async def get_post(
    request: Request,
    post_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User | None = Depends(get_optional_current_user),
):
    _ = request
    post = await _load_visible_post_by_route_key(db, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    pid = post.id
    cc = await db.scalar(select(func.count(Comment.id)).where(Comment.post_id == pid))
    lc = await db.scalar(select(func.count()).select_from(PostLike).where(PostLike.post_id == pid))
    liked = False
    if me is not None:
        liked = bool(
            await db.scalar(
                select(func.count())
                .select_from(PostLike)
                .where(PostLike.post_id == pid, PostLike.user_id == me.id)
            )
        )

    comments_out = []
    for c in _ordered_threaded_comments(post.comments):
        can_c = me is not None and (c.author_id == me.id or _can_moderate_all_content(me))
        comments_out.append(
            CommentOut(
                id=c.id,
                body=c.body,
                created_at=c.created_at,
                parent_comment_id=c.parent_comment_id,
                author=_author_out(c.author),
                can_edit=can_c,
            )
        )

    return PostDetail(
        id=post.id,
        public_id=post.public_id,
        title=post.title,
        body=post.body,
        pgn_text=post.pgn_text,
        fen_initial=post.fen_initial,
        board_annotations=post.board_annotations,
        board_category=post.board_category,
        created_at=post.created_at,
        updated_at=post.updated_at,
        author=_author_out(post.author),
        comment_count=int(cc or 0),
        like_count=int(lc or 0),
        liked_by_me=liked,
        comments=comments_out,
        can_edit=me is not None and _can_edit_post(me, post),
    )


@router.post("/posts", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_post(
    request: Request,
    body: PostCreate,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    try:
        validate_pgn_optional(body.pgn_text)
        validate_fen_optional(body.fen_initial)
        ann = validate_board_annotations_payload(body.board_annotations)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    pub = await _next_unique_public_id(db)
    post = Post(
        author_id=me.id,
        public_id=pub,
        title=body.title.strip(),
        body=body.body,
        pgn_text=body.pgn_text.strip() if body.pgn_text else None,
        fen_initial=body.fen_initial.strip() if body.fen_initial else None,
        board_annotations=ann,
        board_category=None,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return {"id": str(post.id), "public_id": post.public_id}


@router.post("/board/posts", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_board_post(
    request: Request,
    body: BoardPostCreate,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    if body.kind in ("notice", "patch"):
        if not _is_admin_user(me):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="공지·패치노트는 관리자만 작성할 수 있습니다.",
            )
    elif body.kind != "free":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid kind")

    pub = await _next_unique_public_id(db)
    board_cat = {"notice": "notice", "patch": "patch", "free": "free"}[body.kind]
    post = Post(
        author_id=me.id,
        public_id=pub,
        title=body.title.strip(),
        body=body.body,
        board_category=board_cat,
        pgn_text=None,
        fen_initial=None,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return {"id": str(post.id), "public_id": post.public_id}


@router.patch("/posts/{post_id}")
@limiter.limit("30/minute")
async def update_post(
    request: Request,
    post_id: str,
    body: PostUpdate,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    pid = parse_uuid(post_id, field="post_id")
    post = await db.get(Post, pid)
    if post is None or post.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if not _can_edit_post(me, post):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    patch = body.model_dump(exclude_unset=True)
    if "title" in patch:
        post.title = body.title.strip()  # type: ignore[union-attr]
    if "body" in patch:
        post.body = body.body  # type: ignore[assignment]
    if "pgn_text" in patch:
        post.pgn_text = body.pgn_text.strip() if body.pgn_text else None  # type: ignore[union-attr]
    if "fen_initial" in patch:
        post.fen_initial = body.fen_initial.strip() if body.fen_initial else None  # type: ignore[union-attr]
    if "board_annotations" in patch:
        try:
            if body.board_annotations is None:
                post.board_annotations = None
            else:
                post.board_annotations = validate_board_annotations_payload(body.board_annotations)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        validate_pgn_optional(post.pgn_text)
        validate_fen_optional(post.fen_initial)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await db.commit()
    return {"ok": True}


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_post(
    request: Request,
    post_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    pid = parse_uuid(post_id, field="post_id")
    post = await db.get(Post, pid)
    if post is None or post.deleted_at is not None or post.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    await _assert_not_protected_content(db, actor=me, post=post)
    if not _can_edit_post(me, post):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    post.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/posts/{post_id}/like")
@limiter.limit("60/minute")
async def like_post(
    request: Request,
    post_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    pid = parse_uuid(post_id, field="post_id")
    post = await db.get(Post, pid)
    if post is None or post.deleted_at is not None or post.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    existing = (
        await db.execute(select(PostLike).where(PostLike.user_id == me.id, PostLike.post_id == pid))
    ).scalar_one_or_none()
    if existing is None:
        db.add(PostLike(user_id=me.id, post_id=pid))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
    return {"ok": True}


@router.delete("/posts/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def unlike_post(
    request: Request,
    post_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    pid = parse_uuid(post_id, field="post_id")
    res = await db.execute(select(PostLike).where(PostLike.user_id == me.id, PostLike.post_id == pid))
    like = res.scalar_one_or_none()
    if like is not None:
        await db.delete(like)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED)
@limiter.limit("40/minute")
async def add_comment(
    request: Request,
    post_id: str,
    body: CommentCreate,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    pid = parse_uuid(post_id, field="post_id")
    post = await db.get(Post, pid)
    if post is None or post.deleted_at is not None or post.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    parent_id = body.parent_comment_id
    if parent_id is not None:
        parent = await db.get(Comment, parent_id)
        if (
            parent is None
            or parent.post_id != pid
            or parent.deleted_at is not None
            or parent.is_hidden
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent comment not found",
            )
        if parent.parent_comment_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="답글에는 답글을 달 수 없습니다.",
            )

    c = Comment(
        post_id=pid,
        author_id=me.id,
        body=body.body.strip(),
        parent_comment_id=parent_id,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"id": str(c.id)}


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("40/minute")
async def delete_comment(
    request: Request,
    comment_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    cid = parse_uuid(comment_id, field="comment_id")
    c = await db.get(Comment, cid)
    if c is None or c.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    await _assert_not_protected_content(db, actor=me, comment=c)
    if c.author_id != me.id and not _can_moderate_all_content(me):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    c.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/comments/{comment_id}")
@limiter.limit("40/minute")
async def update_comment(
    request: Request,
    comment_id: str,
    body: CommentUpdate,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    cid = parse_uuid(comment_id, field="comment_id")
    c = await db.get(Comment, cid)
    if c is None or c.deleted_at is not None or c.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    post = await db.get(Post, c.post_id)
    if post is None or post.deleted_at is not None or post.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if c.author_id != me.id and not _can_moderate_all_content(me):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    c.body = body.body.strip()
    await db.commit()
    return {"ok": True}


_REPORTS_AUTO_THRESHOLD = 10


@router.post("/reports", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_report(
    request: Request,
    payload: ReportCreate,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    if bool(payload.post_id) == bool(payload.comment_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Specify either post_id or comment_id")

    if payload.post_id:
        post = await db.get(Post, payload.post_id, with_for_update=True)
        if post is None or post.deleted_at is not None or post.is_hidden:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
        await _assert_not_protected_content(db, post=post)
        post_author = await db.get(User, post.author_id)
        if post_author is not None and _is_admin_user(post_author):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="관리자가 작성한 글은 신고할 수 없습니다.",
            )
    else:
        c0 = await db.get(Comment, payload.comment_id)
        if c0 is None or c0.deleted_at is not None or c0.is_hidden:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        post = await db.get(Post, c0.post_id, with_for_update=True)
        if post is None or post.deleted_at is not None or post.is_hidden:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
        comment_locked = await db.get(Comment, payload.comment_id, with_for_update=True)
        if comment_locked is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        await _assert_not_protected_content(db, comment=comment_locked)
        comment_author = await db.get(User, comment_locked.author_id)
        if comment_author is not None and _is_admin_user(comment_author):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="관리자가 작성한 댓글은 신고할 수 없습니다.",
            )

    report = Report(
        reporter_id=me.id,
        post_id=payload.post_id,
        comment_id=payload.comment_id,
        reason=payload.reason.strip(),
    )
    db.add(report)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 해당 글 또는 댓글을 신고한 기록이 있습니다.",
        ) from None

    now = datetime.now(timezone.utc)
    if payload.post_id:
        subq = (
            select(Report.reporter_id)
            .where(
                Report.post_id == payload.post_id,
                Report.comment_id.is_(None),
                Report.status == "open",
            )
            .distinct()
            .subquery()
        )
        n = int(await db.scalar(select(func.count()).select_from(subq)) or 0)
        if n >= _REPORTS_AUTO_THRESHOLD:
            if post.deleted_at is None:
                post.deleted_at = now
            await db.execute(
                update(Report)
                .where(
                    Report.post_id == payload.post_id,
                    Report.comment_id.is_(None),
                    Report.status == "open",
                )
                .values(status="auto_closed")
            )
            await _add_moderation_log(
                db,
                actor_user_id=me.id,
                action="auto_delete_post",
                target_type="post",
                target_id=payload.post_id,
                details="reports_threshold",
            )
    else:
        assert payload.comment_id is not None
        subq = (
            select(Report.reporter_id)
            .where(Report.comment_id == payload.comment_id, Report.status == "open")
            .distinct()
            .subquery()
        )
        n = int(await db.scalar(select(func.count()).select_from(subq)) or 0)
        if n >= _REPORTS_AUTO_THRESHOLD:
            if comment_locked.deleted_at is None:
                comment_locked.deleted_at = now
            await db.execute(
                update(Report)
                .where(Report.comment_id == payload.comment_id, Report.status == "open")
                .values(status="auto_closed")
            )
            await _add_moderation_log(
                db,
                actor_user_id=me.id,
                action="auto_delete_comment",
                target_type="comment",
                target_id=payload.comment_id,
                details="reports_threshold",
            )

    await db.commit()
    await db.refresh(report)
    return {"id": str(report.id)}


async def _add_moderation_log(
    db: AsyncSession,
    *,
    actor_user_id: uuid.UUID,
    action: str,
    target_type: str,
    target_id: uuid.UUID,
    details: str | None,
) -> None:
    db.add(
        ModerationLog(
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
        )
    )


@router.post("/admin/posts/{post_id}/hide")
@limiter.limit("30/minute")
async def admin_hide_post(
    request: Request,
    post_id: str,
    payload: ModerationRequest,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_admin),
):
    _ = request
    pid = parse_uuid(post_id, field="post_id")
    post = await db.get(Post, pid)
    if post is None or post.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    await _assert_not_protected_content(db, actor=me, post=post)
    post.is_hidden = True
    post.hidden_reason = payload.reason.strip()
    post.hidden_by_id = me.id
    await _add_moderation_log(
        db,
        actor_user_id=me.id,
        action="hide_post",
        target_type="post",
        target_id=post.id,
        details=payload.reason.strip(),
    )
    await db.commit()
    return {"ok": True}


@router.post("/admin/posts/{post_id}/restore")
@limiter.limit("30/minute")
async def admin_restore_post(
    request: Request,
    post_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_admin),
):
    _ = request
    pid = parse_uuid(post_id, field="post_id")
    post = await db.get(Post, pid)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    post.is_hidden = False
    post.hidden_reason = None
    post.hidden_by_id = None
    post.deleted_at = None
    await _add_moderation_log(
        db,
        actor_user_id=me.id,
        action="restore_post",
        target_type="post",
        target_id=post.id,
        details=None,
    )
    await db.commit()
    return {"ok": True}


@router.post("/admin/comments/{comment_id}/hide")
@limiter.limit("30/minute")
async def admin_hide_comment(
    request: Request,
    comment_id: str,
    payload: ModerationRequest,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_admin),
):
    _ = request
    cid = parse_uuid(comment_id, field="comment_id")
    comment = await db.get(Comment, cid)
    if comment is None or comment.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    await _assert_not_protected_content(db, actor=me, comment=comment)
    comment.is_hidden = True
    comment.hidden_reason = payload.reason.strip()
    comment.hidden_by_id = me.id
    await _add_moderation_log(
        db,
        actor_user_id=me.id,
        action="hide_comment",
        target_type="comment",
        target_id=comment.id,
        details=payload.reason.strip(),
    )
    await db.commit()
    return {"ok": True}


@router.post("/admin/reports/{report_id}/resolve")
@limiter.limit("30/minute")
async def admin_resolve_report(
    request: Request,
    report_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_admin),
):
    _ = request
    rid = parse_uuid(report_id, field="report_id")
    report = await db.get(Report, rid)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    report.status = "resolved"
    await _add_moderation_log(
        db,
        actor_user_id=me.id,
        action="resolve_report",
        target_type="report",
        target_id=report.id,
        details=None,
    )
    await db.commit()
    return {"ok": True}


@router.post("/upload", response_model=UploadResponse)
@limiter.limit("20/minute")
async def upload_forum_image(
    request: Request,
    file: UploadFile = File(...),
    me: User = Depends(get_current_user_completed),
):
    _ = request
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
