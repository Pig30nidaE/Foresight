"""
첫 수 선호도, 오프닝 트리, 수 품질 분석 엔드포인트
MVP 섹션 1, 2 대응
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.models.schemas import Platform
from app.services.chessdotcom import ChessDotComService
from app.services.lichess import LichessService
from app.services.analysis import AnalysisService

router = APIRouter()
chessdotcom_svc = ChessDotComService()
lichess_svc = LichessService()
analysis_svc = AnalysisService()


@router.get("/first-moves/{platform}/{username}")
async def get_first_move_stats(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=200),
):
    """
    MVP 섹션 1: 백/흑 첫 수 선호도 및 승률
    - 백으로 가장 많이 둔 첫 수 (e4, d4, c4 등)
    - 흑으로 상대 e4/d4에 대한 응수 (e5, c5, e6 등)
    """
    try:
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, max_games)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class)

        df = analysis_svc.build_dataframe(games)
        if not df.empty:
            df = df[df["time_class"] == time_class]

        return analysis_svc.get_first_move_stats(df, username.lower())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opening-tree/{platform}/{username}")
async def get_opening_tree(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300),
    depth: int = Query(default=3, ge=1, le=5),
):
    """
    MVP 섹션 2-A: 오프닝 트리 탐색기
    - ECO 코드 기반 오프닝 트리 구조
    """
    try:
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, max_games)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class)

        df = analysis_svc.build_dataframe(games)
        if not df.empty:
            df = df[df["time_class"] == time_class]

        return analysis_svc.get_opening_tree(df, depth)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opening-best-worst/{platform}/{username}")
async def get_best_worst_openings(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=200),
    min_games: int = Query(default=5),
):
    """
    MVP 섹션 2-B: 오프닝 퍼포먼스 요약 (베스트 / 워스트)
    """
    try:
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, max_games)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class)

        df = analysis_svc.build_dataframe(games)
        if not df.empty:
            df = df[df["time_class"] == time_class]

        return analysis_svc.get_best_worst_openings(df, min_games)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
