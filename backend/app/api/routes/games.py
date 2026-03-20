import httpx
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from app.models.schemas import GameSummary, Platform
from app.shared.services.chessdotcom import ChessDotComService
from app.shared.services.lichess import LichessRateLimitedError, LichessService

router = APIRouter()
chessdotcom_svc = ChessDotComService()
lichess_svc = LichessService()


@router.get("/{platform}/{username}", response_model=List[GameSummary])
async def get_recent_games(
    platform: Platform,
    username: str,
    max_games: int = Query(default=50, ge=1, le=500),
    time_class: Optional[str] = Query(default=None, description="blitz, bullet, rapid, classical"),
    since_ms: Optional[int] = Query(default=None, description="Unix 밀리초 (하한)"),
    until_ms: Optional[int] = Query(default=None, description="Unix 밀리초 (상한)"),
):
    """
    플레이어의 최근 게임 N개 조회 (레이팅 및 CP eval 포함)
    - platform: chess.com | lichess
    - max_games: 최대 게임 수 (기본 50, 최대 500)
    - time_class: 특정 타입만 필터 (선택)
    - since_ms / until_ms: 기간 필터 (Unix 밀리초)
    """
    try:
        since_ts_s = since_ms // 1000 if since_ms else None
        until_ts_s = until_ms // 1000 if until_ms else None

        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(
                username, max_games,
                since_ts=since_ts_s, until_ts=until_ts_s,
                time_class=time_class,
            )
        else:
            games = await lichess_svc.get_recent_games(
                username, max_games,
                perf_type=time_class,
                since_ms=since_ms, until_ms=until_ms,
                evals=False,
            )

        return games
    except LichessRateLimitedError:
        raise
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Upstream API error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
