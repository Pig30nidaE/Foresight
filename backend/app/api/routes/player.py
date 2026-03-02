from fastapi import APIRouter, HTTPException, Query
from app.models.schemas import PlayerProfile, Platform
from app.shared.services.chessdotcom import ChessDotComService
from app.shared.services.lichess import LichessService

router = APIRouter()
chessdotcom_svc = ChessDotComService()
lichess_svc = LichessService()


@router.get("/{platform}/{username}", response_model=PlayerProfile)
async def get_player_profile(
    platform: Platform,
    username: str,
):
    """
    Chess.com 또는 Lichess 플레이어 프로필 조회
    - platform: chess.com | lichess
    """
    try:
        if platform == Platform.chessdotcom:
            return await chessdotcom_svc.get_player_profile(username)
        else:
            return await lichess_svc.get_player_profile(username)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Player not found: {e}")
