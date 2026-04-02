import asyncio
import errno
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.limiter import limiter
from app.shared.services.lichess import LichessRateLimitedError
from app.shared.services.incomplete_signup_cleanup import start_incomplete_signup_cleanup_task, stop_incomplete_signup_cleanup_task
from app.api.routes import player, games, analysis, stats, engine, opening_tier, forum, game_analysis, profile
from app.shared.services import opening_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,  # 기본 로깅 레벨을 INFO로 설정
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """서버 시작 시 필요한 초기화 및 백그라운드 태스크를 시작합니다."""
    count = await opening_db.load_opening_db()
    logger.info(f"[Startup] Opening DB 준비 완료 — {count}개 ECO 코드")

    # Opening Tier cache: 디스크 캐시 로드는 가볍게, 정기 프리페치는 매월 1일 UTC 00:00에 수행합니다.
    from app.features.opening_tier.services.opening_tier_service import OpeningTierService

    opening_tier_svc = OpeningTierService()
    _app.state.opening_tier_service = opening_tier_svc
    cache_ok = await opening_tier_svc.load_cache_from_disk_if_valid()
    if not cache_ok:
        _app.state.opening_tier_refresh_task = asyncio.create_task(
            opening_tier_svc.refresh_cache_for_all()
        )
    opening_tier_svc.start_midnight_cache_refresher()
    
    # 미완료 가입자 자동 정리 스케줄러 시작
    _app.state.incomplete_signup_cleanup_task = await start_incomplete_signup_cleanup_task()
    
    yield
    
    # shutdown: 스케줄러 task 정리
    try:
        opening_tier_svc.stop_midnight_cache_refresher()
    except Exception:
        pass
    task = getattr(_app.state, "opening_tier_refresh_task", None)
    if task is not None:
        task.cancel()
    
    # 미완료 가입자 정리 태스크 중지
    cleanup_task = getattr(_app.state, "incomplete_signup_cleanup_task", None)
    if cleanup_task is not None:
        stop_incomplete_signup_cleanup_task(cleanup_task)



app = FastAPI(
    title="Foresight API",
    description="체스 유저를 위한 분석 플랫폼",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.API_DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.API_DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.API_DOCS_ENABLED else None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_LOCAL_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "data" / "forum_uploads"
_LOCAL_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_LOCAL_UPLOADS_DIR)), name="uploads")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
    )
    response.headers.setdefault("X-Frame-Options", "DENY")
    if settings.SECURITY_HSTS_MAX_AGE > 0:
        response.headers.setdefault(
            "Strict-Transport-Security",
            f"max-age={settings.SECURITY_HSTS_MAX_AGE}; includeSubDomains",
        )
    return response


@app.middleware("http")
async def postgres_unreachable_returns_503(request: Request, call_next):
    try:
        return await call_next(request)
    except OperationalError:
        logger.warning("PostgreSQL OperationalError (connection failed)")
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
            logger.warning("PostgreSQL network error errno=%s", getattr(e, "errno", None))
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
# - allow_origins: FORESIGHT_CORS_ORIGINS + 기본값(로컬, 프로덕션 Vercel)
# - allow_origin_regex: 로컬 호스트 + Vercel 프리뷰(*.vercel.app) — 프리뷰 URL은 매 배포마다 달라짐
_VERCEL_APP_ORIGIN_RE = r"^https://[a-zA-Z0-9.-]+\.vercel\.app$"
_LOCAL_ORIGIN_RE = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=rf"{_LOCAL_ORIGIN_RE}|{_VERCEL_APP_ORIGIN_RE}",
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
app.include_router(profile.router, prefix="/api/v1", tags=["Profile"])
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
