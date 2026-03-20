"""
첫 수 선호도, 오프닝 트리, 수 품질 분석 엔드포인트
MVP 섹션 1, 2, 3 대응
"""
import asyncio
import functools
import logging
import time
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.models.schemas import Platform
from app.shared.services.chessdotcom import ChessDotComService
from app.shared.services.lichess import LichessRateLimitedError, LichessService
from app.features.dashboard.services.analysis import AnalysisService
from app.shared.services.pgn_parser import parse_games_bulk

logger = logging.getLogger(__name__)

router = APIRouter()
chessdotcom_svc = ChessDotComService()
lichess_svc = LichessService()
analysis_svc = AnalysisService()


@router.get("/first-moves/{platform}/{username}")
async def get_first_move_stats(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=5000),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    """
    MVP 섹션 1: 백/흑 첫 수 선호도 및 승률
    since_ms / until_ms (Unix ms) 로 기간 필터 가능.
    """
    try:
        logger.info(f"[First Moves] {platform}:{username} (timeClass={time_class})")
        if platform == Platform.chessdotcom:
            since_ts = since_ms // 1000 if since_ms else None
            until_ts = until_ms // 1000 if until_ms else None
            games = await chessdotcom_svc.get_recent_games(username, max_games, since_ts=since_ts, until_ts=until_ts, time_class=time_class)
        else:
            games = await lichess_svc.get_recent_games(
                username, max_games, time_class, since_ms=since_ms, until_ms=until_ms, evals=False
            )

        logger.info(f"  → API returned {len(games)} games")
        
        # Note: games는 이미 get_recent_games() 에서 time_class로 필터됨
        # → GameSummary의 time_class 필드가 일관되게 설정됨
        # #region agent log
        import time as _t, json as _j
        try:
            _pgn_count = sum(1 for g in games if getattr(g, "pgn", None))
            with open("/Users/pig30nidae/Pig30nidaE/Project/Foresight/.cursor/debug-ce40e3.log","a") as _f:
                _f.write(_j.dumps({"sessionId":"ce40e3","timestamp":int(_t.time()*1000),"location":"stats.py:get_first_move_stats","message":"games PGN availability","hypothesisId":"A","data":{"total_games":len(games),"games_with_pgn":_pgn_count,"platform":str(platform),"username":username}})+"\n")
        except Exception:
            pass
        # #endregion
        rows = analysis_svc.build_rows(games)
        logger.info(f"  → Rows: {len(rows)}")

        if rows:
            from collections import Counter
            tc_dist = Counter(r["time_class"] for r in rows)
            logger.info(f"  → time_class distribution: {dict(tc_dist)}")

        result = analysis_svc.get_first_move_stats(rows, username.lower())
        logger.info(f"  → Result: white={len(result['white'])}, black={len(result['black'])}, total_games={result.get('total_games', 'N/A')}")
        return result
    except LichessRateLimitedError:
        raise
    except Exception as e:
        logger.error(f"  → ERROR: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opening-tree/{platform}/{username}")
async def get_opening_tree(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=5000),
    depth: int = Query(default=3, ge=1, le=5),
    side: Optional[str] = Query(default=None, description="white | black — 특정 색 게임만 필터"),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    """
    MVP 섹션 2-A: 오프닝 트리 탐색기
    - side='white' 또는 'black' 으로 색 필터 가능
    """
    try:
        if platform == Platform.chessdotcom:
            since_ts = since_ms // 1000 if since_ms else None
            until_ts = until_ms // 1000 if until_ms else None
            games = await chessdotcom_svc.get_recent_games(username, max_games, since_ts=since_ts, until_ts=until_ts, time_class=time_class)
        else:
            games = await lichess_svc.get_recent_games(
                username, max_games, time_class, since_ms=since_ms, until_ms=until_ms, evals=False
            )

        # Note: games는 이미 get_recent_games() 에서 time_class로 필터됨
        rows = analysis_svc.build_rows(games)
        if rows and side:
            uname_lower = username.lower()
            if side == "white":
                rows = [r for r in rows if r.get("white") and r["white"].lower() == uname_lower]
            elif side == "black":
                rows = [r for r in rows if r.get("black") and r["black"].lower() == uname_lower]

        return analysis_svc.get_opening_tree(rows, depth)
    except LichessRateLimitedError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opening-best-worst/{platform}/{username}")
async def get_best_worst_openings(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=5000),
    min_games: int = Query(default=10),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    """
    MVP 섹션 2-B: 오프닝 퍼포먼스 요약 (베스트 / 워스트)
    """
    try:
        if platform == Platform.chessdotcom:
            since_ts = since_ms // 1000 if since_ms else None
            until_ts = until_ms // 1000 if until_ms else None
            games = await chessdotcom_svc.get_recent_games(username, max_games, since_ts=since_ts, until_ts=until_ts, time_class=time_class)
        else:
            games = await lichess_svc.get_recent_games(
                username, max_games, time_class, since_ms=since_ms, until_ms=until_ms, evals=False
            )

        # Note: games는 이미 get_recent_games() 에서 time_class로 필터됨
        rows = analysis_svc.build_rows(games)
        return analysis_svc.get_best_worst_openings(rows, min_games)
    except LichessRateLimitedError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/time-pressure/{platform}/{username}")
async def get_time_pressure(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=5000),
    pressure_threshold: float = Query(default=30.0, description="시간 압박 기준 잔여 시간(초)"),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    """
    MVP 섹션 3-A: 시간 압박 분석
    - PGN 클록 어노테이션 `{[%clk H:MM:SS]}` 파싱
    - 수 페이즈(opening/middlegame/endgame)별 시간 압박 비율
    - 수 번호별 평균 소비 시간 + 압박 퍼센트
    - games_with_clock 이 0이면 해당 플랫폼/타임클래스에 클록 데이터가 없음.
    """
    try:
        if platform == Platform.chessdotcom:
            since_ts = since_ms // 1000 if since_ms else None
            until_ts = until_ms // 1000 if until_ms else None
            games = await chessdotcom_svc.get_recent_games(username, max_games, since_ts=since_ts, until_ts=until_ts, time_class=time_class)
        else:
            games = await lichess_svc.get_recent_games(
                username,
                max_games,
                time_class,
                since_ms=since_ms,
                until_ms=until_ms,
                clocks=True,
                evals=False,
            )

        # #region agent log
        import time as _t, json as _j
        try:
            _pgn_count2 = sum(1 for g in games if getattr(g, "pgn", None))
            with open("/Users/pig30nidae/Pig30nidaE/Project/Foresight/.cursor/debug-ce40e3.log","a") as _f:
                _f.write(_j.dumps({"sessionId":"ce40e3","timestamp":int(_t.time()*1000),"location":"stats.py:get_time_pressure","message":"time-pressure games PGN availability","hypothesisId":"A-C","data":{"total_games":len(games),"games_with_pgn":_pgn_count2,"platform":str(platform),"username":username}})+"\n")
        except Exception:
            pass
        # #endregion
        # Note: games는 이미 get_recent_games() 에서 time_class로 필터됨
        parsed = parse_games_bulk(games, pressure_threshold=pressure_threshold)
        return analysis_svc.get_time_pressure_stats(parsed, username)
    except LichessRateLimitedError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
