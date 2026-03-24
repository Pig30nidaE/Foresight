import asyncio
import errno
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.limiter import limiter
from app.shared.services.lichess import LichessRateLimitedError
from app.api.routes import player, games, analysis, stats, engine, opening_tier, forum, game_analysis
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
    task = getattr(_app.state, "opening_tier_refresh_task", None)
    if task is not None:
        task.cancel()



app = FastAPI(
    title="Foresight API",
    description="체스 유저를 위한 분석 플랫폼",
    version="0.1.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
    )
    return response


@app.middleware("http")
async def postgres_unreachable_returns_503(request: Request, call_next):
    try:
        return await call_next(request)
    except OperationalError as e:
        logger.warning("PostgreSQL OperationalError: %s", e)
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Cannot connect to PostgreSQL. If the API runs in Docker Compose, set "
                    "DATABASE_URL host to `db` (not `localhost`). For Postgres on your host machine, "
                    "use `host.docker.internal` as hostname. See docs/forum-setup-checklist.md."
                )
            },
        )
    except OSError as e:
        if getattr(e, "errno", None) in (errno.ECONNREFUSED, errno.EADDRNOTAVAIL):
            logger.warning("PostgreSQL network error errno=%s: %s", e.errno, e)
            return JSONResponse(
                status_code=503,
                content={
                    "detail": (
                        "Cannot reach PostgreSQL. Inside a container, `localhost` is the container itself — "
                        "use Compose service name `db` or `host.docker.internal`. "
                        "Remove `ssl=require` from DATABASE_URL when using local Postgres without TLS."
                    )
                },
            )
        raise

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
app.include_router(forum.router, prefix="/api/v1/forum", tags=["Forum"])


@app.exception_handler(LichessRateLimitedError)
async def lichess_rate_limit_handler(_request, exc: LichessRateLimitedError):
    """Lichess 429 → 클라이언트에 503과 안내 메시지 (내부 500 방지)."""
    return JSONResponse(
        status_code=503,
        content={"detail": str(exc)},
    )


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "service": "Foresight API"}
