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
import threading
import time
from collections import OrderedDict
from functools import partial
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Body
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.core.config import settings
from app.ml.game_analyzer import (
    analyze_game_streaming,
    PlayerAnalysisResult,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Azure Container Apps 등 제한 환경: 기본 1. 로컬 or 고사양이면 STOCKFISH_CONCURRENT=2 이상.
_analysis_semaphore = asyncio.Semaphore(settings.STOCKFISH_CONCURRENT)

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
        )

        if result is None:
            q.put({"type": "error", "message": "PGN 파싱 실패 또는 Stockfish를 찾을 수 없습니다."})
            return

        complete_evt = {
            "type": "complete",
            "game_id": result.game_id,
            "white": _summary_from_result(result.white_analysis),
            "black": _summary_from_result(result.black_analysis),
            "opening": result.opening or {},
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
async def analyze_game_stream(request: GameAnalysisRequest = Body(...)):
    """
    **SSE 스트리밍 게임 분석**

    수 하나가 분석될 때마다 SSE 이벤트로 전송합니다.
    동일 (game_id, stockfish_depth)는 캐시에서 즉시 재생합니다.
    동시 분석 개수는 환경 변수 STOCKFISH_CONCURRENT(기본 1)로 제한됩니다.
    Container Apps 레플리카가 N개면 최대 약 N×STOCKFISH_CONCURRENT 개가 병렬로 돌 수 있습니다.

    이벤트 타입:
    - queued: Semaphore 대기 중 (캐시 히트 시에도 동일 시퀀스 유지)
    - init: PGN 파싱 완료, 총 수/플레이어/오프닝 정보
    - move: 수 1개 분석 완료 (AnalyzedMove)
    - complete: 전체 분석 완료 (요약 통계)
    - error: 오류 발생
    """
    if not request.pgn or not request.pgn.strip():
        async def error_gen():
            yield f"data: {json.dumps({'type': 'error', 'message': 'PGN이 필요합니다.'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(error_gen(), media_type="text/event-stream")

    ck = _cache_key(request.game_id, request.pgn, request.stockfish_depth)
    cached = _cache_get(ck)
    if cached is not None:
        logger.info(f"[Game Analysis SSE Cache HIT] key={ck[0]} depth={ck[1]}")

        async def replay_cached():
            yield f"data: {json.dumps({'type': 'queued'})}\n\n"
            yield f"data: {json.dumps(cached.init_event, ensure_ascii=False)}\n\n"
            for mv in cached.move_events:
                yield f"data: {json.dumps(mv, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps(cached.complete_event, ensure_ascii=False)}\n\n"

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

        async with _analysis_semaphore:
            q: thread_queue.Queue = thread_queue.Queue()
            loop = asyncio.get_event_loop()

            logger.info(
                f"[Game Analysis SSE Start] game_id={request.game_id!r} "
                f"depth={request.stockfish_depth}"
            )

            future = loop.run_in_executor(
                None,
                partial(
                    _run_analysis,
                    q,
                    request.pgn,
                    request.game_id,
                    request.stockfish_depth,
                    ck,
                ),
            )

            while True:
                try:
                    event = await loop.run_in_executor(
                        None, lambda: q.get(timeout=0.5)
                    )
                except thread_queue.Empty:
                    yield ": keepalive\n\n"
                    continue

                if event is None:
                    break

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
