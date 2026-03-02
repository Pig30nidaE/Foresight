"""
엔진 분석 엔드포인트
────────────────────────────────────────────────────
Stockfish 기반 수 품질 분석 (섹션 3-B)

GET /engine/move-quality/{platform}/{username}
  → 최근 N게임을 Stockfish로 분석하여
    Best / Excellent / Good / Inaccuracy / Mistake / Blunder 비율과
    정확도(Chess.com 방식) 반환

주의: Stockfish를 수별로 call하므로 분석 시간은
      games × moves × time_per_move 에 비례한다.
      (기본값: 5게임 × 약 35수 × 0.1초 ≈ 18초)
"""
from __future__ import annotations

import asyncio
import logging
from functools import partial

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import Platform
from app.shared.services.chessdotcom import ChessDotComService
from app.shared.services.lichess import LichessService
from app.ml.move_classifier import analyze_games_sync

logger = logging.getLogger(__name__)

router = APIRouter()
chessdotcom_svc = ChessDotComService()
lichess_svc = LichessService()


@router.get("/move-quality/{platform}/{username}")
async def get_move_quality(
    platform: Platform,
    username: str,
    time_class: str = Query(default="bullet", description="bullet | blitz | rapid"),
    max_games: int = Query(default=5, ge=1, le=15, description="분석할 최대 게임 수 (1~15)"),
    time_per_move: float = Query(
        default=0.1, ge=0.05, le=0.5,
        description="Stockfish 수당 분석 시간(초). 높을수록 정확, 느려짐",
    ),
):
    """
    **섹션 3-B: 수 품질 분석**

    - **Best** ≤5% 승률 손실 ✅
    - **Excellent** 5~10% 👍
    - **Good** 10~20% 🆗
    - **Inaccuracy** 20~40% ⚡
    - **Mistake** 40~70% ❌
    - **Blunder** >70% 💀

    `accuracy`: Chess.com 방식 정확도 (0~100)
    `acpl`: 평균 센티폰 손실 (낮을수록 좋음)
    """
    try:
        # ── 게임 목록 가져오기 ──────────────────────────────
        fetch_limit = max_games * 6   # time_class 필터 후 확보하기 위해 여유분
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, fetch_limit)
        else:
            games = await lichess_svc.get_recent_games(username, fetch_limit, time_class)

        # time_class 필터 + PGN 있는 게임만
        filtered = [g for g in games if g.time_class == time_class and g.pgn]

        if not filtered:
            raise HTTPException(
                status_code=404,
                detail=f"'{time_class}' 타임클래스 게임 중 PGN이 있는 게임을 찾을 수 없습니다.",
            )

        logger.info(
            f"[{username}] {time_class} 게임 {len(filtered)}개 확보 → "
            f"최대 {max_games}게임 분석 시작 (수당 {time_per_move}s)"
        )

        # ── Stockfish 분석 (스레드 풀에서 동기 실행) ────────
        loop = asyncio.get_event_loop()
        fn = partial(
            analyze_games_sync,
            games=filtered,
            username=username,
            max_games=max_games,
            time_per_move=time_per_move,
            platform=platform.value,
            time_class=time_class,
        )
        stats = await loop.run_in_executor(None, fn)

        # ── 응답 직렬화 ─────────────────────────────────────
        return {
            "username": stats.username,
            "platform": stats.platform,
            "time_class": stats.time_class,
            "games_analyzed": stats.games_analyzed,
            "total_moves": stats.total_moves,
            "accuracy": stats.accuracy,
            "acpl": stats.acpl,
            "categories": [
                {
                    "category": c.category,
                    "emoji": c.emoji,
                    "color": c.color,
                    "count": c.count,
                    "percentage": c.percentage,
                }
                for c in stats.categories
            ],
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"[{username}] move-quality 분석 실패: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
