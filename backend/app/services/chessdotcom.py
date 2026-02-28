"""
Chess.com Public API 연동 서비스
Docs: https://www.chess.com/news/view/published-data-api
"""
import httpx
import re
from typing import List, Optional
from app.core.config import settings
from app.models.schemas import PlayerProfile, GameSummary, GameResult, Platform
from app.services import opening_db

# PGN 헤더에서 ECO 코드 추출용 정규식
_RE_ECO = re.compile(r'\[ECO "([^"]+)"\]')
# chess.com eco URL에서 오프닝 이름 추출용
#  예) https://www.chess.com/openings/Caro-Kann-Defense-Advance-... → "Caro-Kann Defense: Advance"
_RE_ECO_URL = re.compile(r'/openings/([^?#]+)$')


def _opening_name_from_url(eco_url: str) -> str:
    """
    https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Be3
    → "Sicilian Defense: Najdorf Variation"
    주요 변형(4번째 하이픈 세그먼트 이후)은 생략, 가독성 우선
    """
    m = _RE_ECO_URL.search(eco_url or "")
    if not m:
        return "Unknown"
    slug = m.group(1)
    # 숫자로 시작하는 세그먼트(수 표기) 이전까지만 취함
    parts = slug.split("-")
    tokens = []
    for p in parts:
        if p and p[0].isdigit():
            break
        tokens.append(p)
    name = " ".join(tokens)
    # 최초 콜론 구분: "Sicilian Defense Najdorf Variation" → "Sicilian Defense: Najdorf Variation"
    words = name.split()
    if len(words) >= 3:
        name = " ".join(words[:2]) + ": " + " ".join(words[2:])
    return name.strip() or "Unknown"


class ChessDotComService:
    BASE_URL = settings.CHESSDOTCOM_BASE_URL
    HEADERS = {"User-Agent": "Foresight Chess Analytics App (contact@foresight.dev)"}

    async def get_player_profile(self, username: str) -> PlayerProfile:
        """플레이어 기본 프로필 조회"""
        async with httpx.AsyncClient(timeout=15) as client:
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

        def _record_count(key: str) -> Optional[int]:
            """stats[key].record.win + loss + draw = 누적 게임 수"""
            try:
                rec = stats[key]["record"]
                return rec.get("win", 0) + rec.get("loss", 0) + rec.get("draw", 0)
            except (KeyError, TypeError):
                return None

        games_bullet = _record_count("chess_bullet")
        games_blitz  = _record_count("chess_blitz")
        games_rapid  = _record_count("chess_rapid")
        tc_counts = {"bullet": games_bullet or 0, "blitz": games_blitz or 0, "rapid": games_rapid or 0}
        preferred = max(tc_counts, key=lambda k: tc_counts[k]) if any(tc_counts.values()) else None

        return PlayerProfile(
            username=username,
            platform=Platform.chessdotcom,
            rating_rapid=self._extract_rating(stats, "chess_rapid"),
            rating_blitz=self._extract_rating(stats, "chess_blitz"),
            rating_bullet=self._extract_rating(stats, "chess_bullet"),
            country=profile.get("country", "").split("/")[-1],
            avatar_url=profile.get("avatar"),
            joined=str(profile.get("joined", "")),
            games_bullet=games_bullet,
            games_blitz=games_blitz,
            games_rapid=games_rapid,
            preferred_time_class=preferred,
        )

    async def _get_archives(self, username: str) -> List[str]:
        """아카이브 URL 목록 조회 (최신순)"""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{self.BASE_URL}/player/{username}/games/archives",
                headers=self.HEADERS,
            )
            resp.raise_for_status()
        archives = resp.json().get("archives", [])
        return list(reversed(archives))  # 최신 월 먼저

    async def get_player_games(
        self, username: str, year: int, month: int
    ) -> List[GameSummary]:
        """특정 월의 게임 목록 조회"""
        url = f"{self.BASE_URL}/player/{username}/games/{year}/{month:02d}"
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers=self.HEADERS)
            resp.raise_for_status()
        games_data = resp.json().get("games", [])
        return [self._parse_game(game, username) for game in games_data]

    async def get_recent_games(
        self, username: str, max_games: int = 100
    ) -> List[GameSummary]:
        """
        아카이브 API를 기반으로 최신 게임 N개 조회.
        최신 월부터 순서대로 누적하며 max_games 충족 시 중단.
        """
        archives = await self._get_archives(username)
        games: List[GameSummary] = []

        async with httpx.AsyncClient(timeout=20) as client:
            for archive_url in archives:
                if len(games) >= max_games:
                    break
                try:
                    resp = await client.get(archive_url, headers=self.HEADERS)
                    resp.raise_for_status()
                    monthly = resp.json().get("games", [])
                    # 월 내 최신순 정렬
                    monthly_sorted = sorted(
                        monthly, key=lambda g: g.get("end_time", 0), reverse=True
                    )
                    for raw in monthly_sorted:
                        if len(games) >= max_games:
                            break
                        games.append(self._parse_game(raw, username))
                except Exception:
                    continue  # 특정 월 실패해도 다음 월 시도

        return games

    def _parse_game(self, raw: dict, username: str) -> GameSummary:
        white = raw.get("white", {})
        black = raw.get("black", {})
        white_name = white.get("username", "").lower()

        # 결과 파악: 내가 백이면 white.result, 흑이면 black.result
        if white_name == username.lower():
            result_str = white.get("result", "")
        else:
            result_str = black.get("result", "")

        result = self._map_result(result_str)

        # ECO 코드: PGN 헤더에서 추출
        pgn = raw.get("pgn", "") or ""
        eco_match = _RE_ECO.search(pgn)
        eco_code = eco_match.group(1) if eco_match else None

        # 오프닝 이름 결정 (우선순위)
        # 1순위: Lichess 표준 DB (ECO 코드 기반, 정확한 정식 명칭)
        # 2순위: Chess.com eco URL 슬러그 (더 세분화된 변형명)
        # 3순위: ECO 코드 자체
        eco_url = raw.get("eco", "") or ""
        db_name = opening_db.get_name_by_eco(eco_code) if eco_code else None
        url_name = _opening_name_from_url(eco_url) if eco_url else None
        # DB 이름이 있으면 우선 사용 (표준 명칭), URL 이름은 변형 정보로 보조
        if db_name and url_name and url_name not in ("Unknown", db_name):
            # DB 기반 이름에 URL 변형 정보를 보완 (더 구체적일 때만)
            opening_name: Optional[str] = db_name
        elif db_name:
            opening_name = db_name
        else:
            opening_name = url_name or eco_code

        return GameSummary(
            game_id=str(raw.get("uuid", raw.get("url", ""))),
            platform=Platform.chessdotcom,
            white=white.get("username", ""),
            black=black.get("username", ""),
            result=result,
            time_class=raw.get("time_class", ""),
            opening_eco=eco_code,
            opening_name=opening_name,
            pgn=pgn if pgn else None,
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
