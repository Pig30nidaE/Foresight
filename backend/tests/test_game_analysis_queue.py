import asyncio
import json
import time

import pytest
from starlette.requests import Request

import app.api.routes.game_analysis as game_analysis


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
