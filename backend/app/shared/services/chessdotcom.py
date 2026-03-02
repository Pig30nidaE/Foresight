"""
Chess.com Public API 연동 서비스
Docs: https://www.chess.com/news/view/published-data-api
"""
import calendar
import httpx
import re
from datetime import datetime, timezone
from typing import List, Optional
from app.core.config import settings
from app.models.schemas import PlayerProfile, GameSummary, GameResult, Platform
from app.shared.services import opening_db

# PGN 헤더 추출용 정규식
_RE_ECO         = re.compile(r'\[ECO "([^"]+)"\]')
_RE_OPENING_HDR = re.compile(r'\[Opening "([^"]+)"\]')
_RE_VARIATION_HDR = re.compile(r'\[Variation "([^"]+)"\]')
# chess.com eco URL에서 오프닝 이름 추출용
#  예) https://www.chess.com/openings/Caro-Kann-Defense-Advance-... → "Caro-Kann Defense: Advance"
_RE_ECO_URL = re.compile(r'/openings/([^?#]+)$')

# URL 슬러그 → 정식 오프닝 이름 변환 보조 상수
_POSSESSIVE_MAP: dict[str, str] = {
    "Queens": "Queen's", "Kings": "King's", "Bishops": "Bishop's",
    "Whites": "White's", "Blacks": "Black's", "Knights": "Knight's",
}
# 이 키워드가 등장하면 메인 카테고리의 끝 (콜론 삽입 기준)
_CATEGORY_ENDS = {
    "Defense", "Opening", "Attack", "Gambit", "System", "Game",
    "Reversed", "Indian", "Counter", "Debut",
}


def _opening_name_from_url(eco_url: str) -> str:
    """
    https://www.chess.com/openings/Queens-Pawn-Opening-Chigorin-Variation
    → "Queen's Pawn Opening: Chigorin Variation"

    변환 규칙:
    1. 숫자로 시작하는 세그먼트(수 표기) 이전까지만 취함
    2. 소유격 복원: Queens → Queen's, Kings → King's 등
    3. 메인 카테고리 키워드(Defense/Opening/Gambit 등) 뒤에 콜론 삽입
    """
    m = _RE_ECO_URL.search(eco_url or "")
    if not m:
        return "Unknown"
    slug = m.group(1)
    parts = slug.split("-")
    tokens: list[str] = []
    for p in parts:
        if p and p[0].isdigit():
            break
        tokens.append(p)
    if not tokens:
        return "Unknown"

    # 소유격 복원
    tokens = [_POSSESSIVE_MAP.get(t, t) for t in tokens]

    # 메인 카테고리 끝 위치 탐색 (최초로 나오는 카테고리 키워드 다음을 분기점으로)
    split_idx: Optional[int] = None
    for i, t in enumerate(tokens):
        # 아포스트로피 제거 후 비교 ("Queen's" → "Queens" 복원 전 원본 비교용)
        bare = t.replace("'", "")
        if bare in _CATEGORY_ENDS:
            split_idx = i + 1
            break

    if split_idx and split_idx < len(tokens):
        main    = " ".join(tokens[:split_idx])
        variant = " ".join(tokens[split_idx:])
        return f"{main}: {variant}"
    return " ".join(tokens) or "Unknown"


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
        # chess.com 에는 classical 카테고리가 없으므로 None
        tc_counts = {"bullet": games_bullet or 0, "blitz": games_blitz or 0, "rapid": games_rapid or 0}
        preferred = max(tc_counts, key=lambda k: tc_counts[k]) if any(tc_counts.values()) else None

        return PlayerProfile(
            username=username,
            platform=Platform.chessdotcom,
            rating_rapid=self._extract_rating(stats, "chess_rapid"),
            rating_blitz=self._extract_rating(stats, "chess_blitz"),
            rating_bullet=self._extract_rating(stats, "chess_bullet"),
            rating_classical=None,
            country=profile.get("country", "").split("/")[-1],
            avatar_url=profile.get("avatar"),
            joined=str(profile.get("joined", "")),
            games_bullet=games_bullet,
            games_blitz=games_blitz,
            games_rapid=games_rapid,
            games_classical=None,
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
        self,
        username: str,
        max_games: int = 100,
        since_ts: Optional[int] = None,   # Unix seconds (inclusive lower bound)
        until_ts: Optional[int] = None,   # Unix seconds (inclusive upper bound)
        time_class: Optional[str] = None, # 수집 단계에서 타임클래스 필터링 (bullet/blitz/rapid 등)
    ) -> List[GameSummary]:
        """
        아카이브 API를 기반으로 게임 조회.
        time_class 를 지정하면 수집 단계에서 필터링하여 cap 을 의미 있게 만듦.
        since_ts/until_ts 가 주어지면 시간 범위로 필터링. (seconds)
        """
        archives = await self._get_archives(username)
        games: List[GameSummary] = []
        HARD_CAP = 5000
        using_time_filter = since_ts is not None or until_ts is not None
        # 전체 기간(필터 없음)  → 모든 게임 조회 필요 → HARD_CAP 사용
        # 날짜 범위 지정 시    → 날짜 필터가 이미 제한, max_games 는 호출자 의도 존중
        # 단, max_games 가 없거나 0이면 HARD_CAP 으로 폴백
        effective_cap = max(max_games, 1) if using_time_filter else HARD_CAP

        async with httpx.AsyncClient(timeout=20) as client:
            for archive_url in archives:
                if len(games) >= effective_cap:
                    break

                # since_ts 가 있으면 해당 월 이전 아카이브는 건너뜀
                if since_ts is not None:
                    m = re.search(r'/(\d{4})/(\d{2})$', archive_url)
                    if m:
                        yr, mo = int(m.group(1)), int(m.group(2))
                        last_day = calendar.monthrange(yr, mo)[1]
                        month_end = int(datetime(yr, mo, last_day, 23, 59, 59).timestamp())
                        if month_end < since_ts:
                            break  # 이하 아카이브는 모두 더 오래됨

                try:
                    resp = await client.get(archive_url, headers=self.HEADERS)
                    resp.raise_for_status()
                    monthly = resp.json().get("games", [])
                    monthly_sorted = sorted(
                        monthly, key=lambda g: g.get("end_time", 0), reverse=True
                    )
                    for raw in monthly_sorted:
                        if len(games) >= effective_cap:
                            break
                        end_time = raw.get("end_time", 0)
                        if since_ts is not None and end_time < since_ts:
                            continue
                        if until_ts is not None and end_time > until_ts:
                            continue
                        # 수집 단계 타임클래스 필터 — 관계없는 타임클래스가 cap 을 낭비하지 않도록
                        if time_class and raw.get("time_class", "") != time_class:
                            continue
                        games.append(self._parse_game(raw, username))
                except Exception:
                    continue

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

        # 오프닝 이름 결정 (우선순위)
        # 1순위: PGN 헤더 [Opening "..."] + [Variation "..."] — chess.com Review와 동일한 명칭
        # 2순위: chess.com eco URL 슬러그 파싱 (같은 출처, 변형 정보 포함)
        # 3순위: ECO 코드 자체
        # ※ Lichess ECO DB는 chess.com과 명칭 체계가 달라 의도적으로 제외
        pgn_opening_m   = _RE_OPENING_HDR.search(pgn)
        pgn_variation_m = _RE_VARIATION_HDR.search(pgn)
        if pgn_opening_m:
            pgn_name = pgn_opening_m.group(1)
            if pgn_variation_m:
                pgn_name = f"{pgn_name}: {pgn_variation_m.group(1)}"
            opening_name: Optional[str] = pgn_name
        elif eco_url:
            url_name = _opening_name_from_url(eco_url)
            opening_name = url_name if url_name != "Unknown" else eco_code
        else:
            opening_name = eco_code

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
            played_at=_unix_to_iso(raw.get("end_time")),
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
