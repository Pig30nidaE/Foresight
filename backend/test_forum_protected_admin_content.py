from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes.forum import _assert_not_protected_content


class FakeDB:
    def __init__(self, users):
        self.users = users

    async def get(self, model, object_id):
        _ = model
        return self.users.get(object_id)


@pytest.mark.asyncio
async def test_protected_admin_can_manage_own_post():
    admin_id = object()
    protected_email = "admin@foresight.app"
    actor = SimpleNamespace(id=admin_id, role="admin", email=protected_email)
    author = SimpleNamespace(id=admin_id, role="admin", email=protected_email)
    post = SimpleNamespace(author_id=admin_id)

    db = FakeDB({admin_id: author})

    await _assert_not_protected_content(db, actor=actor, post=post)


@pytest.mark.asyncio
async def test_protected_admin_cannot_manage_other_protected_content():
    owner_id = object()
    actor_id = object()
    protected_email = "admin@foresight.app"
    actor = SimpleNamespace(id=actor_id, role="admin", email=protected_email)
    author = SimpleNamespace(id=owner_id, role="admin", email=protected_email)
    post = SimpleNamespace(author_id=owner_id)

    db = FakeDB({owner_id: author})

    with pytest.raises(HTTPException):
        await _assert_not_protected_content(db, actor=actor, post=post)
