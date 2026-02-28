"""
Lichess API 연동 서비스
Docs: https://lichess.org/api
공개 게임은 토큰 없이 접근 가능, 자신의 게임은 OAuth 토큰 필요
"""
import httpx
from typing import List, Optional
from app.core.config import settings
from app.models.schemas import PlayerProfile, GameSummary, GameResult, Platform
from app.services import opening_db


class LichessService:
    BASE_URL = settings.LICHESS_BASE_URL

    def _get_headers(self) -> dict:
        headers = {"Accept": "application/x-ndjson"}
        if settings.LICHESS_API_TOKEN:
            headers["Authorization"] = f"Bearer {settings.LICHESS_API_TOKEN}"
        return headers

    async def get_player_profile(self, username: str) -> PlayerProfile:
        """플레이어 기본 프로필 조회"""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.BASE_URL}/user/{username}", headers={"Accept": "application/json"}
            )
            resp.raise_for_status()

        data = resp.json()
        perfs = data.get("perfs", {})

        def _perf_games(key: str) -> Optional[int]:
            try:
                return perfs[key].get("games", None)
            except (KeyError, TypeError):
                return None

        games_bullet = _perf_games("bullet")
        games_blitz  = _perf_games("blitz")
        games_rapid  = _perf_games("rapid")
        tc_counts = {"bullet": games_bullet or 0, "blitz": games_blitz or 0, "rapid": games_rapid or 0}
        preferred = max(tc_counts, key=lambda k: tc_counts[k]) if any(tc_counts.values()) else None

        return PlayerProfile(
            username=username,
            platform=Platform.lichess,
            rating_rapid=perfs.get("rapid", {}).get("rating"),
            rating_blitz=perfs.get("blitz", {}).get("rating"),
            rating_bullet=perfs.get("bullet", {}).get("rating"),
            country=data.get("profile", {}).get("country"),
            avatar_url=None,
            joined=str(data.get("createdAt", "")),
            games_bullet=games_bullet,
            games_blitz=games_blitz,
            games_rapid=games_rapid,
            preferred_time_class=preferred,
        )

    async def get_recent_games(
        self,
        username: str,
        max_games: int = 100,
        perf_type: Optional[str] = None,  # bullet, blitz, rapid, classical
    ) -> List[GameSummary]:
        """최근 게임 N개 조회 (ndjson 스트림)"""
        params = {
            "max": max_games,
            "opening": "true",
            "clocks": "false",
        }
        if perf_type:
            params["perfType"] = perf_type

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.BASE_URL}/games/user/{username}",
                headers=self._get_headers(),
                params=params,
                timeout=30.0,
            )
            resp.raise_for_status()

        games = []
        for line in resp.text.strip().split("\n"):
            if not line:
                continue
            import json
            try:
                raw = json.loads(line)
                games.append(self._parse_game(raw, username))
            except Exception:
                continue

        return games

    def _parse_game(self, raw: dict, username: str) -> GameSummary:
        players = raw.get("players", {})
        white = players.get("white", {})
        black = players.get("black", {})
        white_name = white.get("user", {}).get("name", "").lower()

        winner = raw.get("winner")  # "white" | "black" | None (draw)
        if winner is None:
            result = GameResult.draw
        elif (winner == "white" and white_name == username.lower()) or (
            winner == "black" and white_name != username.lower()
        ):
            result = GameResult.win
        else:
            result = GameResult.loss

        opening = raw.get("opening", {})
        speed = raw.get("speed", "")  # bullet, blitz, rapid, classical

        eco_code: Optional[str] = opening.get("eco")
        # Lichess가 제공하는 이름이 우선 (이미 동일 DB 사용)
        # 누락 시 opening_db로 fallback
        opening_name: Optional[str] = opening.get("name")
        if not opening_name and eco_code:
            opening_name = opening_db.get_name_by_eco(eco_code)

        return GameSummary(
            game_id=raw.get("id", ""),
            platform=Platform.lichess,
            white=white.get("user", {}).get("name", "?"),
            black=black.get("user", {}).get("name", "?"),
            result=result,
            time_class=speed,
            opening_eco=eco_code,
            opening_name=opening_name,
            pgn=raw.get("pgn"),
            played_at=str(raw.get("createdAt", "")),
            url=f"https://lichess.org/{raw.get('id', '')}",
        )
