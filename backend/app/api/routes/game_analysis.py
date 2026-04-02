"""
개별 게임 분석 엔드포인트 — SSE 스트리밍 방식
────────────────────────────────────────────────────
Stockfish 기반 T1~T6 수 품질 분석 (흑/백 모두 분석)
수 하나가 분석될 때마다 SSE 이벤트로 실시간 전송합니다.

동일 (game_id, depth) 재요청 시 LRU+TTL 캐시에서 즉시 재생 (Stockfish 미실행).

POST /api/v1/game-analysis/game/stream
  → PGN을 받아 수별 분석 결과를 SSE로 스트리밍
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import queue as thread_queue
import re
import threading
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from functools import partial
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.api.deps import get_current_user
from app.core.config import settings
from app.ml.game_analyzer import (
    analyze_game_streaming,
    PlayerAnalysisResult,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_RE_PGN_ECO = re.compile(r'\[ECO\s+"([^"]+)"\]')
_RE_PGN_OPENING = re.compile(r'\[Opening\s+"([^"]+)"\]')
_RE_PGN_VARIATION = re.compile(r'\[Variation\s+"([^"]+)"\]')


def _fallback_opening_from_pgn(pgn: str) -> Dict[str, Any]:
    """PGN 헤더만으로 최소 오프닝 정보를 복구합니다.

    opening DB가 비어 있거나 과거 캐시에 opening={} 이 저장된 경우에도
    UI에서 오프닝명이 비지 않도록 ECO/Opening/Variation 헤더를 사용합니다.
    """
    if not pgn:
        return {}
    eco_m = _RE_PGN_ECO.search(pgn)
    opening_m = _RE_PGN_OPENING.search(pgn)
    variation_m = _RE_PGN_VARIATION.search(pgn)

    eco = eco_m.group(1).strip() if eco_m else None
    name = opening_m.group(1).strip() if opening_m else None
    if name and variation_m:
        var = variation_m.group(1).strip()
        if var:
            name = f"{name}: {var}"

    payload: Dict[str, Any] = {}
    if eco:
        payload["eco"] = eco
    if name:
        payload["name"] = name
    return payload

# STOCKFISH_CONCURRENT > 0 이면 레플리카 내에서만 상한. 0이면 유저 간 앱 레벨 대기열 없음.
_analysis_sem: Optional[asyncio.Semaphore] = (
    asyncio.Semaphore(settings.STOCKFISH_CONCURRENT)
    if settings.STOCKFISH_CONCURRENT > 0
    else None
)

_user_slot_map_lock = asyncio.Lock()
_user_analysis_locks: Dict[str, asyncio.Lock] = {}
_user_analysis_refcounts: Dict[str, int] = {}


@asynccontextmanager
async def _analysis_concurrency_slot() -> AsyncIterator[None]:
    if _analysis_sem is None:
        yield
    else:
        async with _analysis_sem:
            yield


@asynccontextmanager
async def _user_serial_slot(user_key: str) -> AsyncIterator[None]:
    """동일 사용자 요청은 순차 실행되도록 직렬 슬롯을 제공합니다."""
    async with _user_slot_map_lock:
        lock = _user_analysis_locks.get(user_key)
        if lock is None:
            lock = asyncio.Lock()
            _user_analysis_locks[user_key] = lock
        _user_analysis_refcounts[user_key] = _user_analysis_refcounts.get(user_key, 0) + 1

    try:
        async with lock:
            yield
    finally:
        async with _user_slot_map_lock:
            refs = _user_analysis_refcounts.get(user_key, 0) - 1
            if refs <= 0:
                _user_analysis_refcounts.pop(user_key, None)
                cur = _user_analysis_locks.get(user_key)
                if cur is not None and not cur.locked():
                    _user_analysis_locks.pop(user_key, None)
            else:
                _user_analysis_refcounts[user_key] = refs


@asynccontextmanager
async def _analysis_execution_slot(user_key: str) -> AsyncIterator[None]:
    """동일 사용자 직렬화 + 전역 동시성 제어를 결합한 실행 슬롯."""
    async with _user_serial_slot(user_key):
        async with _analysis_concurrency_slot():
            yield


def _resolve_requester_key(http_request: Request, current_user: Any) -> str:
    user_id = getattr(current_user, "id", None)
    if user_id is not None:
        return f"user:{hashlib.sha1(str(user_id).encode()).hexdigest()[:16]}"

    public_id = getattr(current_user, "public_id", None)
    if public_id:
        return f"user:{hashlib.sha1(str(public_id).encode()).hexdigest()[:16]}"

    email = (getattr(current_user, "email", "") or "").strip().lower()
    if email:
        return f"user:{hashlib.sha1(email.encode()).hexdigest()[:16]}"

    # 마지막 fallback (비인증/예외 상황)
    if http_request.client and http_request.client.host:
        ip = http_request.client.host
    else:
        ip = "unknown"
    return f"anon:{hashlib.sha1(ip.encode()).hexdigest()[:16]}"

# ── SSE 완료 결과 캐시 (동일 게임·동일 depth 재요청 시 재사용) ─────────────
_CACHE_MAXSIZE = 50
_CACHE_TTL_SEC = 3600

_cache_lock = threading.Lock()
_analysis_stream_cache: "OrderedDict[Tuple[str, Optional[int]], _StreamCacheEntry]" = OrderedDict()


class _StreamCacheEntry:
    __slots__ = ("init_event", "move_events", "complete_event", "ts")

    def __init__(self, init_event: dict, move_events: List[dict], complete_event: dict) -> None:
        self.init_event = init_event
        self.move_events = move_events
        self.complete_event = complete_event
        self.ts = time.monotonic()

    def fresh(self) -> bool:
        return time.monotonic() - self.ts < _CACHE_TTL_SEC


def _cache_key(game_id: str, pgn: str, depth: Optional[int]) -> Tuple[str, Optional[int]]:
    uid = game_id.strip() or hashlib.sha1(pgn.encode()).hexdigest()[:16]
    return (uid, depth)


def _cache_get(key: Tuple[str, Optional[int]]) -> Optional[_StreamCacheEntry]:
    with _cache_lock:
        ent = _analysis_stream_cache.get(key)
        if ent is None:
            return None
        if not ent.fresh():
            del _analysis_stream_cache[key]
            return None
        _analysis_stream_cache.move_to_end(key)
        return ent


def _cache_set(key: Tuple[str, Optional[int]], entry: _StreamCacheEntry) -> None:
    with _cache_lock:
        _analysis_stream_cache[key] = entry
        _analysis_stream_cache.move_to_end(key)
        while len(_analysis_stream_cache) > _CACHE_MAXSIZE:
            _analysis_stream_cache.popitem(last=False)


class GameAnalysisRequest(BaseModel):
    """게임 분석 요청"""
    pgn: str
    game_id: str = ""
    stockfish_depth: Optional[int] = None


def _summary_from_result(result: PlayerAnalysisResult) -> dict:
    """PlayerAnalysisResult → 요약 통계 dict"""
    return {
        "username": result.username,
        "color": result.color,
        "total_moves": result.total_moves,
        "accuracy": result.accuracy,
        "avg_cp_loss": result.avg_cp_loss,
        "tier_counts": result.tier_counts,
        "tier_percentages": result.tier_percentages,
    }


def _run_analysis(
    q: thread_queue.Queue,
    pgn: str,
    game_id: str,
    depth: Optional[int],
    cache_key: Tuple[str, Optional[int]],
    cancel_event: threading.Event,
) -> None:
    """동기 스레드에서 실행. 분석 이벤트를 큐에 넣고, 성공 시 캐시에 저장합니다."""
    init_data: Dict[str, Any] = {}
    move_events: List[dict] = []

    def on_init(data: dict) -> None:
        init_data.update(data)
        q.put({"type": "init", **data})

    def on_move(data: dict) -> None:
        move_events.append({"type": "move", "data": data})
        q.put({"type": "move", "data": data})

    try:
        result = analyze_game_streaming(
            pgn_str=pgn,
            game_id=game_id,
            stockfish_depth=depth,
            on_init=on_init,
            on_move=on_move,
            cancel_event=cancel_event,
        )

        if result is None:
            if cancel_event.is_set():
                logger.info("[Game Analysis] cancelled (client disconnected); no error event / no cache")
                return
            q.put({"type": "error", "message": "PGN 파싱 실패 또는 Stockfish를 찾을 수 없습니다."})
            return

        opening_payload: Dict[str, Any] = result.opening or {}
        if not opening_payload:
            opening_payload = _fallback_opening_from_pgn(pgn)

        complete_evt = {
            "type": "complete",
            "game_id": result.game_id,
            "white": _summary_from_result(result.white_analysis),
            "black": _summary_from_result(result.black_analysis),
            "opening": opening_payload,
        }
        q.put(complete_evt)

        init_evt = {"type": "init", **init_data}
        _cache_set(
            cache_key,
            _StreamCacheEntry(
                init_evt,
                list(move_events),
                dict(complete_evt),
            ),
        )
    except Exception as exc:
        logger.exception(f"[Game Analysis Error] {exc}")
        q.put({"type": "error", "message": str(exc)})
    finally:
        q.put(None)


@router.post("/game/stream")
async def analyze_game_stream(
    http_request: Request,
    game_req: GameAnalysisRequest = Body(...),
    current_user=Depends(get_current_user),
):
    """
    **SSE 스트리밍 게임 분석**

    수 하나가 분석될 때마다 SSE 이벤트로 전송합니다.
    동일 (game_id, stockfish_depth)는 캐시에서 즉시 재생합니다.
    동시 분석: STOCKFISH_CONCURRENT(기본 0) — 0이면 같은 레플리카에서도 유저끼리
    세마포어 대기 없이 각 요청이 즉시 분석을 시작합니다. 1 이상이면 레플리카당 그 개수만 병렬.

    이벤트 타입:
    - queued: 스트림 시작 신호 (캐시 히트 시에도 동일). 세마포어 사용 시 슬롯 대기 포함.
    - init: PGN 파싱 완료, 총 수/플레이어/오프닝 정보
    - move: 수 1개 분석 완료 (AnalyzedMove)
    - complete: 전체 분석 완료 (요약 통계)
    - error: 오류 발생
    """
    if not game_req.pgn or not game_req.pgn.strip():
        async def error_gen():
            yield f"data: {json.dumps({'type': 'error', 'message': 'PGN이 필요합니다.'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(error_gen(), media_type="text/event-stream")

    requester_key = _resolve_requester_key(http_request, current_user)

    ck = _cache_key(game_req.game_id, game_req.pgn, game_req.stockfish_depth)
    cached = _cache_get(ck)
    if cached is not None:
        logger.info(f"[Game Analysis SSE Cache HIT] key={ck[0]} depth={ck[1]}")

        cached_init_event = dict(cached.init_event)
        cached_complete_event = dict(cached.complete_event)
        opening_payload = cached_complete_event.get("opening")
        if not isinstance(opening_payload, dict) or not opening_payload:
            fallback_opening = _fallback_opening_from_pgn(game_req.pgn)
            if fallback_opening:
                cached_complete_event["opening"] = fallback_opening
                cached.complete_event = dict(cached_complete_event)
                cached_init_event["opening"] = fallback_opening
                cached.init_event = dict(cached_init_event)

        async def replay_cached():
            yield f"data: {json.dumps({'type': 'queued'})}\n\n"
            if await http_request.is_disconnected():
                return
            yield f"data: {json.dumps(cached_init_event, ensure_ascii=False)}\n\n"
            for mv in cached.move_events:
                if await http_request.is_disconnected():
                    return
                yield f"data: {json.dumps(mv, ensure_ascii=False)}\n\n"
            if await http_request.is_disconnected():
                return
            yield f"data: {json.dumps(cached_complete_event, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            replay_cached(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    async def event_generator():
        yield f"data: {json.dumps({'type': 'queued'})}\n\n"

        async with _analysis_execution_slot(requester_key):
            cancel_event = threading.Event()
            q: thread_queue.Queue = thread_queue.Queue()
            loop = asyncio.get_event_loop()

            logger.info(
                f"[Game Analysis SSE Start] requester={requester_key} "
                f"game_id={game_req.game_id!r} depth={game_req.stockfish_depth}"
            )

            future = loop.run_in_executor(
                None,
                partial(
                    _run_analysis,
                    q,
                    game_req.pgn,
                    game_req.game_id,
                    game_req.stockfish_depth,
                    ck,
                    cancel_event,
                ),
            )

            client_gone = False
            while True:
                if not client_gone and await http_request.is_disconnected():
                    cancel_event.set()
                    client_gone = True
                    logger.info("[Game Analysis] client disconnected; analysis will stop after current move")

                try:
                    event = await loop.run_in_executor(
                        None, lambda: q.get(timeout=0.5)
                    )
                except thread_queue.Empty:
                    if not client_gone:
                        yield ": keepalive\n\n"
                    continue

                if event is None:
                    break

                if not client_gone:
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            await future

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
