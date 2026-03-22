from pydantic import computed_field
from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path

# config.py는 backend/app/core/ 에 위치 → 3단계 위가 프로젝트 루트
_ROOT_ENV = Path(__file__).resolve().parent.parent.parent.parent / ".env"


class Settings(BaseSettings):
    # API
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Foresight"

    # CORS: 비어 있으면 기본(로컬 + 레거시 Vercel). Azure 등 배포 시 콤마로 구분해 전부 나열.
    # 예: https://foresight-frontend.azurestaticapps.net,https://www.yourdomain.com,http://localhost:3000
    FORESIGHT_CORS_ORIGINS: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def ALLOWED_ORIGINS(self) -> List[str]:
        if self.FORESIGHT_CORS_ORIGINS.strip():
            return [
                x.strip()
                for x in self.FORESIGHT_CORS_ORIGINS.split(",")
                if x.strip()
            ]
        return [
            "http://localhost:3000",
            "https://foresight.vercel.app",
        ]

    # Stockfish 리소스 (Azure Container Apps 등 제한 환경에서 조정)
    # Threads: 컨테이너 1 CPU → 1, 로컬 멀티코어 → 2 이상
    # Hash: 컨테이너 2Gi 기준 → 128, 로컬 → 256
    # Concurrent: 동시 분석 허용 개수 (Semaphore). 컨테이너 1 CPU → 1
    STOCKFISH_THREADS: int = 1
    STOCKFISH_HASH_MB: int = 128
    STOCKFISH_CONCURRENT: int = 1

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
