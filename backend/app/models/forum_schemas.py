import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AuthorOut(BaseModel):
    id: uuid.UUID
    public_id: str
    display_name: str
    avatar_url: str | None = None
    role: str = "user"

    model_config = {"from_attributes": True}


class PostListItem(BaseModel):
    id: uuid.UUID
    public_id: str
    title: str
    body_preview: str
    created_at: datetime
    updated_at: datetime
    board_category: str | None = None
    author: AuthorOut
    comment_count: int
    like_count: int
    liked_by_me: bool = False
    has_pgn: bool = False
    has_fen: bool = False
    thumbnail_fen: str | None = None


class PostListResponse(BaseModel):
    items: list[PostListItem]
    next_cursor: str | None = None
    next_page: int | None = None


class CommentOut(BaseModel):
    id: uuid.UUID
    body: str
    created_at: datetime
    author: AuthorOut
    can_edit: bool = False

    model_config = {"from_attributes": True}


class PostDetail(BaseModel):
    id: uuid.UUID
    public_id: str
    title: str
    body: str
    pgn_text: str | None = None
    fen_initial: str | None = None
    board_category: str | None = None
    created_at: datetime
    updated_at: datetime
    author: AuthorOut
    comment_count: int
    like_count: int
    liked_by_me: bool = False
    comments: list[CommentOut]
    can_edit: bool = False


class PostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=50_000)
    pgn_text: str | None = Field(None, max_length=200_000)
    fen_initial: str | None = Field(None, max_length=120)


class BoardPostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=50_000)
    kind: Literal["notice", "free", "patch"]


class PostUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    body: str | None = Field(None, min_length=1, max_length=50_000)
    pgn_text: str | None = Field(None, max_length=200_000)
    fen_initial: str | None = Field(None, max_length=120)


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=10_000)


class CommentUpdate(BaseModel):
    body: str = Field(..., min_length=1, max_length=10_000)


class UploadResponse(BaseModel):
    url: str
    content_type: str


class SignupRequest(BaseModel):
    display_name: str = Field(..., min_length=2, max_length=50)
    agree_terms: bool


class MeResponse(BaseModel):
    id: uuid.UUID
    public_id: str
    email: str | None = None
    display_name: str
    avatar_url: str | None = None
    role: str
    signup_completed: bool
    profile_public: bool = True
    # Another account already uses this email (incomplete signup UX).
    email_conflict: bool = False
    masked_conflict_email: str | None = None
    # OAuth email present but not yet verified (signup incomplete).
    needs_email_verification: bool = False
    email_verified: bool = False


class SignupEmailCodeVerify(BaseModel):
    code: str = Field(..., pattern=r"^[0-9]{6}$")


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(None, min_length=2, max_length=50)
    profile_public: bool | None = None
    # Set to uploaded image URL (e.g. from POST /forum/upload). Omit for no change.
    avatar_url: str | None = Field(None, max_length=2048)
    # Use site default image (frontend); clears DB URL and stops OAuth overwrite.
    use_site_default_avatar: bool | None = None
    # Restore avatar from OAuth claims in the current JWT.
    restore_oauth_avatar: bool | None = None


class MyPostListItem(BaseModel):
    id: uuid.UUID
    public_id: str
    title: str
    body_preview: str
    created_at: datetime
    updated_at: datetime
    board_category: str | None = None


class MyPostListResponse(BaseModel):
    items: list[MyPostListItem]
    total: int = 0


class MyCommentListItem(BaseModel):
    id: uuid.UUID
    body: str
    created_at: datetime
    post_id: uuid.UUID
    post_public_id: str
    post_title: str
    post_board_category: str | None = None


class MyCommentListResponse(BaseModel):
    items: list[MyCommentListItem]
    total: int = 0


class UserPublicProfileResponse(BaseModel):
    id: uuid.UUID
    public_id: str
    display_name: str
    avatar_url: str | None = None
    profile_public: bool
    # True when the viewer may see posts and comments (public profile or viewing own profile).
    activity_visible: bool
    posts: list[MyPostListItem] = []
    comments: list[MyCommentListItem] = []
    posts_total: int = 0
    comments_total: int = 0


class ReportCreate(BaseModel):
    post_id: uuid.UUID | None = None
    comment_id: uuid.UUID | None = None
    reason: str = Field(..., min_length=5, max_length=500)


class ModerationRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


