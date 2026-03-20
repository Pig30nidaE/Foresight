from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.models.schemas import PerformanceSummary, Platform
from app.shared.services.chessdotcom import ChessDotComService
from app.shared.services.lichess import LichessRateLimitedError, LichessService
from app.features.dashboard.services.analysis import AnalysisService

router = APIRouter()
chessdotcom_svc = ChessDotComService()
lichess_svc = LichessService()
analysis_svc = AnalysisService()


@router.get("/performance/{platform}/{username}", response_model=PerformanceSummary)
async def get_performance_summary(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz", description="bullet | blitz | rapid | classical"),
    max_games: int = Query(default=5000, le=5000),
):
    """
    플레이어 퍼포먼스 요약 통계
    - 승률, 오프닝별 통계, 최근 트렌드 등
    """
    try:
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, max_games)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class, evals=False)

        return analysis_svc.get_performance_summary(username, platform, games, time_class)
    except LichessRateLimitedError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/openings/{platform}/{username}")
async def get_opening_stats(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    top_n: int = Query(default=10, ge=1, le=30),
    max_games: int = Query(default=5000, le=5000),
):
    """
    오프닝별 통계 상위 N개
    """
    try:
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, max_games)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class, evals=False)

        rows = analysis_svc.build_rows(games)
        if rows and time_class:
            rows = [r for r in rows if r["time_class"] == time_class]

        return analysis_svc.get_opening_stats(rows, top_n)
    except LichessRateLimitedError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opponent/{platform}/{username}")
async def get_opponent_analysis(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=5000, le=5000),
):
    """
    상대 플레이어 분석 (대회 준비용)
    - 상대의 자주 쓰는 오프닝, 약점 분석
    """
    try:
        if platform == Platform.chessdotcom:
            games = await chessdotcom_svc.get_recent_games(username, max_games)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class, evals=False)

        rows = analysis_svc.build_rows(games)
        if rows and time_class:
            rows = [r for r in rows if r["time_class"] == time_class]

        openings = analysis_svc.get_opening_stats(rows, top_n=10)
        trend = analysis_svc.get_result_trend(rows)

        total = len(rows)
        wins   = sum(1 for r in rows if r["result"] == "win")
        losses = sum(1 for r in rows if r["result"] == "loss")

        return {
            "username": username,
            "platform": platform,
            "total_games_analyzed": total,
            "win_rate": round(wins / total * 100, 1) if total else 0,
            "loss_rate": round(losses / total * 100, 1) if total else 0,
            "frequent_openings": openings,
            "result_trend": trend[-20:],  # 최근 20게임 트렌드
        }
    except LichessRateLimitedError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
