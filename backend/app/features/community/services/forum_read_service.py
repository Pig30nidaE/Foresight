import base64
import json
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.forum import Comment, Post, PostLike, User
from app.models.forum_schemas import AuthorOut, CommentOut, PostDetail, PostListItem, PostListResponse
from app.shared.forum_chess import thumbnail_fen_for_post
from app.shared.forum_public_id import try_parse_uuid

_PREVIEW_LEN = 280


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


async def list_forum_posts(
    *,
    db: AsyncSession,
    me: User | None,
    limit: int,
    cursor: str | None,
    sort: str,
    page: int,
    q: str | None,
) -> PostListResponse:
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


async def list_board_posts(
    *,
    db: AsyncSession,
    me: User | None,
    kind: str | None,
    limit: int,
    cursor: str | None,
    sort: str,
    page: int,
    q: str | None,
) -> PostListResponse:
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


async def get_post_detail(*, db: AsyncSession, me: User | None, post_id: str) -> PostDetail:
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
