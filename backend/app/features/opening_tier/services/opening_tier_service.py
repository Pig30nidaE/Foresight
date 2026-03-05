"""
오프닝 티어 산정 서비스
=======================
카탈로그 기반으로 Lichess Explorer API를 병렬 탐색하여 오프닝별 통계를 수집하고
Z-score 기반 S/A/B/C/D 티어를 배정합니다.

탐색 전략:
    1. OPENINGS_CATALOG의 각 오프닝에 대해 python-chess로 FEN을 생성
    2. asyncio.Semaphore로 동시 요청 수를 제한하며 병렬 API 호출
    3. 결과를 인메모리 캐시 + 디스크 캐시(JSON)에 저장 (TTL: 30일, 월별 갱신)
    4. 카탈로그 탐색으로 충분한 결과를 얻지 못하면 BFS 폴백

CSV/JSON 내보내기:
    export_to_csv() / export_to_json_bytes() 로 bytes 반환 → 파일 다운로드용
"""
from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import statistics
import urllib.parse
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import chess
import httpx

from app.core.config import settings
from app.features.opening_tier.openings_catalog import OPENINGS_CATALOG, OpeningEntry
from app.models.schemas import RatingBracket, Tier

logger = logging.getLogger(__name__)

# ── Lichess Explorer 설정 ────────────────────────────────────────────
EXPLORER_URL = "https://explorer.lichess.org/lichess"
TOP_N_MOVES = 5
MIN_GAMES = 100
REQUEST_DELAY = 0.5          # BFS 단건 요청 간격 (초)
CATALOG_REQUEST_DELAY = 0.3  # 카탈로그 병렬 요청 슬롯 내 딜레이 (초)
MAX_CONCURRENT = 3           # 동시 API 요청 최대 수
MAX_DEPTH = 10
MAX_NODES = 200
MIN_CATALOG_RESULTS = 10     # 이보다 적으면 BFS 폴백

# ── 레이팅 구간 ─────────────────────────────────────────────────────
RATING_BRACKETS = [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]

_BRACKET_RANGES: Dict[int, Tuple[int, Optional[int]]] = {
    400:  (0,    1000),
    1000: (1000, 1200),
    1200: (1200, 1400),
    1400: (1400, 1600),
    1600: (1600, 1800),
    1800: (1800, 2000),
    2000: (2000, 2200),
    2200: (2200, 2500),
    2500: (2500, None),
}

CHESSCOM_OFFSET: Dict[str, int] = {
    "bullet":    250,
    "blitz":     200,
    "rapid":     150,
    "classical": 150,
}

SPEED_MAP: Dict[str, str] = {
    "bullet":    "bullet",
    "blitz":     "blitz",
    "rapid":     "rapid",
    "classical": "classical",
}

# ── 캐시 설정 ─────────────────────────────────────────────────────────
CACHE_TTL = timedelta(days=30)

# 인메모리 캐시: (rating, speed) → (openings, timestamp)
_cache: Dict[Tuple[int, str], Tuple[Dict[str, "_OpeningNode"], datetime]] = {}


# 디스크 캐시 디렉터리: backend/data/opening_tier_cache/
CACHE_DIR = (
    Path(__file__).resolve()
    .parent   # services/
    .parent   # opening_tier/
    .parent   # features/
    .parent   # app/
    .parent   # backend/
    / "data"
    / "opening_tier_cache"
)


@dataclass
class _OpeningNode:
    eco: str
    name: str
    white_wins: int
    draws: int
    black_wins: int
    depth: int
    moves: Optional[List[str]] = None


def _bracket_label(lo: int, hi: Optional[int]) -> str:
    return f"{lo}+" if hi is None else f"{lo}–{hi}"


def _chesscom_label(lichess_key: int, offset: int) -> str:
    lo, hi = _BRACKET_RANGES[lichess_key]
    lo_cc = max(0, lo - offset)
    if hi is None:
        return f"{lo_cc}+"
    hi_cc = max(0, hi - offset)
    return f"{lo_cc}–{hi_cc}"


class OpeningTierService:

    # ─────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────

    async def get_opening_tiers(
        self, rating: int, speed: str, color: str
    ) -> Tuple[List[Dict[str, Any]], str]:
        """오프닝 티어 목록과 데이터 기간 반환. 캐시 미스 시 카탈로그/BFS 탐색 수행."""
        openings = await self._get_or_fetch(rating, speed)
        return self._assign_tiers(openings, color), "all-time"

    def get_bracket_labels(self, speed: str) -> List[RatingBracket]:
        """레이팅 구간 목록 반환 (Lichess + Chess.com 라벨 포함)."""
        offset = CHESSCOM_OFFSET.get(speed, 200)
        result = []
        for lichess_rating in RATING_BRACKETS:
            lo, hi = _BRACKET_RANGES[lichess_rating]
            result.append(
                RatingBracket(
                    lichess_rating=lichess_rating,
                    chesscom_rating=max(0, lichess_rating - offset),
                    label_lichess=_bracket_label(lo, hi),
                    label_chesscom=_chesscom_label(lichess_rating, offset),
                )
            )
        return result

    # ── 내보내기 ──────────────────────────────────────────────────────

    def export_to_csv(
        self,
        openings_data: List[Dict[str, Any]],
        rating: int,
        speed: str,
        color: str,
    ) -> bytes:
        """오프닝 티어 데이터를 CSV bytes로 반환."""
        if not openings_data:
            return b""
        fieldnames = [
            "eco", "name", "tier",
            "white_wins", "draws", "black_wins", "total_games",
            "win_rate", "draw_rate", "tier_score",
        ]
        buf = io.StringIO()
        buf.write(
            f"# rating={rating} speed={speed} color={color} "
            f"generated={datetime.utcnow().isoformat()}Z\n"
        )
        writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(openings_data)
        return buf.getvalue().encode("utf-8")

    def export_to_json_bytes(
        self,
        openings_data: List[Dict[str, Any]],
        rating: int,
        speed: str,
        color: str,
    ) -> bytes:
        """오프닝 티어 데이터를 JSON bytes로 반환."""
        payload = {
            "rating": rating,
            "speed": speed,
            "color": color,
            "total_openings": len(openings_data),
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "openings": openings_data,
        }
        return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")

    def invalidate_cache(self, rating: int, speed: str) -> None:
        """인메모리 + 디스크 캐시 무효화."""
        _cache.pop((rating, speed), None)
        path = self._disk_cache_path(rating, speed)
        if path.exists():
            try:
                path.unlink()
            except OSError as exc:
                logger.warning("Failed to delete disk cache %s: %s", path, exc)

    # ─────────────────────────────────────────────────
    # 캐시 레이어 (인메모리 + 디스크)
    # ─────────────────────────────────────────────────

    async def _get_or_fetch(
        self, rating: int, speed: str
    ) -> Dict[str, _OpeningNode]:
        cache_key = (rating, speed)

        # 1. 인메모리 캐시
        if cache_key in _cache:
            result, ts = _cache[cache_key]
            if datetime.utcnow() - ts < CACHE_TTL:
                return result

        # 2. 디스크 캐시
        disk_result = self._disk_cache_load(rating, speed)
        if disk_result is not None:
            _cache[cache_key] = (disk_result, datetime.utcnow())
            return disk_result

        # 3. 카탈로그 기반 병렬 탐색 (Primary)
        openings = await self._catalog_explore(rating, speed)

        # 4. BFS 폴백 (카탈로그 결과 부족 시)
        if len(openings) < MIN_CATALOG_RESULTS:
            logger.warning(
                "Catalog returned %d entries for rating=%s speed=%s, falling back to BFS",
                len(openings), rating, speed,
            )
            bfs_openings = await self._bfs_explore(rating, speed)
            for eco, node in bfs_openings.items():
                if eco not in openings or node.depth > openings[eco].depth:
                    openings[eco] = node

        # 5. 캐시 저장
        _cache[cache_key] = (openings, datetime.utcnow())
        self._disk_cache_save(rating, speed, openings)
        return openings

    # ── 디스크 캐시 헬퍼 ─────────────────────────────────────────────

    @staticmethod
    def _disk_cache_path(rating: int, speed: str) -> Path:
        return CACHE_DIR / f"{rating}_{speed}.json"

    def _disk_cache_load(
        self, rating: int, speed: str
    ) -> Optional[Dict[str, _OpeningNode]]:
        path = self._disk_cache_path(rating, speed)
        if not path.exists():
            return None
        try:
            mtime = datetime.fromtimestamp(path.stat().st_mtime)
            if datetime.utcnow() - mtime > CACHE_TTL:
                return None
            with path.open(encoding="utf-8") as f:
                raw: Dict[str, Any] = json.load(f)
            if not raw:
                return None
            return {eco: _OpeningNode(**node) for eco, node in raw.items()}
        except Exception as exc:
            logger.warning("Disk cache load failed %s_%s_%s: %s", rating, speed, month, exc)
            return None

    def _disk_cache_save(
        self, rating: int, speed: str, openings: Dict[str, _OpeningNode]
    ) -> None:
        if not openings:
            return
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            path = self._disk_cache_path(rating, speed)
            payload = {eco: asdict(node) for eco, node in openings.items()}
            with path.open("w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            logger.info("Disk cache saved: %s", path)
        except Exception as exc:
            logger.warning("Disk cache save failed %s_%s_%s: %s", rating, speed, month, exc)

    # ─────────────────────────────────────────────────
    # 카탈로그 기반 병렬 탐색 (Primary)
    # ─────────────────────────────────────────────────

    async def _catalog_explore(
        self, rating: int, speed: str
    ) -> Dict[str, _OpeningNode]:
        """OPENINGS_CATALOG 기반 FEN 생성 후 Lichess Explorer 병렬 조회.

        asyncio.Semaphore(MAX_CONCURRENT)로 동시 요청 수를 제한하며
        모든 카탈로그 항목을 asyncio.gather()로 병렬 처리합니다.
        """
        semaphore = asyncio.Semaphore(MAX_CONCURRENT)

        async def fetch_one(
            entry: OpeningEntry,
        ) -> Optional[Tuple[str, _OpeningNode]]:
            # python-chess로 UCI 수 목록 → FEN 생성
            board = chess.Board()
            depth = len(entry["moves"])
            try:
                for uci in entry["moves"]:
                    board.push(chess.Move.from_uci(uci))
            except Exception as exc:
                logger.warning(
                    "Catalog FEN generation failed eco=%s: %s", entry["eco"], exc
                )
                return None

            fen = board.fen()

            async with semaphore:
                await asyncio.sleep(CATALOG_REQUEST_DELAY)
                data = await self._fetch_position(fen, rating, speed)

            if not data:
                return None

            # Lichess opening 정보 우선, 없으면 카탈로그 메타 사용
            opening_info = data.get("opening") or {}
            eco = opening_info.get("eco") or entry["eco"]
            name = opening_info.get("name") or entry["name"]

            white_wins = data.get("white", 0)
            draws = data.get("draws", 0)
            black_wins = data.get("black", 0)
            total = white_wins + draws + black_wins

            if total < MIN_GAMES:
                return None

            return (
                eco,
                _OpeningNode(
                    eco=eco,
                    name=name,
                    white_wins=white_wins,
                    draws=draws,
                    black_wins=black_wins,
                    depth=depth,
                    moves=entry["moves"],
                ),
            )

        tasks = [fetch_one(entry) for entry in OPENINGS_CATALOG]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        openings: Dict[str, _OpeningNode] = {}
        for result in results:
            if isinstance(result, Exception) or result is None:
                continue
            eco, node = result
            # 동일 ECO는 더 깊은(구체적인) 변형 우선
            if eco not in openings or node.depth > openings[eco].depth:
                openings[eco] = node

        logger.info(
            "Catalog explore done: %d openings (rating=%s speed=%s)",
            len(openings), rating, speed,
        )
        return openings

    # ─────────────────────────────────────────────────
    # BFS 탐색 (Fallback)
    # ─────────────────────────────────────────────────

    async def _bfs_explore(
        self, rating: int, speed: str
    ) -> Dict[str, _OpeningNode]:
        """Lichess Explorer API를 BFS로 탐색 (카탈로그 부족 시 폴백)."""
        board = chess.Board()
        queue: deque[Tuple[chess.Board, int]] = deque([(board, 0)])
        visited: set[str] = set()
        openings: Dict[str, _OpeningNode] = {}
        node_count = 0

        while queue and node_count < MAX_NODES:
            current_board, depth = queue.popleft()

            fen = current_board.fen()
            fen_key = " ".join(fen.split()[:4])
            if fen_key in visited or depth > MAX_DEPTH:
                continue
            visited.add(fen_key)

            await asyncio.sleep(REQUEST_DELAY)
            data = await self._fetch_position(fen, rating, speed)
            if not data:
                logger.warning(
                    "_fetch_position no data: fen=%s rating=%s speed=%s",
                    fen, rating, speed,
                )
                if node_count == 0 and depth == 0:
                    raise RuntimeError(
                        "failed to fetch initial opening data from Lichess Explorer"
                    )
                continue

            node_count += 1

            opening_info = data.get("opening")
            if opening_info:
                eco = opening_info.get("eco", "")
                name = opening_info.get("name", "")
                if eco and name:
                    white_wins = data.get("white", 0)
                    draws = data.get("draws", 0)
                    black_wins = data.get("black", 0)
                    total = white_wins + draws + black_wins
                    if total >= MIN_GAMES:
                        if eco not in openings or depth > openings[eco].depth:
                            openings[eco] = _OpeningNode(
                                eco=eco,
                                name=name,
                                white_wins=white_wins,
                                draws=draws,
                                black_wins=black_wins,
                                depth=depth,
                            )

            if depth < MAX_DEPTH:
                moves = data.get("moves", [])
                moves.sort(
                    key=lambda m: (
                        m.get("white", 0) + m.get("draws", 0) + m.get("black", 0)
                    ),
                    reverse=True,
                )
                for move_data in moves[:TOP_N_MOVES]:
                    total = (
                        move_data.get("white", 0)
                        + move_data.get("draws", 0)
                        + move_data.get("black", 0)
                    )
                    if total < MIN_GAMES:
                        continue
                    uci = move_data.get("uci", "")
                    if not uci:
                        continue
                    try:
                        move = chess.Move.from_uci(uci)
                        new_board = current_board.copy()
                        new_board.push(move)
                        queue.append((new_board, depth + 1))
                    except Exception:
                        continue

        return openings

    # ─────────────────────────────────────────────────
    # Lichess Explorer API 단건 호출
    # ─────────────────────────────────────────────────

    async def _fetch_position(
        self, fen: str, rating: int, speed: str
    ) -> Optional[Dict[str, Any]]:
        speed_val = SPEED_MAP.get(speed, speed)
        fen_encoded = urllib.parse.quote(fen, safe="")
        url = (
            f"{EXPLORER_URL}?"
            f"fen={fen_encoded}"
            f"&ratings[]={rating}"
            f"&speeds[]={speed_val}"
            f"&moves={TOP_N_MOVES}"
            f"&topGames=0&recentGames=0"
        )
        try:
            headers = {"Accept": "application/json"}
            if settings.LICHESS_API_TOKEN:
                headers["Authorization"] = f"Bearer {settings.LICHESS_API_TOKEN}"
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                return resp.json()
        except Exception as err:
            logger.error("Lichess Explorer failed url=%s exc=%s", url, err)
            return None

    # ─────────────────────────────────────────────────
    # 티어 배정 (Z-score 기반)
    # ─────────────────────────────────────────────────

    def _assign_tiers(
        self, openings: Dict[str, _OpeningNode], color: str
    ) -> List[Dict[str, Any]]:
        if not openings:
            return []

        scored: List[Tuple[str, float, _OpeningNode]] = []
        for eco, node in openings.items():
            total = node.white_wins + node.draws + node.black_wins
            if total == 0:
                continue
            if color == "white":
                score = (node.white_wins + 0.5 * node.draws) / total
            else:
                score = (node.black_wins + 0.5 * node.draws) / total
            scored.append((eco, score, node))

        if not scored:
            return []

        values = [s[1] for s in scored]
        mean = statistics.mean(values)
        stdev = statistics.stdev(values) if len(values) > 1 else 1.0

        result = []
        for eco, score, node in scored:
            z = (score - mean) / stdev if stdev > 0 else 0.0
            total = node.white_wins + node.draws + node.black_wins
            win_rate = (
                node.white_wins if color == "white" else node.black_wins
            ) / total
            draw_rate = node.draws / total
            result.append(
                {
                    "eco": eco,
                    "name": node.name,
                    "tier": self._z_to_tier(z),
                    "white_wins": node.white_wins,
                    "draws": node.draws,
                    "black_wins": node.black_wins,
                    "total_games": total,
                    "win_rate": round(win_rate, 4),
                    "draw_rate": round(draw_rate, 4),
                    "tier_score": round(score, 4),
                    "moves": node.moves,
                }
            )

        result.sort(key=lambda x: x["tier_score"], reverse=True)
        return result

    @staticmethod
    def _z_to_tier(z: float) -> Tier:
        if z >= 1.5:
            return Tier.S
        if z >= 0.5:
            return Tier.A
        if z >= -0.5:
            return Tier.B
        if z >= -1.5:
            return Tier.C
        return Tier.D
