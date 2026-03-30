"""
첫 수 선호도, 오프닝 트리, 수 품질 분석 엔드포인트
MVP 섹션 1, 2, 3 대응
"""
import asyncio
import functools
import logging
import time
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.models.schemas import Platform
from app.shared.services.chessdotcom import ChessDotComService
from app.shared.services.lichess import LichessService
from app.features.dashboard.services.analysis import AnalysisService
from app.shared.services.pgn_parser import parse_games_bulk
from app.features.dashboard.services.tactical_analysis import TacticalAnalysisService
from app.features.dashboard.services.tactical_jobs import tactical_job_store

logger = logging.getLogger(__name__)

router = APIRouter()
chessdotcom_svc = ChessDotComService()
lichess_svc = LichessService()
analysis_svc = AnalysisService()
tactical_svc = TacticalAnalysisService()
TACTICAL_REQUEST_VERSION = "v2026-03-14-1"
TACTICAL_STALE_SEC = 300
TACTICAL_ANALYZE_TIMEOUT_SEC = 900


def _tactical_request_key(
    platform: Platform,
    username: str,
    time_class: str,
    max_games: int,
    since_ms: Optional[int],
    until_ms: Optional[int],
) -> str:
    return ":".join([
        TACTICAL_REQUEST_VERSION,
        str(platform),
        username.lower(),
        time_class,
        str(max_games),
        str(since_ms or ""),
        str(until_ms or ""),
    ])


@router.get("/tactical-patterns/{platform}/{username}/progress")
async def get_tactical_pattern_progress(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=1000),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    request_key = _tactical_request_key(platform, username, time_class, max_games, since_ms, until_ms)
    job = tactical_job_store.get_latest_for_request(request_key)
    if not job:
        return {
            "status": "idle",
            "progress_percent": 0,
            "stage": "idle",
            "message": "분석 대기 중",
            "total_games": 0,
            "analyzed_games": 0,
            "job_id": None,
            "error": None,
        }

    # 오래 업데이트되지 않은 running/queued job은 실패로 전환해 무한 로딩을 막는다.
    if job.status in {"queued", "running"} and (time.time() - job.updated_at) > TACTICAL_STALE_SEC:
        logger.warning(
            "[tactical-patterns] stale progress auto-fail request_key=%s job_id=%s status=%s progress=%s",
            request_key,
            job.job_id,
            job.status,
            job.progress_percent,
        )
        tactical_job_store.fail_job(job.job_id, "stale tactical job")
        refreshed = tactical_job_store.get_job(job.job_id)
        if refreshed is not None:
            job = refreshed

    payload = job.to_dict()
    if payload.get("result") is not None:
        payload.pop("result", None)
    return payload


@router.get("/first-moves/{platform}/{username}")
async def get_first_move_stats(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=5000),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    """
    MVP 섹션 1: 백/흑 첫 수 선호도 및 승률
    since_ms / until_ms (Unix ms) 로 기간 필터 가능.
    """
    try:
        logger.info(f"[First Moves] {platform}:{username} (timeClass={time_class})")
        if platform == Platform.chessdotcom:
            since_ts = since_ms // 1000 if since_ms else None
            until_ts = until_ms // 1000 if until_ms else None
            games = await chessdotcom_svc.get_recent_games(username, max_games, since_ts=since_ts, until_ts=until_ts, time_class=time_class)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class, since_ms=since_ms, until_ms=until_ms)

        logger.info(f"  → API returned {len(games)} games")

        # build_dataframe / build_rows 는 list[dict] 반환 (pandas 아님). GameSummary.pgn 기준 첫 수 추출.
        rows = analysis_svc.build_rows(games)
        logger.info(f"  → rows: {len(rows)} (first-move stats input)")

        result = analysis_svc.get_first_move_stats(rows, username.lower())
        logger.info(f"  → Result: white={len(result['white'])}, black={len(result['black'])}, total_games={result.get('total_games', 'N/A')}")
        return result
    except Exception as e:
        logger.error(f"  → ERROR: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opening-tree/{platform}/{username}")
async def get_opening_tree(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=5000),
    depth: int = Query(default=3, ge=1, le=5),
    side: Optional[str] = Query(default=None, description="white | black — 특정 색 게임만 필터"),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    """
    MVP 섹션 2-A: 오프닝 트리 탐색기
    - side='white' 또는 'black' 으로 색 필터 가능
    """
    try:
        if platform == Platform.chessdotcom:
            since_ts = since_ms // 1000 if since_ms else None
            until_ts = until_ms // 1000 if until_ms else None
            games = await chessdotcom_svc.get_recent_games(username, max_games, since_ts=since_ts, until_ts=until_ts, time_class=time_class)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class, since_ms=since_ms, until_ms=until_ms)

        rows = analysis_svc.build_rows(games)
        if side:
            u = username.lower()
            if side == "white":
                rows = [r for r in rows if (r.get("white") or "").lower() == u]
            elif side == "black":
                rows = [r for r in rows if (r.get("black") or "").lower() == u]

        return analysis_svc.get_opening_tree(rows, depth)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/opening-best-worst/{platform}/{username}")
async def get_best_worst_openings(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=5000),
    min_games: int = Query(default=10),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    """
    MVP 섹션 2-B: 오프닝 퍼포먼스 요약 (베스트 / 워스트)
    """
    try:
        if platform == Platform.chessdotcom:
            since_ts = since_ms // 1000 if since_ms else None
            until_ts = until_ms // 1000 if until_ms else None
            games = await chessdotcom_svc.get_recent_games(username, max_games, since_ts=since_ts, until_ts=until_ts, time_class=time_class)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class, since_ms=since_ms, until_ms=until_ms)

        rows = analysis_svc.build_rows(games)
        return analysis_svc.get_best_worst_openings(rows, min_games)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/time-pressure/{platform}/{username}")
async def get_time_pressure(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=5000),
    pressure_threshold: float = Query(default=30.0, description="시간 압박 기준 잔여 시간(초)"),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    """
    MVP 섹션 3-A: 시간 압박 분석
    - PGN 클록 어노테이션 `{[%clk H:MM:SS]}` 파싱
    - 수 페이즈(opening/middlegame/endgame)별 시간 압박 비율
    - 수 번호별 평균 소비 시간 + 압박 퍼센트

    games_with_clock 이 0이면 해당 플랫폼/타임클래스에 클록 데이터가 없음.
    """
    try:
        if platform == Platform.chessdotcom:
            since_ts = since_ms // 1000 if since_ms else None
            until_ts = until_ms // 1000 if until_ms else None
            games = await chessdotcom_svc.get_recent_games(username, max_games, since_ts=since_ts, until_ts=until_ts, time_class=time_class)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class, since_ms=since_ms, until_ms=until_ms)

        # Note: games는 이미 get_recent_games() 에서 time_class로 필터됨
        parsed = parse_games_bulk(games, pressure_threshold=pressure_threshold)
        return analysis_svc.get_time_pressure_stats(parsed, username)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tactical-patterns/{platform}/{username}")
async def get_tactical_patterns(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=1000),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    """
    ML 전술 패턴 분석 — MVP.md 기반
    시간 압박, 즉각 반응, 핀/포크/백랭크 등 다양한 전술적 패턴을 분석합니다.
    """
    request_key = _tactical_request_key(platform, username, time_class, max_games, since_ms, until_ms)
    existing_job = tactical_job_store.get_latest_for_request(request_key)
    if existing_job:
        if existing_job.status in {"queued", "running"}:
            now = time.time()
            if (now - existing_job.updated_at) > TACTICAL_STALE_SEC:
                logger.warning(
                    "[tactical-patterns] stale job reset request_key=%s job_id=%s status=%s updated_at=%s",
                    request_key,
                    existing_job.job_id,
                    existing_job.status,
                    existing_job.updated_at,
                )
                tactical_job_store.fail_job(existing_job.job_id, "stale tactical job reset")
            else:
                logger.warning(
                    "[tactical-patterns] duplicate request joined request_key=%s job_id=%s status=%s progress=%s",
                    request_key,
                    existing_job.job_id,
                    existing_job.status,
                    existing_job.progress_percent,
                )
                joined_at = time.time()
                while True:
                    await asyncio.sleep(0.5)
                    latest = tactical_job_store.get_job(existing_job.job_id)
                    if latest is None:
                        break
                    if latest.status == "completed" and latest.result is not None:
                        logger.info(
                            "[tactical-patterns] joined request resolved request_key=%s job_id=%s",
                            request_key,
                            latest.job_id,
                        )
                        return latest.result
                    if latest.status == "failed":
                        raise HTTPException(status_code=500, detail=latest.error or "전술 분석 실패")
                    # 오래 정체된 running/queued job은 무한 대기를 끊고 재시작한다.
                    if (time.time() - latest.updated_at) > TACTICAL_STALE_SEC or (time.time() - joined_at) > (TACTICAL_STALE_SEC + 30):
                        logger.warning(
                            "[tactical-patterns] joined wait timeout request_key=%s job_id=%s status=%s progress=%s",
                            request_key,
                            latest.job_id,
                            latest.status,
                            latest.progress_percent,
                        )
                        tactical_job_store.fail_job(latest.job_id, "joined request timeout; restarting")
                        break
        # completed job은 무기한 재사용하지 않는다.
        # 분석 캐시는 TacticalAnalysisService 내부 TTL/게임ID 기반 캐시에 맡긴다.

    job = tactical_job_store.create_job(
        request_key=request_key,
        username=username,
        platform=str(platform),
        time_class=time_class,
        max_games=max_games,
    )

    try:
        logger.info(
            "[tactical-patterns] start request_key=%s job_id=%s platform=%s username=%s time_class=%s max_games=%d",
            request_key,
            job.job_id,
            platform,
            username,
            time_class,
            max_games,
        )
        tactical_job_store.update_job(
            job.job_id,
            status="running",
            progress_percent=5,
            stage="fetching",
            message="최근 게임을 수집 중",
            total_games=max_games,
            analyzed_games=0,
        )

        if platform == Platform.chessdotcom:
            since_ts = since_ms // 1000 if since_ms else None
            until_ts = until_ms // 1000 if until_ms else None
            games = await chessdotcom_svc.get_recent_games(username, max_games, since_ts=since_ts, until_ts=until_ts, time_class=time_class)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class, since_ms=since_ms, until_ms=until_ms)

        games = [g for g in games if g.time_class == time_class]
        logger.info(
            "[tactical-patterns] fetched request_key=%s job_id=%s games=%d",
            request_key,
            job.job_id,
            len(games),
        )
        tactical_job_store.update_job(
            job.job_id,
            status="running",
            progress_percent=25,
            stage="fetched",
            message="게임 수집 완료, 전술 분석 시작",
            total_games=len(games),
            analyzed_games=min(len(games), max_games),
        )

        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                functools.partial(
                    tactical_svc.analyze,
                    games,
                    username,
                    progress_callback=lambda percent, stage, message, analyzed_games, total_games: tactical_job_store.update_job(
                        job.job_id,
                        status="running",
                        progress_percent=percent,
                        stage=stage,
                        message=message,
                        analyzed_games=analyzed_games,
                        total_games=total_games,
                    ),
                ),
            ),
            timeout=TACTICAL_ANALYZE_TIMEOUT_SEC,
        )
        tactical_job_store.complete_job(job.job_id, result, total_games=len(games))
        logger.info(
            "[tactical-patterns] completed request_key=%s job_id=%s total_games=%d",
            request_key,
            job.job_id,
            len(games),
        )
        return result
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        tactical_job_store.fail_job(job.job_id, "전술 분석 시간 초과")
        logger.error(
            "[tactical-patterns] timeout request_key=%s job_id=%s timeout_sec=%s",
            request_key,
            job.job_id,
            TACTICAL_ANALYZE_TIMEOUT_SEC,
        )
        raise HTTPException(status_code=504, detail="전술 분석 시간이 초과되었습니다. max_games를 낮춰 다시 시도해주세요.")
    except Exception as e:
        tactical_job_store.fail_job(job.job_id, str(e))
        logger.exception("[tactical-patterns] 분석 실패 user=%s time_class=%s", username, time_class)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tactical-patterns/{platform}/{username}/ai-insights")
async def get_tactical_ai_insights(
    platform: Platform,
    username: str,
    time_class: str = Query(default="blitz"),
    max_games: int = Query(default=300, ge=50, le=1000),
    since_ms: Optional[int] = Query(default=None),
    until_ms: Optional[int] = Query(default=None),
):
    """
    AI 코치 인사이트 — GPT-4o-mini 기반 한국어 자연어 분석.
    OPENAI_API_KEY 없으면 규칙 기반 폴백을 반환합니다.
    """
    try:
        if platform == Platform.chessdotcom:
            since_ts = since_ms // 1000 if since_ms else None
            until_ts = until_ms // 1000 if until_ms else None
            games = await chessdotcom_svc.get_recent_games(username, max_games, since_ts=since_ts, until_ts=until_ts, time_class=time_class)
        else:
            games = await lichess_svc.get_recent_games(username, max_games, time_class, since_ms=since_ms, until_ms=until_ms)

        games = [g for g in games if g.time_class == time_class]
        loop = asyncio.get_event_loop()
        analysis = await loop.run_in_executor(
            None,
            functools.partial(tactical_svc.analyze, games, username, len(games)),
        )

        from app.features.dashboard.services.ai_insights import generate_tactical_insights
        insights = await generate_tactical_insights(analysis, username)

        return {
            "username":    username,
            "platform":    platform,
            "total_games": analysis.get("total_games", 0),
            "insights":    insights,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[tactical-ai-insights] 분석 실패 user=%s time_class=%s", username, time_class)
        raise HTTPException(status_code=500, detail=str(e))
