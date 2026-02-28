"""
Chess.com Public API 연동 서비스
Docs: https://www.chess.com/news/view/published-data-api
"""
import httpx
from typing import List, Optional
from app.core.config import settings
from app.models.schemas import PlayerProfile, GameSummary, GameResult, Platform


class ChessDotComService:
    BASE_URL = settings.CHESSDOTCOM_BASE_URL
    HEADERS = {"User-Agent": "Foresight Chess Analytics App (contact@foresight.dev)"}

    async def get_player_profile(self, username: str) -> PlayerProfile:
        """플레이어 기본 프로필 조회"""
        async with httpx.AsyncClient() as client:
            profile_resp = await client.get(
                f"{self.BASE_URL}/player/{username}", headers=self.HEADERS
            )
            profile_resp.raise_for_status()
            stats_resp = await client.get(
                f"{self.BASE_URL}/player/{username}/stats", headers=self.HEADERS
            )
            stats_resp.raise_for_status()

        profile = profile_resp.json()
        stats = stats_resp.json()

        return PlayerProfile(
            username=username,
            platform=Platform.chessdotcom,
            rating_rapid=self._extract_rating(stats, "chess_rapid"),
            rating_blitz=self._extract_rating(stats, "chess_blitz"),
            rating_bullet=self._extract_rating(stats, "chess_bullet"),
            country=profile.get("country", "").split("/")[-1],
            avatar_url=profile.get("avatar"),
            joined=str(profile.get("joined", "")),
        )

    async def get_player_games(
        self, username: str, year: int, month: int
    ) -> List[GameSummary]:
        """특정 월의 게임 목록 조회"""
        url = f"{self.BASE_URL}/player/{username}/games/{year}/{month:02d}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=self.HEADERS)
            resp.raise_for_status()

        games_data = resp.json().get("games", [])
        return [self._parse_game(game, username) for game in games_data]

    async def get_recent_games(
        self, username: str, max_games: int = 100
    ) -> List[GameSummary]:
        """최근 게임 N개 조회 (최대 최근 3개월)"""
        from datetime import datetime, timedelta

        games: List[GameSummary] = []
        now = datetime.utcnow()

        for i in range(3):
            target = now - timedelta(days=30 * i)
            monthly = await self.get_player_games(username, target.year, target.month)
            games.extend(monthly)
            if len(games) >= max_games:
                break

        # 최신순 정렬
        games.sort(key=lambda g: g.played_at or "", reverse=True)
        return games[:max_games]

    def _parse_game(self, raw: dict, username: str) -> GameSummary:
        white = raw.get("white", {})
        black = raw.get("black", {})
        white_name = white.get("username", "").lower()

        if white_name == username.lower():
            result_str = white.get("result", "")
        else:
            result_str = black.get("result", "")

        result = self._map_result(result_str)
        opening = raw.get("opening", {})

        return GameSummary(
            game_id=str(raw.get("uuid", raw.get("url", ""))),
            platform=Platform.chessdotcom,
            white=white.get("username", ""),
            black=black.get("username", ""),
            result=result,
            time_class=raw.get("time_class", ""),
            opening_eco=opening.get("eco"),
            opening_name=opening.get("name"),
            pgn=raw.get("pgn"),
            played_at=str(raw.get("end_time", "")),
            url=raw.get("url"),
        )

    def _map_result(self, result_str: str) -> GameResult:
        if result_str == "win":
            return GameResult.win
        if result_str in ("checkmated", "resigned", "timeout", "abandoned", "lose"):
            return GameResult.loss
        return GameResult.draw

    def _extract_rating(self, stats: dict, key: str) -> Optional[int]:
        try:
            return stats[key]["last"]["rating"]
        except (KeyError, TypeError):
            return None
