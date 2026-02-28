from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from app.models.schemas import GameSummary, Platform
from app.services.chessdotcom import ChessDotComService
from app.services.lichess import LichessService

router = APIRouter()
chessdotcom_svc = ChessDotComService()
lichess_svc = LichessService()


@router.get("/{platform}/{username}", response_model=List[GameSummary])
async def get_recent_games(
    platform: Platform,
    username: str,
    max_games: int = Query(default=50, ge=1, le=500),
    time_class: Optional[str] = Query(default=None, description="blitz, bullet, rapid, classical"),
):
    """
    플레이어의 최근 게임 N개 조회
    - platform: chess.com | lichess
    - max_games: 최대 게임 수 (기본 50, 최대 500)
    - time_class: 특정 타입만 필터 (선택)
    """
    try:
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, max_games)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class)

        # Chess.com은 서비스 레이어에서 time_class 필터 안 됨 → 여기서 처리
        if time_class and platform == Platform.chessdotcom:
            games = [g for g in games if g.time_class == time_class]

        return games
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
