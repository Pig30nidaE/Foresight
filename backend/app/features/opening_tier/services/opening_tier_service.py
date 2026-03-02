"""
오프닝 티어 산정 서비스 — Dev2 담당 영역
=========================================
오프닝별 전체 승률 집계 + 티어(S/A/B/C/D) 산정 로직

dependencies:
  - app.shared.services.opening_db
  - app.shared.services.chessdotcom | lichess
  - app.models.schemas

담당: [Dev2]
"""
from __future__ import annotations
from typing import List, Dict, Any


class OpeningTierService:
    """오프닝 티어표 서비스 — TODO: Dev2 구현 예정"""

    def get_opening_tier_list(self) -> List[Dict[str, Any]]:
        """오프닝별 티어 랭킹 반환 — TODO"""
        raise NotImplementedError("Dev2 구현 예정")

    def get_player_opening_tier(
        self, username: str, platform: str
    ) -> Dict[str, Any]:
        """플레이어 오프닝별 티어 평가 — TODO"""
        raise NotImplementedError("Dev2 구현 예정")
