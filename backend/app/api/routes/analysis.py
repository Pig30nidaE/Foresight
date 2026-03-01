from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import asyncio
import functools
from app.models.schemas import PerformanceSummary, Platform
from app.services.chessdotcom import ChessDotComService
from app.services.lichess import LichessService
from app.services.analysis import AnalysisService
from app.services.opponent_analysis import OpponentAnalysisService

router = APIRouter()
chessdotcom_svc = ChessDotComService()
lichess_svc = LichessService()
analysis_svc = AnalysisService()
opponent_svc = OpponentAnalysisService()


@router.get("/performance/{platform}/{username}", response_model=PerformanceSummary)
async def get_performance_summary(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz", description="bullet | blitz | rapid | classical"),
    max_games: int = Query(default=100, ge=10, le=500),
):
    """
    플레이어 퍼포먼스 요약 통계
    - 승률, 오프닝별 통계, 최근 트렌드 등
    """
    try:
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, max_games)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class)

        return analysis_svc.get_performance_summary(username, platform, games, time_class)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/openings/{platform}/{username}")
async def get_opening_stats(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    top_n: int = Query(default=10, ge=1, le=30),
    max_games: int = Query(default=200, ge=10, le=500),
):
    """
    오프닝별 통계 상위 N개
    """
    try:
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, max_games)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class)

        df = analysis_svc.build_dataframe(games)
        if not df.empty and time_class:
            df = df[df["time_class"] == time_class]

        return analysis_svc.get_opening_stats(df, top_n)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opponent/{platform}/{username}")
async def get_opponent_analysis(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=200, ge=20, le=500),
):
    """
    대회 준비용 상대 분석 (ML 기반 완전 재설계)
    - Stockfish 스냅샷 (게임당 3위치, 페이즈별 cp_loss)
    - LightGBM: 블런더 트리거 피처 중요도 추출
    - K-Means: 플레이 스타일 군집화 (결과 변수 제외)
    - 오프닝 ECO 그룹별 약점 + 구체적 준비 조언
    """
    try:
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, max_games)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class)

        games = [g for g in games if g.time_class == time_class]
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, functools.partial(opponent_svc.analyze, games, username)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
