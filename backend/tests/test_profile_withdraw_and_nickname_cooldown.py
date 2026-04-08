import sys
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

_magic = MagicMock()
_magic.from_buffer = MagicMock(return_value="image/png")
sys.modules.setdefault("magic", _magic)

from app.api.routes import profile_handlers  # noqa: E402
from app.db.models.forum import AccountDeletionSurvey  # noqa: E402
from app.models.forum_schemas import AccountWithdrawRequest, ProfileUpdateRequest  # noqa: E402


@pytest.mark.anyio
async def test_update_profile_blocks_nickname_change_within_7_days(monkeypatch):
    me = SimpleNamespace(
        id=uuid.uuid4(),
        display_name="Old Name",
        display_name_changed_at=datetime.now(timezone.utc) - timedelta(days=2),
        profile_public=True,
    )
    db = MagicMock()

    monkeypatch.setattr(profile_handlers, "_is_protected_account", lambda _u: False)

    with pytest.raises(HTTPException) as exc:
        await profile_handlers.update_my_profile_handler(
            request=SimpleNamespace(),
            payload=ProfileUpdateRequest(display_name="New Name"),
            claims={},
            db=db,
            me=me,
        )

    assert exc.value.status_code == 400
    assert "닉네임은 7일" in str(exc.value.detail)


@pytest.mark.anyio
async def test_update_profile_changes_nickname_after_cooldown(monkeypatch):
    previous_changed_at = datetime.now(timezone.utc) - timedelta(days=8)
    me = SimpleNamespace(
        id=uuid.uuid4(),
        display_name="Old Name",
        display_name_changed_at=previous_changed_at,
        profile_public=True,
    )
    db = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    async def _fake_me_response(_db, _me):
        return SimpleNamespace(display_name=_me.display_name)

    monkeypatch.setattr(profile_handlers, "_is_protected_account", lambda _u: False)
    monkeypatch.setattr(profile_handlers, "_is_display_name_taken", AsyncMock(return_value=False))
    monkeypatch.setattr(profile_handlers, "_me_response", _fake_me_response)

    await profile_handlers.update_my_profile_handler(
        request=SimpleNamespace(),
        payload=ProfileUpdateRequest(display_name="New Name"),
        claims={},
        db=db,
        me=me,
    )

    assert me.display_name == "New Name"
    assert me.display_name_changed_at > previous_changed_at
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once_with(me)


@pytest.mark.anyio
async def test_withdraw_my_account_saves_survey_and_deletes_user():
    me = SimpleNamespace(id=uuid.uuid4())
    db = MagicMock()
    db.delete = AsyncMock()
    db.commit = AsyncMock()
    recent_claims = {"iat": int(datetime.now(timezone.utc).timestamp())}

    await profile_handlers.withdraw_my_account_handler(
        request=SimpleNamespace(),
        payload=AccountWithdrawRequest(reason_code="low_usage"),
        claims=recent_claims,
        db=db,
        me=me,
    )

    assert db.add.call_count == 1
    added = db.add.call_args.args[0]
    assert isinstance(added, AccountDeletionSurvey)
    assert added.reason_code == "low_usage"
    db.delete.assert_awaited_once_with(me)
    db.commit.assert_awaited_once()


@pytest.mark.anyio
async def test_withdraw_my_account_requires_recent_auth_claims():
    me = SimpleNamespace(id=uuid.uuid4())
    db = MagicMock()
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    stale_claims = {"iat": int((datetime.now(timezone.utc) - timedelta(minutes=10)).timestamp())}

    with pytest.raises(HTTPException) as exc:
        await profile_handlers.withdraw_my_account_handler(
            request=SimpleNamespace(),
            payload=AccountWithdrawRequest(reason_code="low_usage"),
            claims=stale_claims,
            db=db,
            me=me,
        )

    assert exc.value.status_code == 401
    db.delete.assert_not_awaited()
    db.commit.assert_not_awaited()
