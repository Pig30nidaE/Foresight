import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import player, games, analysis, stats, engine, opening_tier, community, game_analysis
from app.shared.services import opening_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,  # 기본 로깅 레벨을 INFO로 설정
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """서버 시작 시 Lichess ECO 오프닝 데이터베이스를 로드합니다."""
    count = await opening_db.load_opening_db()
    logger.info(f"[Startup] Opening DB 준비 완료 — {count}개 ECO 코드")

    # Opening Tier cache: 디스크 캐시 로드는 가볍게, 실제 프리페치는 자정에만 수행합니다.
    from app.features.opening_tier.services.opening_tier_service import OpeningTierService

    opening_tier_svc = OpeningTierService()
    _app.state.opening_tier_service = opening_tier_svc
    cache_ok = await opening_tier_svc.load_cache_from_disk_if_valid()
    if not cache_ok:
        # 캐시가 없거나 로직 버전이 달라졌다면, 첫 요청 전에 백그라운드로 갱신 시작합니다.
        _app.state.opening_tier_refresh_task = asyncio.create_task(
            opening_tier_svc.refresh_cache_for_all()
        )
    opening_tier_svc.start_midnight_cache_refresher()
    yield
    # shutdown: 스케줄러 task 정리
    try:
        opening_tier_svc.stop_midnight_cache_refresher()
    except Exception:
        pass

    # 백그라운드 갱신 task가 남아있을 수 있어 정리합니다.
    task = getattr(_app.state, "opening_tier_refresh_task", None)
    if task is not None:
        task.cancel()


app = FastAPI(
    title="Foresight API",
    description="체스 유저를 위한 분석 플랫폼",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(player.router, prefix="/api/v1/player", tags=["Player"])
app.include_router(games.router, prefix="/api/v1/games", tags=["Games"])
app.include_router(analysis.router, prefix="/api/v1/analysis", tags=["Analysis"])
app.include_router(game_analysis.router, prefix="/api/v1/game-analysis", tags=["Game Analysis"])
app.include_router(stats.router, prefix="/api/v1/stats", tags=["Stats"])
app.include_router(engine.router, prefix="/api/v1/engine", tags=["Engine"])
app.include_router(opening_tier.router, prefix="/api/v1/opening-tier", tags=["Opening Tier"])
app.include_router(community.router, prefix="/api/v1/community", tags=["Community"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "service": "Foresight API"}
