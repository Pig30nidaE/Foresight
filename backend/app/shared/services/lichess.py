"""
Lichess API 연동 서비스
Docs: https://lichess.org/api
공개 게임은 토큰 없이 접근 가능, 자신의 게임은 OAuth 토큰 필요
"""
from __future__ import annotations

import asyncio
import json
import logging
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
        evals: bool = True,
    ) -> List[GameSummary]:
        """게임 목록 조회 (ndjson 스트림). since_ms/until_ms 로 기간 필터링 가능.

        clocks=True: PGN에 %clk (시간 압박 분석 등).
        evals=False: 응답 크기·속도 제한 완화 (집계 통계에 eval 불필요 시).
        """
        # API max는 요청 개수와 맞춤 (항상 5000이면 속도 제한·부하 증가)
        fetch_max = min(max(max_games, 50), 5000)
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

        return games

    def _parse_game(self, raw: dict, username_lower: str, perf_type: Optional[str] = None) -> GameSummary:
        # #region agent log
        import time as _t, json as _j
        try:
            _pgn_raw = raw.get("pgn"); _moves_raw = raw.get("moves"); _clocks_raw = raw.get("clocks")
            with open("/Users/pig30nidae/Pig30nidaE/Project/Foresight/.cursor/debug-ce40e3.log","a") as _f:
                _f.write(_j.dumps({"sessionId":"ce40e3","timestamp":int(_t.time()*1000),"location":"lichess.py:_parse_game","message":"raw field check","hypothesisId":"A-B-C-D","data":{"has_pgn_key":"pgn" in raw,"pgn_type":type(_pgn_raw).__name__,"pgn_snippet":str(_pgn_raw)[:80] if _pgn_raw else None,"has_moves_key":"moves" in raw,"moves_snippet":str(_moves_raw)[:80] if _moves_raw else None,"has_clocks_key":"clocks" in raw,"clocks_sample":_clocks_raw[:5] if isinstance(_clocks_raw,list) else _clocks_raw,"game_id":raw.get("id"),"speed":raw.get("speed")}})+"\n")
        except Exception:
            pass
        # #endregion
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

        pgn = raw.get("pgn")
        if isinstance(pgn, str):
            pgn_out: Optional[str] = pgn
        else:
            pgn_out = None

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
        )
