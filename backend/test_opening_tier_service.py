from datetime import date, timedelta
import pytest

import app.features.opening_tier.services.opening_tier_service as opening_tier_service
from app.features.opening_tier.services.opening_tier_service import (
    OpeningTierService,
    _OpeningNode,
    _LICHESS_RATINGS_PARAMS,
    _compute_date_range,
)


@pytest.mark.asyncio
async def test_assign_tiers_no_cache(monkeypatch):
    svc = OpeningTierService()
    monkeypatch.setattr(svc, "_persist_cache_snapshot", lambda: None)

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

    tiers, period, collected_at = await svc.get_opening_tiers(1400, "blitz", "white", allow_fetch_if_missing=True)
    assert tiers, "service should return at least one entry"
    assert tiers[0]["eco"] == "A00"
    assert tiers[0]["tier"] in ("S", "A", "B", "C", "D")
    assert collected_at

    # 현재 로직은 요청 결과를 메모리 캐시에 적재하므로
    # 동일 인자 재호출 시 추가 fetch 없이 캐시를 반환해야 함
    called = {"count": 0}

    async def counting_fetch(fen, rating, speed, since, until):
        called["count"] += 1
        return await fake_fetch(fen, rating, speed, since, until)

    monkeypatch.setattr(svc, "_fetch_position", counting_fetch)
    tiers2, _, _ = await svc.get_opening_tiers(1400, "blitz", "white", allow_fetch_if_missing=True)
    assert tiers2 == tiers
    assert called["count"] == 0, "cache hit should prevent additional fetching"
    # second call again: still cached
    called["count"] = 0
    tiers3, _, _ = await svc.get_opening_tiers(1400, "blitz", "white", allow_fetch_if_missing=True)
    assert tiers3 == tiers
    assert called["count"] == 0


@pytest.mark.asyncio
async def test_fetch_failure_propagates(monkeypatch):
    svc = OpeningTierService()
    async def none_fetch(fen, rating, speed, since, until):
        return None

    monkeypatch.setattr(svc, "_fetch_position", none_fetch)

    with pytest.raises(RuntimeError):
        await svc.get_opening_tiers(1400, "blitz", "white", allow_fetch_if_missing=True)




def test_bracket_labels():
    svc = OpeningTierService()
    labels = svc.get_bracket_labels("blitz")
    assert [l.lichess_rating for l in labels] == [1000, 1400, 1800, 2200, 2500]
    assert [l.label_chesscom for l in labels] == ["1000,1200", "1400,1600", "1800,2000", "2200", "2500"]
    assert all(l.label_lichess for l in labels)
    assert all(l.label_chesscom for l in labels)


def test_minor_variation_flag_without_level2_aggregation():
    svc = OpeningTierService()
    openings = {
        # Level2로 묶지 않고 ECO 단위로 남겨야 함
        "B90": _OpeningNode(
            eco="B90",
            name="Sicilian Defense: Najdorf, English Attack",
            opening_side="black",
            white_wins=150,
            draws=50,
            black_wins=200,
            depth=8,
            moves=["e2e4", "c7c5", "g1f3", "d7d6"],
        ),
        "B97": _OpeningNode(
            eco="B97",
            name="Sicilian Defense: Najdorf, Poisoned Pawn Variation",
            opening_side="black",
            white_wins=120,
            draws=40,
            black_wins=180,
            depth=10,
            moves=["e2e4", "c7c5", "g1f3", "d7d6", "d2d4"],
        ),
        # 픽률 1% 미만으로 탈락해야 하는 항목
        "A40": _OpeningNode(
            eco="A40",
            name="Queen's Pawn Game",
            opening_side="black",
            white_wins=0,
            draws=0,
            black_wins=1,
            depth=4,
            moves=["d2d4", "e7e6", "c2c4", "d7d5"],
        ),
    }

    result = svc._assign_tiers(openings, "black")
    assert result, "at least one aggregated result should remain"
    assert len(result) == 2, "minor variation should remain searchable with is_minor flag"
    visible = [r for r in result if not r.get("is_minor", False)]
    hidden = [r for r in result if r.get("is_minor", False)]
    assert len(visible) == 1
    assert len(hidden) == 1
    assert visible[0]["name"] == "Sicilian Defense: Najdorf, Poisoned Pawn Variation"
    # prefix 관계(B90 -> B97) parent 제거가 먼저 적용되어
    # 더 구체적인 라인(B97) 표본만 남습니다.
    assert visible[0]["total_games"] == 340


def test_redesigned_rating_mapping_and_window():
    assert _LICHESS_RATINGS_PARAMS[1000] == [1000, 1200]
    assert _LICHESS_RATINGS_PARAMS[1400] == [1400, 1600]
    assert _LICHESS_RATINGS_PARAMS[1800] == [1800, 2000]
    assert _LICHESS_RATINGS_PARAMS[2200] == [2200]
    assert _LICHESS_RATINGS_PARAMS[2500] == [2500]
    since, until = _compute_date_range()
    assert len(since) == 10 and len(until) == 10


def test_compute_date_range_is_previous_calendar_month_window():
    since, until = _compute_date_range()
    assert len(since) == 10 and len(until) == 10
    since_day = date.fromisoformat(since)
    until_day = date.fromisoformat(until)
    # 전달 1일~말일
    assert since_day.day == 1
    assert since_day <= until_day
    assert since_day.month == until_day.month
    assert since_day.year == until_day.year
    assert (until_day + timedelta(days=1)).day == 1


@pytest.mark.asyncio
async def test_catalog_uses_eco_range_for_opening_side(monkeypatch):
    svc = OpeningTierService()
    monkeypatch.setattr(
        opening_tier_service,
        "OPENINGS_CATALOG",
        [{"eco": "A46", "name": "Indian Game", "moves": ["d2d4", "g8f6", "g1f3"]}],
    )

    async def fake_fetch(fen, rating, speed, since, until):
        return {
            "opening": {"eco": "A46", "name": "Indian Defense: Knights Variation"},
            "white": 500,
            "draws": 200,
            "black": 500,
            "moves": [],
        }

    monkeypatch.setattr(svc, "_fetch_position", fake_fetch)
    result = await svc._catalog_explore(1400, "blitz", "2026-02-01", "2026-02-28", min_games=100)
    assert "A46" in result
    # 이름에 Defense가 있어도 A46은 white 대역 규칙을 우선 적용
    assert result["A46"].opening_side == "white"


@pytest.mark.asyncio
async def test_fetch_position_uses_redesigned_rating_bucket_mapping(monkeypatch):
    svc = OpeningTierService()
    captured: list[str] = []

    async def fake_fetch_single(fen, ratings_str, speed, since, until):
        captured.append(ratings_str)
        return {}

    monkeypatch.setattr(svc, "_fetch_single", fake_fetch_single)
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    for rating in [1000, 1400, 1800, 2200, 2500]:
        await svc._fetch_position(fen, rating, "blitz", "2026-02-01", "2026-02-28")

    assert captured == ["1000,1200", "1400,1600", "1800,2000", "2200", "2500"]


@pytest.mark.asyncio
async def test_fetch_single_falls_back_to_previous_month_when_current_month_empty(monkeypatch):
    svc = OpeningTierService()

    class DummyResp:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    class DummyClient:
        calls = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, _url, params=None, headers=None):
            DummyClient.calls.append(list(params or []))
            q = dict(params or [])
            # 첫 달(요청 월)은 0건, 이전 달은 데이터 존재
            if q.get("since") == "2026-03":
                return DummyResp({"white": 0, "draws": 0, "black": 0, "moves": []})
            if q.get("since") == "2026-02":
                return DummyResp({"white": 10, "draws": 5, "black": 5, "moves": []})
            return DummyResp({"white": 0, "draws": 0, "black": 0, "moves": []})

    monkeypatch.setattr(opening_tier_service.httpx, "AsyncClient", lambda timeout=10.0: DummyClient())

    data = await svc._fetch_single(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "1400,1600",
        "blitz",
        "2026-03-01",
        "2026-03-31",
    )

    assert data is not None
    assert data.get("white") == 10
    months = [dict(c).get("since") for c in DummyClient.calls if dict(c).get("since")]
    assert "2026-03" in months
    assert "2026-02" in months


@pytest.mark.asyncio
async def test_fetch_single_uses_all_time_after_month_backoff_exhausted(monkeypatch):
    svc = OpeningTierService()

    class DummyResp:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    class DummyClient:
        calls = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, _url, params=None, headers=None):
            DummyClient.calls.append(list(params or []))
            q = dict(params or [])
            # 월 단위 조회는 항상 0건, all-time(날짜 파라미터 없음)에서만 데이터 제공
            if "since" in q:
                return DummyResp({"white": 0, "draws": 0, "black": 0, "moves": []})
            return DummyResp({"white": 3, "draws": 1, "black": 2, "moves": []})

    monkeypatch.setattr(opening_tier_service.httpx, "AsyncClient", lambda timeout=10.0: DummyClient())

    data = await svc._fetch_single(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "1400,1600",
        "blitz",
        "2026-03-01",
        "2026-03-31",
    )

    assert data is not None
    assert data.get("white") == 3
    assert any("since" in dict(c) for c in DummyClient.calls)
    assert any("since" not in dict(c) for c in DummyClient.calls)
