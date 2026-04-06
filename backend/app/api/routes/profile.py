from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import profile_handlers
from app.api.deps import (
	get_current_user,
	get_current_user_completed,
	get_optional_current_user,
	get_token_payload,
)
from app.core.limiter import limiter
from app.db.models.forum import User
from app.db.session import get_async_session
from app.models.forum_schemas import (
	MeResponse,
	MyCommentListResponse,
	MyPostListResponse,
	ProfileUpdateRequest,
	SignupEmailCodeVerify,
	SignupRequest,
	UploadResponse,
	UserPublicProfileResponse,
)

router = APIRouter()


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
