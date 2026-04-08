from typing import Annotated
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_admin,
    get_current_user,
    get_current_user_completed,
    get_optional_current_user,
    get_token_payload,
)
from app.api.routes import profile_handlers
from app.features.community.services import forum_service
from app.features.community.services import forum_read_service
from app.core.limiter import limiter
from app.db.models.forum import User
from app.db.session import get_async_session
from app.models.forum_schemas import (
    AccountWithdrawRequest,
    BoardPostCreate,
    CommentCreate,
    CommentUpdate,
    MeResponse,
    MyCommentListResponse,
    MyPostListResponse,
    ModerationRequest,
    PostCreate,
    PostDetail,
    PostListResponse,
    PostUpdate,
    ReportCreate,
    ProfileUpdateRequest,
    SignupEmailCodeVerify,
    SignupRequest,
    UserPublicProfileResponse,
    UploadResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/me", response_model=MeResponse)
async def get_me(
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await profile_handlers.get_me_handler(me=me, db=db)


@router.post("/signup/email-code/request")
@limiter.limit("5/minute")
async def request_signup_email_code(
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user),
):
    return await profile_handlers.request_signup_email_code_handler(
        request=request,
        db=db,
        me=me,
    )


@router.post("/signup/email-code/verify", response_model=MeResponse)
@limiter.limit("30/minute")
async def verify_signup_email_code(
    request: Request,
    payload: SignupEmailCodeVerify,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user),
):
    return await profile_handlers.verify_signup_email_code_handler(
        request=request,
        payload=payload,
        db=db,
        me=me,
    )


@router.post("/signup", response_model=MeResponse)
@limiter.limit("10/minute")
async def complete_signup(
    request: Request,
    payload: SignupRequest,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user),
):
    return await profile_handlers.complete_signup_handler(
        request=request,
        payload=payload,
        db=db,
        me=me,
    )


@router.patch("/me/profile", response_model=MeResponse)
@limiter.limit("20/minute")
async def update_my_profile(
    request: Request,
    payload: ProfileUpdateRequest,
    claims: Annotated[dict, Depends(get_token_payload)],
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    return await profile_handlers.update_my_profile_handler(
        request=request,
        payload=payload,
        claims=claims,
        db=db,
        me=me,
    )


@router.post("/me/withdraw", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/hour")
async def withdraw_my_account(
    request: Request,
    payload: AccountWithdrawRequest,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user),
):
    await profile_handlers.withdraw_my_account_handler(
        request=request,
        payload=payload,
        db=db,
        me=me,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/posts", response_model=MyPostListResponse)
async def get_my_posts(
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    return await profile_handlers.get_my_posts_handler(
        db=db,
        me=me,
        page=page,
        page_size=page_size,
    )


@router.get("/me/comments", response_model=MyCommentListResponse)
async def get_my_comments(
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    return await profile_handlers.get_my_comments_handler(
        db=db,
        me=me,
        page=page,
        page_size=page_size,
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
    return await profile_handlers.get_user_public_profile_handler(
        request=request,
        user_id=user_id,
        db=db,
        me=me,
        posts_page=posts_page,
        posts_page_size=posts_page_size,
        comments_page=comments_page,
        comments_page_size=comments_page_size,
    )


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
    return await forum_read_service.list_forum_posts(
        db=db,
        me=me,
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
    return await forum_read_service.list_board_posts(
        db=db,
        me=me,
        kind=kind,
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
    return await forum_read_service.get_post_detail(
        db=db,
        me=me,
        post_id=post_id,
    )


@router.post("/posts", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_post(
    request: Request,
    body: PostCreate,
    db: AsyncSession = Depends(get_async_session),
    me: User | None = Depends(get_optional_current_user),
):
    _ = request
    return await forum_service.create_post(db=db, me=me, body=body)


@router.post("/board/posts", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_board_post(
    request: Request,
    body: BoardPostCreate,
    db: AsyncSession = Depends(get_async_session),
    me: User | None = Depends(get_optional_current_user),
):
    _ = request
    return await forum_service.create_board_post(db=db, me=me, body=body)


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
    return await forum_service.update_post(db=db, me=me, post_id=post_id, body=body)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_post(
    request: Request,
    post_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    await forum_service.delete_post(db=db, me=me, post_id=post_id)
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
    return await forum_service.like_post(db=db, me=me, post_id=post_id)


@router.delete("/posts/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def unlike_post(
    request: Request,
    post_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    await forum_service.unlike_post(db=db, me=me, post_id=post_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED)
@limiter.limit("40/minute")
async def add_comment(
    request: Request,
    post_id: str,
    body: CommentCreate,
    db: AsyncSession = Depends(get_async_session),
    me: User | None = Depends(get_optional_current_user),
):
    _ = request
    return await forum_service.add_comment(db=db, me=me, post_id=post_id, body=body)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("40/minute")
async def delete_comment(
    request: Request,
    comment_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    await forum_service.delete_comment(db=db, me=me, comment_id=comment_id)
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
    return await forum_service.update_comment(db=db, me=me, comment_id=comment_id, body=body)


@router.post("/reports", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_report(
    request: Request,
    payload: ReportCreate,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_user_completed),
):
    _ = request
    return await forum_service.create_report(db=db, me=me, payload=payload)


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
    return await forum_service.admin_hide_post(db=db, me=me, post_id=post_id, payload=payload)


@router.post("/admin/posts/{post_id}/restore")
@limiter.limit("30/minute")
async def admin_restore_post(
    request: Request,
    post_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_admin),
):
    _ = request
    return await forum_service.admin_restore_post(db=db, me=me, post_id=post_id)


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
    return await forum_service.admin_hide_comment(db=db, me=me, comment_id=comment_id, payload=payload)


@router.post("/admin/reports/{report_id}/resolve")
@limiter.limit("30/minute")
async def admin_resolve_report(
    request: Request,
    report_id: str,
    db: AsyncSession = Depends(get_async_session),
    me: User = Depends(get_current_admin),
):
    _ = request
    return await forum_service.admin_resolve_report(db=db, me=me, report_id=report_id)


@router.post("/upload", response_model=UploadResponse)
@limiter.limit("20/minute")
async def upload_forum_image(
    request: Request,
    file: UploadFile = File(...),
    me: User = Depends(get_current_user_completed),
):
    return await profile_handlers.upload_forum_image_handler(
        request=request,
        file=file,
        me=me,
    )


@router.post("/recognize-board")
@limiter.limit("5/minute")
async def recognize_board(
    request: Request,
    file: UploadFile = File(...),
    me: User = Depends(get_current_user_completed),
):
    """Upload a chess board image and get the FEN position back."""
    import asyncio
    import magic as _magic

    from app.shared.forum_board_recognition import is_recognition_available, recognize_board_from_image

    _ = (request, me)

    if not is_recognition_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Board recognition is not available (chessimg2pos not installed)",
        )

    try:
        data = await file.read()
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 10MB)")

        mime = _magic.from_buffer(data, mime=True)
        if mime not in ("image/jpeg", "image/png", "image/webp"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported file type. Use jpeg, png, or webp.",
            )

        try:
            result = await asyncio.to_thread(recognize_board_from_image, data)
        except Exception as exc:
            logger.exception("Board recognition failed")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Board recognition failed. Please upload a clearer board image.",
            ) from exc

        return result
    finally:
        await file.close()
