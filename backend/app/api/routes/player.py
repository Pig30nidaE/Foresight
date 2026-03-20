import httpx
from fastapi import APIRouter, HTTPException
from app.models.schemas import PlayerProfile, Platform
from app.shared.services.chessdotcom import ChessDotComService
from app.shared.services.lichess import LichessRateLimitedError, LichessService

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
    except LichessRateLimitedError:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Player not found") from e
        raise HTTPException(
            status_code=502,
            detail=f"Lichess API error: {e.response.status_code}",
        ) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
