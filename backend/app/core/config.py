from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path

# config.py는 backend/app/core/ 에 위치 → 3단계 위가 프로젝트 루트
_ROOT_ENV = Path(__file__).resolve().parent.parent.parent.parent / ".env"


class Settings(BaseSettings):
    # API
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Foresight"

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "https://foresight.vercel.app",
    ]

    # External APIs
    LICHESS_API_TOKEN: str = ""
    LICHESS_BASE_URL: str = "https://lichess.org/api"
    # Lichess 권장: 식별 가능한 User-Agent (https://lichess.org/api#section/Introduction/Rate-limiting)
    LICHESS_USER_AGENT: str = ""
    # 429 Too Many Requests 시 재시도 횟수 (간격은 Retry-After 또는 지수 백오프)
    LICHESS_MAX_RETRIES: int = 6
    CHESSDOTCOM_BASE_URL: str = "https://api.chess.com/pub"

    class Config:
        env_file = str(_ROOT_ENV)
        case_sensitive = True
        # allow unrelated env vars (e.g. NEXT_PUBLIC_API_URL) without failing
        extra = "ignore"


settings = Settings()
