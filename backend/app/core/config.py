from pydantic_settings import BaseSettings
from typing import List


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

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
