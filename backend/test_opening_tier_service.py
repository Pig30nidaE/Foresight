import asyncio
import pytest

from app.features.opening_tier.services.opening_tier_service import OpeningTierService, _cache


@pytest.mark.asyncio
async def test_assign_tiers_and_cache(monkeypatch):
    svc = OpeningTierService()
    # clear global cache to start fresh
    _cache.clear()

    async def fake_fetch(fen, rating, speed):
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

    # second call should hit the cache and therefore not invoke fake_fetch again
    called = {"count": 0}

    async def counting_fetch(fen, rating, speed):
        called["count"] += 1
        return await fake_fetch(fen, rating, speed)

    monkeypatch.setattr(svc, "_fetch_position", counting_fetch)
    # call again with same arguments
    tiers2 = await svc.get_opening_tiers(1600, "blitz", "white")
    assert called["count"] == 0, "cache should prevent additional fetches"
    assert tiers2 == tiers


@pytest.mark.asyncio
async def test_fetch_failure_propagates(monkeypatch):
    svc = OpeningTierService()
    _cache.clear()

    async def none_fetch(fen, rating, speed):
        return None

    monkeypatch.setattr(svc, "_fetch_position", none_fetch)

    with pytest.raises(RuntimeError):
        await svc.get_opening_tiers(1600, "blitz", "white")




def test_bracket_labels():
    svc = OpeningTierService()
    labels = svc.get_bracket_labels("blitz")
    assert any(l.lichess_rating == 1600 for l in labels)
    assert all(l.label_lichess for l in labels)
    assert all(l.label_chesscom for l in labels)
