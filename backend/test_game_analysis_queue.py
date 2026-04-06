import asyncio
import json
import time

import pytest
from starlette.requests import Request

import app.api.routes.game_analysis as game_analysis
import app.ml.game_analyzer as game_analyzer


class DummyUser:
    def __init__(self, user_id=None, public_id=None, email=None):
        self.id = user_id
        self.public_id = public_id
        self.email = email


def _make_request(ip: str) -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [],
        "client": (ip, 12345),
        "server": ("testserver", 80),
    }
    async def _receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive=_receive)


@pytest.fixture(autouse=True)
def clear_user_slots():
    game_analysis._user_analysis_locks.clear()
    game_analysis._user_analysis_refcounts.clear()
    with game_analysis._cache_lock:
        game_analysis._analysis_stream_cache.clear()
    # FEN 캐시도 각 테스트 전에 초기화
    with game_analyzer._fen_cache_lock:
        game_analyzer._fen_analysis_cache.clear()


def test_resolve_requester_key_prefers_user_identity():
    req = _make_request("1.2.3.4")
    user1 = DummyUser(user_id="same-user")
    user2 = DummyUser(user_id="same-user")
    other = DummyUser(user_id="other-user")

    k1 = game_analysis._resolve_requester_key(req, user1)
    k2 = game_analysis._resolve_requester_key(req, user2)
    k3 = game_analysis._resolve_requester_key(req, other)

    assert k1 == k2
    assert k1 != k3
    assert k1.startswith("user:")


def test_fallback_opening_from_pgn_extracts_headers():
    pgn = """[Event \"Live Chess\"]
[Site \"Chess.com\"]
[White \"foo\"]
[Black \"bar\"]
[ECO \"B12\"]
[Opening \"Caro-Kann Defense\"]
[Variation \"Advance Variation\"]

1. e4 c6 2. d4 d5 1-0
"""

    opening = game_analysis._fallback_opening_from_pgn(pgn)
    assert opening == {
        "eco": "B12",
        "name": "Caro-Kann Defense: Advance Variation",
    }


def test_fallback_opening_from_pgn_handles_missing_headers():
    opening = game_analysis._fallback_opening_from_pgn("1. e4 e5 2. Nf3 Nc6 *")
    assert opening == {}


@pytest.mark.anyio
async def test_cached_replay_backfills_opening_from_pgn():
    pgn = """[Event \"Live Chess\"]
[Site \"Chess.com\"]
[White \"foo\"]
[Black \"bar\"]
[ECO \"B12\"]
[Opening \"Caro-Kann Defense\"]
[Variation \"Advance Variation\"]

1. e4 c6 2. d4 d5 1-0
"""

    req = _make_request("1.2.3.4")
    game_req = game_analysis.GameAnalysisRequest(pgn=pgn, game_id="g1", stockfish_depth=12)
    ck = game_analysis._cache_key(game_req.game_id, game_req.pgn, game_req.stockfish_depth)

    game_analysis._cache_set(
        ck,
        game_analysis._StreamCacheEntry(
            init_event={
                "type": "init",
                "total_moves": 4,
                "white_player": "foo",
                "black_player": "bar",
                "opening": {},
            },
            move_events=[],
            complete_event={
                "type": "complete",
                "game_id": "g1",
                "white": {
                    "username": "foo",
                    "color": "white",
                    "total_moves": 2,
                    "accuracy": 88.8,
                    "avg_cp_loss": 30.0,
                    "tier_counts": {},
                    "tier_percentages": {},
                },
                "black": {
                    "username": "bar",
                    "color": "black",
                    "total_moves": 2,
                    "accuracy": 77.7,
                    "avg_cp_loss": 50.0,
                    "tier_counts": {},
                    "tier_percentages": {},
                },
                "opening": {},
            },
        ),
    )

    resp = await game_analysis.analyze_game_stream(
        req,
        game_req=game_req,
        current_user=DummyUser(user_id="u1"),
    )

    chunks = []
    async for chunk in resp.body_iterator:
        chunks.append(chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk)

    payloads = []
    for chunk in chunks:
        for line in chunk.split("\n"):
            if line.startswith("data: "):
                payloads.append(json.loads(line[6:]))

    init_evt = next(p for p in payloads if p.get("type") == "init")
    complete_evt = next(p for p in payloads if p.get("type") == "complete")

    assert init_evt["opening"]["eco"] == "B12"
    assert init_evt["opening"]["name"] == "Caro-Kann Defense: Advance Variation"
    assert complete_evt["opening"]["eco"] == "B12"
    assert complete_evt["opening"]["name"] == "Caro-Kann Defense: Advance Variation"


@pytest.mark.anyio
async def test_analysis_execution_slot_serializes_same_user(monkeypatch):
    monkeypatch.setattr(game_analysis, "_analysis_sem", None)

    events = []

    async def worker(tag: str, delay: float):
        await asyncio.sleep(delay)
        async with game_analysis._analysis_execution_slot("user:fixed"):
            events.append((tag, "enter", time.monotonic()))
            await asyncio.sleep(0.05)
            events.append((tag, "exit", time.monotonic()))

    await asyncio.gather(
        worker("a", 0.0),
        worker("b", 0.01),
    )

    times = {(tag, phase): ts for tag, phase, ts in events}
    assert times[("b", "enter")] >= times[("a", "exit")] - 0.002


@pytest.mark.anyio
async def test_analysis_execution_slot_allows_parallel_for_different_users(monkeypatch):
    monkeypatch.setattr(game_analysis, "_analysis_sem", None)

    events = []

    async def worker(tag: str, user_key: str):
        async with game_analysis._analysis_execution_slot(user_key):
            events.append((tag, "enter", time.monotonic()))
            await asyncio.sleep(0.06)
            events.append((tag, "exit", time.monotonic()))

    await asyncio.gather(
        worker("a", "user:A"),
        worker("b", "user:B"),
    )

    enter_times = sorted(ts for _, phase, ts in events if phase == "enter")
    exit_times = sorted(ts for _, phase, ts in events if phase == "exit")

    # 두 요청이 모두 시작된 뒤에 첫 종료가 나오면 병렬로 겹쳐 실행된 것.
    assert enter_times[1] < exit_times[0]


# ── 캐시 키 충돌 방지 테스트 ─────────────────────────────────────────────────────
def test_cache_key_includes_pgn_hash_to_prevent_collision():
    """동일 game_id라도 PGN이 다르면 캐시 키가 달라야 합니다."""
    pgn_a = "1. e4 e5 2. Nf3 Nc6 *"
    pgn_b = "1. d4 d5 2. c4 c6 *"

    key_a = game_analysis._cache_key("game-1", pgn_a, 14)
    key_b = game_analysis._cache_key("game-1", pgn_b, 14)

    assert key_a != key_b


def test_cache_key_same_pgn_and_game_id_matches():
    """동일 game_id, 동일 PGN이면 키가 같아야 합니다."""
    pgn = "1. e4 e5 *"
    key1 = game_analysis._cache_key("g42", pgn, 16)
    key2 = game_analysis._cache_key("g42", pgn, 16)

    assert key1 == key2


def test_cache_key_different_depth_no_match():
    """동일 게임이라도 depth가 다르면 키가 달라야 합니다."""
    pgn = "1. e4 e5 *"
    key_d14 = game_analysis._cache_key("g1", pgn, 14)
    key_d20 = game_analysis._cache_key("g1", pgn, 20)

    assert key_d14 != key_d20


def test_cache_key_empty_game_id_uses_pgn_hash():
    """game_id가 비어 있으면 pgn 해시만으로 키를 만들어야 합니다."""
    pgn = "1. e4 e5 *"
    key = game_analysis._cache_key("", pgn, 14)
    # 비어있는 game_id 입력 시 키가 유효해야 함
    assert key[0]
    assert key[1] == 14


# ── FEN 단위 캐시 테스트 ─────────────────────────────────────────────────────────
def test_fen_cache_lookup_returns_none_on_miss():
    """캐시가 비어 있으면 None을 반환해야 합니다."""
    result = game_analyzer._fen_cache_lookup("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3", 10, 3)
    assert result is None


def test_fen_cache_store_and_lookup_roundtrip():
    """저장한 값을 동일 키로 조회하면 같은 객체를 반환해야 합니다."""
    epd = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3"
    fake_result = [{"score": "mock", "pv": []}]

    game_analyzer._fen_cache_store(epd, 10, 3, fake_result)
    retrieved = game_analyzer._fen_cache_lookup(epd, 10, 3)

    assert retrieved is fake_result


def test_fen_cache_depth_isolation():
    """같은 EPD이더라도 depth가 다르면 다른 캐시 항목으로 취급해야 합니다."""
    epd = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3"
    result_d10 = [{"score": "d10"}]
    result_d14 = [{"score": "d14"}]

    game_analyzer._fen_cache_store(epd, 10, 3, result_d10)
    game_analyzer._fen_cache_store(epd, 14, 3, result_d14)

    assert game_analyzer._fen_cache_lookup(epd, 10, 3) is result_d10
    assert game_analyzer._fen_cache_lookup(epd, 14, 3) is result_d14


def test_fen_cache_evicts_lru_when_full():
    """캐시가 최대 크기를 초과하면 가장 오래된 항목이 제거되어야 합니다."""
    # 임시로 maxsize를 3으로 설정
    original_max = game_analyzer._FEN_CACHE_MAXSIZE
    game_analyzer._FEN_CACHE_MAXSIZE = 3

    try:
        for i in range(4):
            epd = f"epd_{i}"
            game_analyzer._fen_cache_store(epd, 10, 1, [{"i": i}])

        # 첫 번째 항목은 제거되어야 함
        assert game_analyzer._fen_cache_lookup("epd_0", 10, 1) is None
        # 나머지 항목은 존재해야 함
        assert game_analyzer._fen_cache_lookup("epd_1", 10, 1) is not None
        assert game_analyzer._fen_cache_lookup("epd_2", 10, 1) is not None
        assert game_analyzer._fen_cache_lookup("epd_3", 10, 1) is not None
    finally:
        game_analyzer._FEN_CACHE_MAXSIZE = original_max


def test_fen_cache_ttl_expiry():
    """TTL이 만료된 캐시 항목은 None을 반환해야 합니다."""
    epd = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3"
    fake_result = [{"score": "old"}]

    # TTL보다 1초 더 오래된 타임스탬프로 저장 (현재 시각 기준으로 과거)
    expired_ts = time.monotonic() - game_analyzer._FEN_CACHE_TTL_SEC - 1.0
    with game_analyzer._fen_cache_lock:
        game_analyzer._fen_analysis_cache[(epd, 10, 3)] = (fake_result, expired_ts)

    result = game_analyzer._fen_cache_lookup(epd, 10, 3)
    assert result is None


def test_get_fen_cache_stats_returns_correct_size():
    """캐시 통계가 실제 저장된 항목 수를 반영해야 합니다."""
    game_analyzer._fen_cache_store("epd_a", 10, 3, [{}])
    game_analyzer._fen_cache_store("epd_b", 14, 3, [{}])

    stats = game_analyzer.get_fen_cache_stats()
    assert stats["size"] == 2
    assert stats["maxsize"] == game_analyzer._FEN_CACHE_MAXSIZE
