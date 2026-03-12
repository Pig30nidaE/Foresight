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
    CHESSDOTCOM_BASE_URL: str = "https://api.chess.com/pub"

    # OpenAI
    OPENAI_API_KEY: str = ""

    class Config:
        env_file = str(_ROOT_ENV)
        case_sensitive = True
        # allow unrelated env vars (e.g. NEXT_PUBLIC_API_URL) without failing
        extra = "ignore"


settings = Settings()
