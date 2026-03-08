from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class Tier(str, Enum):
    S = "S"
    A = "A"
    B = "B"
    C = "C"
    D = "D"


class OpeningTierEntry(BaseModel):
    eco: str
    name: str
    tier: Tier
    white_wins: int
    draws: int
    black_wins: int
    total_games: int
    win_rate: float
    draw_rate: float
    tier_score: float


class RatingBracket(BaseModel):
    lichess_rating: int
    chesscom_rating: int
    label_lichess: str
    label_chesscom: str


class Platform(str, Enum):
    chessdotcom = "chess.com"
    lichess = "lichess"


class PlayerProfile(BaseModel):
    username: str
    platform: Platform
    rating_rapid: Optional[int] = None
    rating_blitz: Optional[int] = None
    rating_bullet: Optional[int] = None
    country: Optional[str] = None
    avatar_url: Optional[str] = None
    joined: Optional[str] = None
    # 타임클래스별 누적 게임 수
    games_bullet: Optional[int] = None
    games_blitz: Optional[int] = None
    games_rapid: Optional[int] = None
    games_classical: Optional[int] = None
    # 클래시컬 레이팅 (Lichess 전용)
    rating_classical: Optional[int] = None
    # 가장 많이 플레이한 타임클래스 (자동 감지)
    preferred_time_class: Optional[str] = None


class GameResult(str, Enum):
    win = "win"
    loss = "loss"
    draw = "draw"


class GameSummary(BaseModel):
    game_id: str
    platform: Platform
    white: str
    black: str
    result: GameResult
    time_class: str  # bullet, blitz, rapid, classical
    opening_eco: Optional[str] = None
    opening_name: Optional[str] = None
    pgn: Optional[str] = None
    played_at: Optional[str] = None
    url: Optional[str] = None
    # 추가 필드 (전적 UI용)
    rating_white: Optional[int] = None
    rating_black: Optional[int] = None
    cp_evals: Optional[List[Optional[float]]] = None  # 수별 centipawn eval


class OpeningStats(BaseModel):
    eco: str
    name: str
    games: int
    wins: int
    losses: int
    draws: int
    win_rate: float


class PerformanceSummary(BaseModel):
    username: str
    platform: Platform
    time_class: str
    total_games: int
    wins: int
    losses: int
    draws: int
    win_rate: float
    top_openings: List[OpeningStats] = []
