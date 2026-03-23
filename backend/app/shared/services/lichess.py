"""
Lichess API 연동 서비스
Docs: https://lichess.org/api
공개 게임은 토큰 없이 접근 가능, 자신의 게임은 OAuth 토큰 필요
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import httpx
import re
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import quote

from app.core.config import settings
from app.models.schemas import PlayerProfile, GameSummary, GameResult, Platform
from app.shared.services import opening_db

# PGN CP eval 추출 (Lichess evals=true 요청 시 포함됨)
_RE_EVAL = re.compile(r'\[%eval\s+([+-]?(?:\d+\.?\d*|#[+-]?\d+))\]')

logger = logging.getLogger(__name__)


class LichessRateLimitedError(Exception):
    """Lichess가 429를 반환했고 재시도 후에도 실패한 경우."""

    pass


def _build_pgn(raw: dict, w_disp: str, b_disp: str) -> Optional[str]:
    """Lichess NDJSON 게임 객체 → PGN 문자열 재구성.

    NDJSON 포맷에는 'pgn' 필드가 없으므로 'moves'(SAN 공백구분)와
    'clocks'(센티초 배열)로 PGN을 직접 구성한다.
    """
    moves_str = (raw.get("moves") or "").strip()
    if not moves_str:
        return None

    winner = raw.get("winner")
    if winner == "white":
        result_str = "1-0"
    elif winner == "black":
        result_str = "0-1"
    else:
        result_str = "1/2-1/2"

    date_str = "????.??.??"
    ts = raw.get("createdAt")
    if ts:
        try:
            dt = datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc)
            date_str = dt.strftime("%Y.%m.%d")
        except Exception:
            pass

    tc_obj = raw.get("clock") or {}
    initial = tc_obj.get("initial")
    increment = tc_obj.get("increment")
    tc_str = f"{initial}+{increment}" if initial is not None and increment is not None else "-"

    opening = raw.get("opening") or {}
    eco = opening.get("eco", "")
    opening_name = opening.get("name", "")

    lines = [
        f'[Event "Lichess {raw.get("speed", "")}"]',
        f'[Site "https://lichess.org/{raw.get("id", "")}"]',
        f'[Date "{date_str}"]',
        f'[White "{w_disp}"]',
        f'[Black "{b_disp}"]',
        f'[Result "{result_str}"]',
        f'[TimeControl "{tc_str}"]',
    ]
    if eco:
        lines.append(f'[ECO "{eco}"]')
    if opening_name:
        lines.append(f'[Opening "{opening_name}"]')
    lines.append("")  # blank line before moves

    move_tokens = moves_str.split()
    clocks = raw.get("clocks")  # centiseconds, alternates white/black
    parts: list = []
    move_num = 1
    for i, san in enumerate(move_tokens):
        if i % 2 == 0:
            parts.append(f"{move_num}.")
        parts.append(san)
        if isinstance(clocks, list) and i < len(clocks):
            cs = int(clocks[i])
            total_s = cs // 100  # centiseconds → seconds
            h = total_s // 3600
            m = (total_s % 3600) // 60
            s = total_s % 60
            parts.append(f"{{[%clk {h}:{m:02d}:{s:02d}]}}")
        if i % 2 == 1:
            move_num += 1
    parts.append(result_str)
    lines.append(" ".join(parts))

    return "\n".join(lines)


def _parse_cp_evals(pgn: str) -> Optional[List[Optional[float]]]:
    """PGN에서 %eval 어노테이션을 파싱해 수별 CP 평가 리스트 반환."""
    if not pgn:
        return None
    matches = _RE_EVAL.findall(pgn)
    if not matches:
        return None
    result: List[Optional[float]] = []
    for m in matches:
        if "#" in m:
            result.append(999.0 if "-" not in m else -999.0)
        else:
            try:
                result.append(float(m))
            except ValueError:
                result.append(None)
    return result if result else None


def _lichess_ts_to_iso(ts: object) -> str:
    """Lichess createdAt (Unix 밀리초 정수) → ISO 8601 문자열."""
    try:
        return datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return ""


def _normalize_username(username: str) -> str:
    return (username or "").strip()


def _api_username(username: str) -> str:
    """Lichess API는 사용자 id를 소문자로 취급."""
    return _normalize_username(username).lower()


def _quote_user_path(username: str) -> str:
    """URL 경로용 (특수문자 안전)."""
    return quote(_api_username(username), safe="")


def _side_user_id(side: dict) -> str:
    u = side.get("user")
    if isinstance(u, dict):
        return str(u.get("id") or u.get("name") or "").strip().lower()
    return ""


def _side_display_name(side: dict) -> str:
    u = side.get("user")
    if isinstance(u, dict) and u.get("name"):
        return str(u["name"])
    if side.get("aiLevel") is not None:
        return "Stockfish"
    return "?"


class LichessService:
    BASE_URL = settings.LICHESS_BASE_URL
    _RECENT_GAMES_TTL_SEC = 45.0
    _recent_games_cache: dict[tuple, tuple[float, List[GameSummary]]] = {}
    _recent_games_locks: dict[tuple, asyncio.Lock] = {}
    # Lichess는 게임 다운로드를 동시에 1개만 허용하도록 권고 (rate limit 준수)
    _download_semaphore: asyncio.Semaphore = asyncio.Semaphore(1)

    def _user_agent(self) -> str:
        if settings.LICHESS_USER_AGENT.strip():
            return settings.LICHESS_USER_AGENT.strip()
        return f"{settings.PROJECT_NAME}/1.0 (lichess.org/api; chess analytics)"

    def _get_headers(self, *, accept: str = "application/x-ndjson") -> dict:
        headers = {"Accept": accept, "User-Agent": self._user_agent()}
        if settings.LICHESS_API_TOKEN:
            headers["Authorization"] = f"Bearer {settings.LICHESS_API_TOKEN}"
        return headers

    async def _get_with_429_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        *,
        headers: dict,
        params: Optional[dict] = None,
        timeout: float = 90.0,
    ) -> httpx.Response:
        max_attempts = max(1, int(settings.LICHESS_MAX_RETRIES))
        for attempt in range(max_attempts):
            resp = await client.get(url, headers=headers, params=params, timeout=timeout)
            if resp.status_code != 429:
                resp.raise_for_status()
                return resp
            if attempt >= max_attempts - 1:
                logger.error("Lichess 429 after %s attempts: %s", max_attempts, url)
                raise LichessRateLimitedError(
                    "Lichess API rate limit exceeded. Please wait a minute and try again, "
                    "or add LICHESS_API_TOKEN for higher limits."
                )
            wait = min(2.0 * (2**attempt), 60.0)
            ra = resp.headers.get("Retry-After")
            if ra is not None:
                try:
                    wait = min(float(ra), 120.0)
                except ValueError:
                    if str(ra).isdigit():
                        wait = min(int(ra), 120)
            logger.warning(
                "Lichess 429 Too Many Requests (attempt %s/%s), retry in %.1fs",
                attempt + 1,
                max_attempts,
                wait,
            )
            await asyncio.sleep(wait)

    async def get_player_profile(self, username: str) -> PlayerProfile:
        """플레이어 기본 프로필 조회"""
        uid = _quote_user_path(username)
        async with httpx.AsyncClient() as client:
            resp = await self._get_with_429_retry(
                client,
                f"{self.BASE_URL}/user/{uid}",
                headers=self._get_headers(accept="application/json"),
            )

        data = resp.json()
        perfs = data.get("perfs", {})
        profile = data.get("profile") if isinstance(data.get("profile"), dict) else {}
        avatar_url: Optional[str] = None
        if isinstance(profile.get("image"), str) and profile["image"].startswith("http"):
            avatar_url = profile["image"]
        canonical = data.get("username") or data.get("id") or _api_username(username)

        def _perf_games(key: str) -> Optional[int]:
            try:
                return perfs[key].get("games", None)
            except (KeyError, TypeError):
                return None

        games_bullet    = _perf_games("bullet")
        games_blitz     = _perf_games("blitz")
        games_rapid     = _perf_games("rapid")
        games_classical = _perf_games("classical")
        tc_counts = {
            "bullet": games_bullet or 0,
            "blitz": games_blitz or 0,
            "rapid": games_rapid or 0,
            "classical": games_classical or 0,
        }
        preferred = max(tc_counts, key=lambda k: tc_counts[k]) if any(tc_counts.values()) else None

        return PlayerProfile(
            username=str(canonical),
            platform=Platform.lichess,
            rating_rapid=perfs.get("rapid", {}).get("rating"),
            rating_blitz=perfs.get("blitz", {}).get("rating"),
            rating_bullet=perfs.get("bullet", {}).get("rating"),
            rating_classical=perfs.get("classical", {}).get("rating"),
            country=profile.get("country") or data.get("country"),
            avatar_url=avatar_url,
            joined=str(data.get("createdAt", "")),
            games_bullet=games_bullet,
            games_blitz=games_blitz,
            games_rapid=games_rapid,
            games_classical=games_classical,
            preferred_time_class=preferred,
        )

    async def get_recent_games(
        self,
        username: str,
        max_games: int = 100,
        perf_type: Optional[str] = None,  # bullet, blitz, rapid, classical
        since_ms: Optional[int] = None,  # Unix milliseconds
        until_ms: Optional[int] = None,  # Unix milliseconds
        *,
        clocks: bool = False,
        evals: bool = False,
    ) -> List[GameSummary]:
        """게임 목록 조회 (ndjson 스트림). since_ms/until_ms 로 기간 필터링 가능.

        clocks=True: PGN에 %clk 어노테이션 포함 (시간 압박 분석용).
        evals=True: Lichess Stockfish 평가 포함 (기본 False — 자체 Stockfish 사용).
        """
        fetch_max = min(max(max_games, 50), 5000)
        cache_key = (username.lower(), fetch_max, perf_type, since_ms, until_ms, clocks, evals)

        # 1차 캐시 확인 (락 없이 빠른 경로)
        now = time.monotonic()
        cached = self._recent_games_cache.get(cache_key)
        if cached and (now - cached[0]) <= self._RECENT_GAMES_TTL_SEC:
            logger.debug("Lichess games cache hit for %s", username)
            return list(cached[1])

        # 동일 cache_key 동시 요청은 하나만 Lichess에 도달하도록 락 획득
        lock = self._recent_games_locks.setdefault(cache_key, asyncio.Lock())
        async with lock:
            # 락 획득 후 재확인 (이중 잠금 패턴)
            now = time.monotonic()
            cached = self._recent_games_cache.get(cache_key)
            if cached and (now - cached[0]) <= self._RECENT_GAMES_TTL_SEC:
                logger.debug("Lichess games cache hit (post-lock) for %s", username)
                return list(cached[1])

            params: dict = {
                "max": fetch_max,
                "opening": "true",
                "clocks": "true" if clocks else "false",
                "evals": "true" if evals else "false",
            }
            if perf_type:
                params["perfType"] = perf_type
            if since_ms:
                params["since"] = since_ms
            if until_ms:
                params["until"] = until_ms

            uid = _quote_user_path(username)
            async with self._download_semaphore:
                async with httpx.AsyncClient() as client:
                    resp = await self._get_with_429_retry(
                        client,
                        f"{self.BASE_URL}/games/user/{uid}",
                        headers=self._get_headers(),
                        params=params,
                        timeout=90.0,
                    )

            games: List[GameSummary] = []
            uname = _api_username(username)
            for line in resp.text.strip().split("\n"):
                if not line:
                    continue
                try:
                    raw = json.loads(line)
                    parsed = self._parse_game(raw, uname, perf_type)
                    if parsed.game_id:
                        games.append(parsed)
                except Exception:
                    continue

            self._recent_games_cache[cache_key] = (time.monotonic(), list(games))
            return games

    def _parse_game(self, raw: dict, username_lower: str, perf_type: Optional[str] = None) -> GameSummary:
        players = raw.get("players", {})
        white = players.get("white") if isinstance(players.get("white"), dict) else {}
        black = players.get("black") if isinstance(players.get("black"), dict) else {}

        w_id = _side_user_id(white)
        b_id = _side_user_id(black)
        w_disp = _side_display_name(white)
        b_disp = _side_display_name(black)

        def _matches(uid: str, disp: str) -> bool:
            d = disp.strip().lower() if disp else ""
            return (bool(uid) and uid == username_lower) or (bool(d) and d == username_lower)

        user_is_white = _matches(w_id, w_disp)
        user_is_black = _matches(b_id, b_disp)
        if user_is_white and user_is_black:
            user_is_black = False

        winner = raw.get("winner")  # "white" | "black" | None (draw / abort)
        if winner is None:
            result = GameResult.draw
        elif user_is_white and not user_is_black:
            result = GameResult.win if winner == "white" else GameResult.loss
        elif user_is_black and not user_is_white:
            result = GameResult.win if winner == "black" else GameResult.loss
        else:
            # /games/user/{user} 스트림이지만 파싱 예외 시 무승부로 처리
            logger.warning(
                "Lichess game %s: could not map user %s to white/black; defaulting to draw",
                raw.get("id"),
                username_lower,
            )
            result = GameResult.draw

        opening = raw.get("opening", {}) if isinstance(raw.get("opening"), dict) else {}
        # perf_type 파라미터로 받았다면 사용 (이미 필터된 데이터)
        # 아니면 응답의 speed 필드 사용
        speed = perf_type or raw.get("speed", "") or ""

        eco_code: Optional[str] = opening.get("eco")
        # Lichess가 제공하는 이름이 우선 (이미 동일 DB 사용)
        # 누락 시 opening_db로 fallback
        opening_name: Optional[str] = opening.get("name")
        if not opening_name and eco_code:
            opening_name = opening_db.get_name_by_eco(eco_code)

        pgn_out: Optional[str] = _build_pgn(raw, w_disp, b_disp)
        ma = raw.get("analysis")
        move_analysis = ma if isinstance(ma, list) else None

        return GameSummary(
            game_id=str(raw.get("id", "") or ""),
            platform=Platform.lichess,
            white=w_disp,
            black=b_disp,
            result=result,
            time_class=str(speed),
            opening_eco=eco_code,
            opening_name=opening_name,
            pgn=pgn_out,
            played_at=_lichess_ts_to_iso(raw.get("createdAt")),
            url=f"https://lichess.org/{raw.get('id', '')}",
            rating_white=white.get("rating"),
            rating_black=black.get("rating"),
            cp_evals=_parse_cp_evals(pgn_out or ""),
            move_analysis=move_analysis,
        )
