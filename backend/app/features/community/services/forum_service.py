import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import parse_uuid
from app.db.models.forum import Comment, ModerationLog, Post, PostLike, Report, User
from app.models.forum_schemas import (
    BoardPostCreate,
    CommentCreate,
    CommentUpdate,
    ModerationRequest,
    PostCreate,
    PostUpdate,
    ReportCreate,
)
from app.shared.forum_board_annotations import validate_board_annotations_payload
from app.shared.forum_chess import validate_fen_optional, validate_pgn_optional
from app.shared.forum_public_id import new_post_public_id
from app.shared.protected_admin import is_protected_admin_email

_PREVIEW_LEN = 280
_REPORTS_AUTO_THRESHOLD = 10


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
    return is_protected_admin_email(user.email)


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


async def _next_unique_public_id(db: AsyncSession) -> str:
    for _ in range(64):
        nid = new_post_public_id()
        taken = await db.scalar(select(func.count()).select_from(Post).where(Post.public_id == nid))
        if not taken:
            return nid
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate post id",
    )


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


async def create_post(*, db: AsyncSession, me: User, body: PostCreate) -> dict:
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


async def create_board_post(*, db: AsyncSession, me: User, body: BoardPostCreate) -> dict:
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


async def update_post(*, db: AsyncSession, me: User, post_id: str, body: PostUpdate) -> dict:
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


async def delete_post(*, db: AsyncSession, me: User, post_id: str) -> None:
    pid = parse_uuid(post_id, field="post_id")
    post = await db.get(Post, pid)
    if post is None or post.deleted_at is not None or post.is_hidden:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    await _assert_not_protected_content(db, actor=me, post=post)
    if not _can_edit_post(me, post):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    post.deleted_at = datetime.now(timezone.utc)
    await db.commit()


async def like_post(*, db: AsyncSession, me: User, post_id: str) -> dict:
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


async def unlike_post(*, db: AsyncSession, me: User, post_id: str) -> None:
    pid = parse_uuid(post_id, field="post_id")
    res = await db.execute(select(PostLike).where(PostLike.user_id == me.id, PostLike.post_id == pid))
    like = res.scalar_one_or_none()
    if like is not None:
        await db.delete(like)
        await db.commit()


async def add_comment(*, db: AsyncSession, me: User, post_id: str, body: CommentCreate) -> dict:
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


async def delete_comment(*, db: AsyncSession, me: User, comment_id: str) -> None:
    cid = parse_uuid(comment_id, field="comment_id")
    c = await db.get(Comment, cid)
    if c is None or c.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    await _assert_not_protected_content(db, actor=me, comment=c)
    if c.author_id != me.id and not _can_moderate_all_content(me):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    c.deleted_at = datetime.now(timezone.utc)
    await db.commit()


async def update_comment(*, db: AsyncSession, me: User, comment_id: str, body: CommentUpdate) -> dict:
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


async def create_report(*, db: AsyncSession, me: User, payload: ReportCreate) -> dict:
    if bool(payload.post_id) == bool(payload.comment_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Specify either post_id or comment_id")

    comment_locked: Comment | None = None

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
        assert comment_locked is not None
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


async def admin_hide_post(*, db: AsyncSession, me: User, post_id: str, payload: ModerationRequest) -> dict:
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


async def admin_restore_post(*, db: AsyncSession, me: User, post_id: str) -> dict:
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


async def admin_hide_comment(*, db: AsyncSession, me: User, comment_id: str, payload: ModerationRequest) -> dict:
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


async def admin_resolve_report(*, db: AsyncSession, me: User, report_id: str) -> dict:
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
