"""
오프닝 상세 정보 서비스
=======================
사전 작성된 한국어 핵심 포인트 카탈로그를 조회하고
YouTube 한국어 해설 영상 검색 링크를 제공합니다.
"""
from __future__ import annotations

import urllib.parse
from typing import Any, Dict, List

from app.features.opening_tier.opening_tips_catalog import OPENING_TIPS


def _youtube_search_url(name: str, eco: str) -> str:
    query = f"{name} {eco} 체스 오프닝 강의 한국어"
    return "https://www.youtube.com/results?search_query=" + urllib.parse.quote(query)


async def get_opening_detail(eco: str, name: str, color: str = "white") -> Dict[str, Any]:
    """오프닝 핵심 포인트 + YouTube 검색 링크 반환."""
    entry = OPENING_TIPS.get(eco, {})
    tips: List[str] = entry.get(color, [])
    return {
        "eco": eco,
        "name": name,
        "color": color,
        "tips": tips,
        "youtube_search_url": _youtube_search_url(name, eco),
    }
