from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


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
