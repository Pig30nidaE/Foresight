"""
오프닝 티어표 라우터 — Dev2 담당 영역
=========================================
GET /api/v1/opening-tier/global
  → 전체 플레이어 기준 오프닝별 티어 랭킹

GET /api/v1/opening-tier/player/{platform}/{username}
  → 특정 플레이어 오프닝 효율 티어 평가

담당: [Dev2]
"""
from fastapi import APIRouter

router = APIRouter()


# TODO: Dev2 — 오프닝 티어 산정 로직 구현
# 참고: app.shared.services.opening_db (ECO DB)
#       app.features.opening_tier.services.opening_tier_service

@router.get("/placeholder")
async def opening_tier_placeholder():
    """Dev2 티어표 기능 구현 예정"""
    return {"message": "Opening Tier — WIP (Dev2)"}
