from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = None
AsyncSessionLocal = None

if settings.DATABASE_URL.strip():
    _engine_kwargs: dict = {
        "echo": False,
        "pool_pre_ping": True,
        "pool_size": max(1, settings.DATABASE_POOL_SIZE),
        "max_overflow": max(0, settings.DATABASE_MAX_OVERFLOW),
    }
    _recycle = settings.DATABASE_POOL_RECYCLE_SECONDS
    if _recycle is not None and _recycle > 0:
        _engine_kwargs["pool_recycle"] = _recycle
    engine = create_async_engine(settings.DATABASE_URL.strip(), **_engine_kwargs)
    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    if AsyncSessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    async with AsyncSessionLocal() as session:
        yield session
