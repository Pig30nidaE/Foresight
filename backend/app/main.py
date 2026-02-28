import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import player, games, analysis, stats
from app.services import opening_db

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """서버 시작 시 Lichess ECO 오프닝 데이터베이스를 로드합니다."""
    count = await opening_db.load_opening_db()
    logger.info(f"[Startup] Opening DB 준비 완료 — {count}개 ECO 코드")
    yield
    # shutdown: 별도 정리 불필요


app = FastAPI(
    title="Foresight API",
    description="체스 대회 참가자를 위한 AI 기반 대국 분석 서비스 API",
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
app.include_router(stats.router, prefix="/api/v1/stats", tags=["Stats"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "service": "Foresight API"}
