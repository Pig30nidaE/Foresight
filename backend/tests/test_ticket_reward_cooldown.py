from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.features.community.services.forum_service import _grant_tickets_with_cooldown


def test_grant_tickets_when_no_previous_reward():
    user = SimpleNamespace(analysis_tickets=5, last_ticket_earned_at=None)

    earned = _grant_tickets_with_cooldown(user, 2)

    assert earned == 2
    assert user.analysis_tickets == 7
    assert isinstance(user.last_ticket_earned_at, datetime)


def test_do_not_grant_tickets_within_cooldown_window():
    recent = datetime.now(timezone.utc) - timedelta(minutes=4)
    user = SimpleNamespace(analysis_tickets=9, last_ticket_earned_at=recent)

    earned = _grant_tickets_with_cooldown(user, 2)

    assert earned == 0
    assert user.analysis_tickets == 9
    assert user.last_ticket_earned_at == recent


def test_grant_tickets_after_cooldown_window():
    old = datetime.now(timezone.utc) - timedelta(minutes=6)
    user = SimpleNamespace(analysis_tickets=3, last_ticket_earned_at=old)

    earned = _grant_tickets_with_cooldown(user, 1)

    assert earned == 1
    assert user.analysis_tickets == 4
    assert user.last_ticket_earned_at is not None
    assert user.last_ticket_earned_at > old
