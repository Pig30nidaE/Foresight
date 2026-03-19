import asyncio
import pytest

import app.features.opening_tier.services.opening_tier_service as opening_tier_service
from app.features.opening_tier.services.opening_tier_service import OpeningTierService


@pytest.mark.asyncio
async def test_assign_tiers_no_cache(monkeypatch):
    svc = OpeningTierService()

    # 탐색 시간 단축을 위해 카탈로그/폴백 임계값을 축소
    monkeypatch.setattr(
        opening_tier_service,
        "OPENINGS_CATALOG",
        [{"eco": "A00", "name": "Fake Opening", "moves": ["e2e4", "e7e5", "g1f3"]}],
    )
    monkeypatch.setattr(opening_tier_service, "MIN_CATALOG_RESULTS", 1)

    async def fake_fetch(fen, rating, speed, since, until):
        # always return a single opening entry for the starting position
        return {
            "opening": {"eco": "A00", "name": "Fake Opening"},
            "white": 600,
            "draws": 200,
            "black": 200,
            "moves": [],
        }

    monkeypatch.setattr(svc, "_fetch_position", fake_fetch)

    tiers = await svc.get_opening_tiers(1600, "blitz", "white")
    assert tiers, "service should return at least one entry"
    assert tiers[0]["eco"] == "A00"
    assert tiers[0]["tier"] in ("S", "A", "B", "C", "D")

    # 캐시가 없다면 같은 인자 호출 시 다시 fetch_position을 수행해야 함
    called = {"count": 0}

    async def counting_fetch(fen, rating, speed, since, until):
        called["count"] += 1
        return await fake_fetch(fen, rating, speed, since, until)

    monkeypatch.setattr(svc, "_fetch_position", counting_fetch)
    tiers2 = await svc.get_opening_tiers(1600, "blitz", "white")
    assert tiers2 == tiers
    # 카탈로그 1개 -> 호출당 _fetch_position 1회 기대 (BFS 폴백 없음)
    assert called["count"] == 1, "no-cache means no caching hit prevention"
    # second call again: still no caching, so fetch should run again
    called["count"] = 0
    tiers3 = await svc.get_opening_tiers(1600, "blitz", "white")
    assert tiers3 == tiers
    assert called["count"] == 1


@pytest.mark.asyncio
async def test_fetch_failure_propagates(monkeypatch):
    svc = OpeningTierService()
    async def none_fetch(fen, rating, speed, since, until):
        return None

    monkeypatch.setattr(svc, "_fetch_position", none_fetch)

    with pytest.raises(RuntimeError):
        await svc.get_opening_tiers(1600, "blitz", "white")




def test_bracket_labels():
    svc = OpeningTierService()
    labels = svc.get_bracket_labels("blitz")
    assert any(l.lichess_rating == 1800 for l in labels)
    assert all(l.label_lichess for l in labels)
    assert all(l.label_chesscom for l in labels)
