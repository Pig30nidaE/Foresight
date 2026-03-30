"""
Profile list pagination: /me/posts, /me/comments, /users/{id}
Ensures total count + page slicing contract for deploy verification.
"""
import sys
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Avoid native python-magic load during forum import (Windows / CI).
_magic = MagicMock()
_magic.from_buffer = MagicMock(return_value="image/png")
sys.modules.setdefault("magic", _magic)

from app.api.routes import profile as profile_router  # noqa: E402
from app.api.deps import get_current_user_completed, get_optional_current_user  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.db.session import get_async_session  # noqa: E402


class _ScalarCount:
    def __init__(self, n: int):
        self._n = n

    def scalar_one(self):
        return self._n


class _RowsPosts:
    def __init__(self, posts):
        self._posts = posts

    def scalars(self):
        return self

    def all(self):
        return self._posts


class _RowsCommentsJoin:
    def __init__(self, pairs):
        self._pairs = pairs

    def all(self):
        return self._pairs


def _post(i: int):
    return SimpleNamespace(
        id=uuid.uuid4(),
        public_id=f"p{i}",
        title=f"Title {i}",
        body="x" * 50,
        created_at=datetime(2020, 1, 1 + i, tzinfo=timezone.utc),
        updated_at=datetime(2020, 1, 1 + i, tzinfo=timezone.utc),
        board_category=None,
    )


def _comment(i: int, post):
    return SimpleNamespace(
        id=uuid.uuid4(),
        body=f"comment {i}",
        created_at=datetime(2020, 2, 1 + i, tzinfo=timezone.utc),
        post_id=post.id,
    )


@pytest.fixture()
def app_me():
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(profile_router.router, prefix="/api/v1")

    user_id = uuid.uuid4()
    me = SimpleNamespace(id=user_id, signup_completed=True)

    async def override_me():
        return me

    posts = [_post(i) for i in range(12)]

    exec_calls: list = []

    async def fake_execute(stmt):
        exec_calls.append(stmt)
        n = len(exec_calls)
        # get_my_posts: 1=count, 2=page rows (desc created_at → newest first; page 2 skips first 5)
        if n == 1:
            return _ScalarCount(12)
        if n == 2:
            # desc by created_at: i=11 newest; page 2 → i=6..2
            return _RowsPosts([posts[6], posts[5], posts[4], posts[3], posts[2]])
        raise AssertionError(f"unexpected execute call {n}")

    mock_session = MagicMock()
    mock_session.execute = AsyncMock(side_effect=fake_execute)

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_current_user_completed] = override_me
    app.dependency_overrides[get_async_session] = override_db

    yield app
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_me_posts_returns_total_and_second_page(app_me):
    async with AsyncClient(transport=ASGITransport(app=app_me), base_url="http://test") as client:
        resp = await client.get("/api/v1/me/posts", params={"page": 2, "page_size": 5})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 12
    assert len(data["items"]) == 5
    assert data["items"][0]["title"] == "Title 6"


@pytest.fixture()
def app_me_comments():
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(profile_router.router, prefix="/api/v1")

    user_id = uuid.uuid4()
    me = SimpleNamespace(id=user_id, signup_completed=True)

    posts = [_post(i) for i in range(3)]
    comments = [_comment(i, posts[i % 3]) for i in range(10)]

    exec_calls: list = []

    async def fake_execute(stmt):
        exec_calls.append(stmt)
        n = len(exec_calls)
        if n == 1:
            return _ScalarCount(10)
        if n == 2:
            # desc: i=9..0; page 2 → i=4..0
            pairs = [(comments[i], posts[i % 3]) for i in range(4, -1, -1)]
            return _RowsCommentsJoin(pairs)
        raise AssertionError(f"unexpected execute call {n}")

    mock_session = MagicMock()
    mock_session.execute = AsyncMock(side_effect=fake_execute)

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_current_user_completed] = lambda: me
    app.dependency_overrides[get_async_session] = override_db

    yield app
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_me_comments_returns_total_and_page(app_me_comments):
    async with AsyncClient(transport=ASGITransport(app=app_me_comments), base_url="http://test") as client:
        resp = await client.get("/api/v1/me/comments", params={"page": 2, "page_size": 5})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 10
    assert len(data["items"]) == 5
    assert data["items"][0]["body"] == "comment 4"


@pytest.fixture()
def app_public_user():
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(profile_router.router, prefix="/api/v1")

    target_id = uuid.uuid4()

    posts = [_post(i) for i in range(8)]
    comments = [_comment(i, posts[0]) for i in range(4)]

    user_row = SimpleNamespace(
        id=target_id,
        public_id="pubu1",
        display_name="Public",
        avatar_url=None,
        profile_public=True,
        created_at=datetime.now(timezone.utc),
    )

    exec_calls: list = []

    async def fake_execute(stmt):
        exec_calls.append(stmt)
        n = len(exec_calls)
        # posts_total, posts rows, comments_total, comments rows
        if n == 1:
            return _ScalarCount(8)
        if n == 2:
            return _RowsPosts([posts[4], posts[3], posts[2]])
        if n == 3:
            return _ScalarCount(4)
        if n == 4:
            return _RowsCommentsJoin([(comments[2], posts[0])])
        raise AssertionError(f"unexpected execute call {n}")

    mock_session = MagicMock()
    mock_session.execute = AsyncMock(side_effect=fake_execute)
    mock_session.get = AsyncMock(return_value=user_row)

    async def override_db():
        yield mock_session

    async def override_optional():
        return None

    app.dependency_overrides[get_async_session] = override_db
    app.dependency_overrides[get_optional_current_user] = override_optional

    yield app, str(target_id)
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_user_public_profile_posts_comments_totals(app_public_user):
    app, user_id = app_public_user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(
            f"/api/v1/users/{user_id}",
            params={"posts_page": 2, "posts_page_size": 3, "comments_page": 2, "comments_page_size": 1},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == user_id
    assert data["posts_total"] == 8
    assert len(data["posts"]) == 3
    assert data["posts"][0]["title"] == "Title 4"
    assert data["comments_total"] == 4
    assert len(data["comments"]) == 1
    assert data["comments"][0]["body"] == "comment 2"
