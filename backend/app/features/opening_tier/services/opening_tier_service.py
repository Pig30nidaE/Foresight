"""
오프닝 티어 산정 서비스
=======================
카탈로그 기반으로 Lichess Explorer API를 병렬 탐색하여 오프닝별 통계를 수집하고
Z-score 기반 S/A/B/C/D 티어를 배정합니다.

탐색 전략:
    1. OPENINGS_CATALOG의 각 오프닝에 대해 python-chess로 FEN을 생성
    2. asyncio.Semaphore로 동시 요청 수를 제한하며 병렬 API 호출
    3. 카탈로그 탐색으로 오프닝별 통계를 수집
    4. 충분하지 않으면 BFS 폴백으로 보완

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
from collections import deque
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import math

import chess
import httpx

from app.core.config import settings
from app.features.opening_tier.openings_catalog import OPENINGS_CATALOG, OpeningEntry
from app.models.schemas import RatingBracket, Tier

logger = logging.getLogger(__name__)

# ── Lichess Explorer 설정 ────────────────────────────────────────────
EXPLORER_URL = "https://explorer.lichess.org/lichess"
TOP_N_MOVES = 5
MIN_GAMES = 300
REQUEST_DELAY = 0.5          # BFS 단건 요청 간격 (초)
CATALOG_REQUEST_DELAY = 0.3  # 카탈로그 병렬 요청 슬롯 내 딜레이 (초)
MAX_CONCURRENT = 3           # 동시 API 요청 최대 수
MAX_DEPTH = 10
MAX_NODES = 200
MIN_CATALOG_RESULTS = 10     # 이보다 적으면 BFS 폴백

# ── 티어 점수 가중치 ───────────────────────────────────────────────
SCORING_PRIOR = 600    # 베이지안 평활화 강도
WIN_WEIGHT    = 0.5    # 승률 성분(상대적 퍼포먼스) 가중치
POP_WEIGHT    = 0.5    # 인기도(로그 정규화 게임 수) 가중치
PICK_RATE_THRESHOLD = 0.02  # 픽률 2% 이상이면 인기도 가산점 최대 적용
MIN_PICK_RATE = 0.01        # 온라인 매칭 표본의 1% 미만 변형은 "데이터 부족"으로 제외
MIN_TIER_DEPTH = 3     # 최소 수(half-move) — 이보다 얕은 범용 포지션 제외
POP_DEPTH_TARGET = 5   # 이 depth 이상이면 인기도 패널티 없음

# ── 레이팅 구간 (Lichess Explorer 실제 제공 bucket) ───────────────────
RATING_BRACKETS = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]

# 사용자 표시 라벨: 실제 요청 bucket 값을 그대로 노출
_BRACKET_DISPLAY: Dict[int, str] = {
    1000: "1000",
    1200: "1200",
    1400: "1400",
    1600: "1600",
    1800: "1800",
    2000: "2000",
    2200: "2200",
    2500: "2500",
}

# Lichess Explorer API 유효 rating bucket ID:
# 400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500
# (2400 등은 무효 — 실제 존재하는 ID만 사용)
_LICHESS_RATINGS_PARAMS: Dict[int, List[int]] = {
    1000: [1000],
    1200: [1200],
    1400: [1400],
    1600: [1600],
    1800: [1800],
    2000: [2000],
    2200: [2200],
    2500: [2500],
}

SPEED_MAP: Dict[str, str] = {
    "bullet":    "bullet",
    "blitz":     "blitz",
    "rapid":     "rapid",
    "classical": "classical",
}

# ── 데이터 기간 설정 ─────────────────────────────────────────────────
# 전날 기준 최근 1개월(30일) 유지

# ── 캐시 (자정 일괄 갱신) ─────────────────────────────────────────────
_SPEEDS = ("bullet", "blitz", "rapid", "classical")

# backend/data/opening_tier_cache/
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
_LATEST_CACHE_PATH = CACHE_DIR / "opening_tier_latest.json"
_CACHE_STAMP_FORMAT = "%Y-%m-%d"


def _date_str(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def _compute_date_range() -> Tuple[str, str]:
    """기준 시점에서 '전달 1일~말일' 구간을 반환합니다."""
    today = datetime.now(UTC).date()
    first_day_this_month = today.replace(day=1)
    last_day_prev_month = first_day_this_month - timedelta(days=1)
    first_day_prev_month = last_day_prev_month.replace(day=1)
    return _date_str(first_day_prev_month), _date_str(last_day_prev_month)


def _to_explorer_month(value: str) -> str:
    """YYYY-MM-DD 또는 YYYY-MM을 Explorer 호환 YYYY-MM으로 정규화."""
    t = value.strip()
    if len(t) >= 7:
        return t[:7]
    return t


def _prev_month(ym: str) -> str:
    year = int(ym[:4])
    month = int(ym[5:7])
    if month == 1:
        return f"{year - 1:04d}-12"
    return f"{year:04d}-{month - 1:02d}"


@dataclass
class _OpeningNode:
    eco: str
    name: str
    opening_side: str
    white_wins: int
    draws: int
    black_wins: int
    depth: int
    moves: Optional[List[str]] = None


_WHITE_OPENING_RANGES: List[Tuple[str, int, int]] = [
    ("A", 0, 3),
    ("A", 4, 9),
    ("A", 10, 39),
    ("A", 45, 46),
    ("C", 20, 24),
    ("C", 25, 29),
    ("C", 30, 39),
    ("C", 44, 49),
    ("C", 50, 54),
    ("C", 60, 99),
    ("D", 0, 5),
    ("E", 0, 9),
]

_BLACK_OPENING_RANGES: List[Tuple[str, int, int]] = [
    ("A", 40, 44),
    ("A", 47, 49),
    ("A", 50, 79),
    ("A", 80, 99),
    ("B", 0, 5),
    ("B", 6, 9),
    ("B", 10, 19),
    ("B", 20, 99),
    ("C", 0, 19),
    ("C", 40, 43),
    ("C", 55, 59),
    ("D", 6, 9),
    ("D", 10, 19),
    ("D", 20, 29),
    ("D", 30, 69),
    ("D", 70, 99),
    ("E", 10, 19),
    ("E", 20, 59),
    ("E", 60, 99),
]


def _infer_opening_side_by_eco(eco: str, _name: str, moves: Optional[List[str]], depth: int) -> str:
    """ECO 코드 대역 기반으로 오프닝 기준 색상 추론.

    우선순위:
      1) WHITE 대역 매칭
      2) BLACK 대역 매칭
      3) 폴백: parity (대역 외 코드 안전 처리)
    """
    code = (eco or "").strip().upper()
    if len(code) >= 3 and code[0].isalpha() and code[1:3].isdigit():
        letter = code[0]
        num = int(code[1:3])
        for l, lo, hi in _WHITE_OPENING_RANGES:
            if letter == l and lo <= num <= hi:
                return "white"
        for l, lo, hi in _BLACK_OPENING_RANGES:
            if letter == l and lo <= num <= hi:
                return "black"

    ply = len(moves) if moves else max(depth, 0)
    return "white" if ply % 2 == 1 else "black"


# 캐시 로직 버전: 로직 변경 시 기존 캐시는 무시하고 새로 생성합니다.
CACHE_LOGIC_VERSION = 7


def _display_label(bracket_key: int) -> str:
    """실제 Lichess bucket 표시 라벨 반환."""
    return _BRACKET_DISPLAY[bracket_key]


class OpeningTierService:
    def __init__(self) -> None:
        # NOTE: asyncio primitives are created lazily (first time called in async context).
        self._tier_cache: Optional[Dict[str, List[Dict[str, Any]]]] = None
        self._cache_since: Optional[str] = None
        self._cache_until: Optional[str] = None
        self._cache_stamp: Optional[str] = None
        self._cache_ready: Optional[asyncio.Event] = None
        self._refresh_lock: Optional[asyncio.Lock] = None
        self._scheduler_task: Optional[asyncio.Task] = None
        self._opening_fetch_memo: Dict[str, Dict[str, Any]] = {}
        # rating|speed 단위 롤링 집계(색상 구분 전)
        self._rolling_openings: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._rolling_window_start: Optional[str] = None
        self._rolling_window_end: Optional[str] = None

    def _cache_key(self, rating: int, speed: str, color: str) -> str:
        return f"{rating}|{speed}|{color}"

    def _rolling_key(self, rating: int, speed: str) -> str:
        return f"{rating}|{speed}"

    def _current_stamp(self) -> str:
        """캐시 스탬프: UTC 기준 '오늘' 날짜 (YYYY-MM-DD)."""
        return datetime.now(UTC).strftime(_CACHE_STAMP_FORMAT)

    async def _ensure_async_primitives(self) -> None:
        if self._tier_cache is None:
            self._tier_cache = {}
        if self._cache_ready is None:
            self._cache_ready = asyncio.Event()
            self._cache_ready.clear()
        if self._refresh_lock is None:
            self._refresh_lock = asyncio.Lock()

    async def load_cache_from_disk_if_valid(self) -> bool:
        """디스크 캐시를 로드합니다.

        규칙:
          - logic_version 이 일치하고 items/since/until 이 있으면 로드
          - stamp 날짜가 오늘이 아니어도 재사용 (자정 갱신 전까지 유지)
          - 없거나 손상되었을 때만 미로드 상태로 둠
        """
        await self._ensure_async_primitives()
        assert self._cache_ready is not None

        if not _LATEST_CACHE_PATH.exists():
            return False

        try:
            raw = json.loads(_LATEST_CACHE_PATH.read_text(encoding="utf-8"))
            if raw.get("logic_version") != CACHE_LOGIC_VERSION:
                return False
            items: Dict[str, List[Dict[str, Any]]] = raw.get("items", {})
            since = raw.get("since")
            until = raw.get("until")
            stamp = raw.get("stamp")
            rolling_openings: Dict[str, Dict[str, Dict[str, Any]]] = raw.get("rolling_openings", {})
            if not since or not until or not stamp or not items:
                return False

            self._tier_cache = items
            self._cache_since = since
            self._cache_until = until
            self._cache_stamp = stamp
            self._rolling_openings = rolling_openings or {}
            self._rolling_window_start = since
            self._rolling_window_end = until
            self._cache_ready.set()
            logger.info("Opening tier cache loaded from disk (stamp=%s)", stamp)
            return True
        except Exception as exc:
            logger.warning("Opening tier cache load failed: %s", exc)
            return False

    def _persist_cache_snapshot(self) -> None:
        """현재 메모리 캐시를 latest 파일에 저장합니다 (best-effort)."""
        if (
            self._tier_cache is None
            or not self._tier_cache
            or not self._cache_since
            or not self._cache_until
            or not self._cache_stamp
        ):
            return
        payload = {
            "logic_version": CACHE_LOGIC_VERSION,
            "stamp": self._cache_stamp,
            "since": self._cache_since,
            "until": self._cache_until,
            "items": self._tier_cache,
            "rolling_openings": self._rolling_openings,
        }
        _LATEST_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = _LATEST_CACHE_PATH.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_path.replace(_LATEST_CACHE_PATH)

    def start_midnight_cache_refresher(self) -> None:
        """매월 1일 UTC 00:00에 전달 데이터로 캐시를 일괄 재계산합니다."""
        if self._scheduler_task is not None:
            return

        async def loop() -> None:
            while True:
                try:
                    now = datetime.now(UTC)
                    if now.month == 12:
                        next_month_start = now.replace(
                            year=now.year + 1,
                            month=1,
                            day=1,
                            hour=0,
                            minute=0,
                            second=0,
                            microsecond=0,
                        )
                    else:
                        next_month_start = now.replace(
                            month=now.month + 1,
                            day=1,
                            hour=0,
                            minute=0,
                            second=0,
                            microsecond=0,
                        )
                    sleep_s = (next_month_start - now).total_seconds()
                    logger.info(
                        "Opening tier cache: next monthly refresh at %s UTC",
                        next_month_start.strftime(_CACHE_STAMP_FORMAT),
                    )
                    await asyncio.sleep(max(sleep_s, 0))
                    await self.refresh_cache_for_all()
                except asyncio.CancelledError:
                    return
                except Exception as exc:
                    logger.exception("Opening tier cache refresh loop error: %s", exc)

        self._scheduler_task = asyncio.create_task(loop())

    def stop_midnight_cache_refresher(self) -> None:
        if self._scheduler_task is not None:
            self._scheduler_task.cancel()
            self._scheduler_task = None

    # ─────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────

    def is_cache_ready_for(self, rating: int, speed: str, color: str) -> bool:
        if not self._tier_cache:
            return False
        return self._cache_key(rating, speed, color) in self._tier_cache

    @staticmethod
    def _node_to_dict(node: _OpeningNode) -> Dict[str, Any]:
        return {
            "eco": node.eco,
            "name": node.name,
            "opening_side": node.opening_side,
            "white_wins": node.white_wins,
            "draws": node.draws,
            "black_wins": node.black_wins,
            "depth": node.depth,
            "moves": node.moves,
        }

    @staticmethod
    def _dict_to_node(d: Dict[str, Any]) -> _OpeningNode:
        return _OpeningNode(
            eco=str(d.get("eco", "")),
            name=str(d.get("name", "")),
            opening_side=str(d.get("opening_side", "white")),
            white_wins=int(d.get("white_wins", 0)),
            draws=int(d.get("draws", 0)),
            black_wins=int(d.get("black_wins", 0)),
            depth=int(d.get("depth", 0)),
            moves=d.get("moves"),
        )

    def _merge_openings(
        self,
        base: Dict[str, _OpeningNode],
        delta: Dict[str, _OpeningNode],
        *,
        sign: int,
    ) -> Dict[str, _OpeningNode]:
        merged = {k: _OpeningNode(**self._node_to_dict(v)) for k, v in base.items()}
        for eco, node in delta.items():
            if eco not in merged:
                if sign > 0:
                    merged[eco] = _OpeningNode(**self._node_to_dict(node))
                continue
            cur = merged[eco]
            cur.white_wins += sign * node.white_wins
            cur.draws += sign * node.draws
            cur.black_wins += sign * node.black_wins
            cur.depth = max(cur.depth, node.depth)
            if cur.moves is None and node.moves is not None:
                cur.moves = node.moves
            total = cur.white_wins + cur.draws + cur.black_wins
            if total <= 0:
                del merged[eco]
        return merged

    async def get_opening_tiers(
        self, rating: int, speed: str, color: str, *, allow_fetch_if_missing: bool = False
    ) -> Tuple[List[Dict[str, Any]], str, str]:
        """오프닝 티어 목록, 데이터 기간, 마지막 수집일(YYYY-MM-DD) 반환.

        캐시가 로드된 경우에는 캐시에서 반환하고,
        캐시가 없는 경우(서버 시작 직후/첫 자정 전 등)에는 요청 시점에만 탐색합니다.
        """
        await self._ensure_async_primitives()

        stamp = self._current_stamp()

        assert self._cache_ready is not None
        if self._cache_ready.is_set() and self._tier_cache is not None:
            key = self._cache_key(rating, speed, color)
            cached = self._tier_cache.get(key)
            if cached is not None and self._cache_since and self._cache_until:
                return (
                    cached,
                    f"{self._cache_since} ~ {self._cache_until}",
                    self._cache_stamp or stamp,
                )

        if not allow_fetch_if_missing:
            raise RuntimeError("warming")

        since, until = _compute_date_range()
        openings = await self._fetch_openings(rating, speed, since=since, until=until)
        tiers = self._assign_tiers(openings, color)

        # 캐시 파일이 없던 시작 케이스도 포함해, 요청 결과는 메모리/디스크에 재사용 가능하게 적재합니다.
        assert self._tier_cache is not None
        self._tier_cache[self._cache_key(rating, speed, color)] = tiers
        rk = self._rolling_key(rating, speed)
        self._rolling_openings[rk] = {
            eco: self._node_to_dict(node) for eco, node in openings.items()
        }
        self._rolling_window_start = since
        self._rolling_window_end = until
        if self._cache_since is None:
            self._cache_since = since
            self._cache_until = until
        if self._cache_stamp is None:
            self._cache_stamp = stamp
        if not self._cache_ready.is_set():
            self._cache_ready.set()
        try:
            self._persist_cache_snapshot()
        except Exception as exc:
            logger.warning("Opening tier cache persist skipped: %s", exc)
        return tiers, f"{since} ~ {until}", stamp

    async def wait_until_cache_ready(self, timeout_seconds: float = 120.0) -> bool:
        """캐시 준비 완료를 timeout 까지 대기합니다.

        Returns:
            bool: timeout 내 준비 완료 시 True, 아니면 False
        """
        await self._ensure_async_primitives()
        assert self._cache_ready is not None
        if self._cache_ready.is_set():
            return True
        try:
            await asyncio.wait_for(self._cache_ready.wait(), timeout=timeout_seconds)
            return True
        except TimeoutError:
            return False

    def get_bracket_labels(self, speed: str) -> List[RatingBracket]:  # noqa: ARG002
        """레이팅 구간 목록 반환 (Chess.com 기준 라벨)."""
        result = []
        for bracket_key in RATING_BRACKETS:
            label = _display_label(bracket_key)
            result.append(
                RatingBracket(
                    lichess_rating=bracket_key,
                    chesscom_rating=bracket_key,
                    label_lichess=label,
                    label_chesscom=label,
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
            f"generated={datetime.now(UTC).isoformat().replace('+00:00', 'Z')}\n"
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
            "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "openings": openings_data,
        }
        return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    async def refresh_cache_for_all(
        self,
        ratings: Optional[List[int]] = None,
        speeds: Optional[List[str]] = None,
        colors: Optional[List[str]] = None,
    ) -> str:
        """매월 1일, 전달(1일~말일) 구간으로 전체 오프닝 티어 캐시를 갱신합니다."""
        await self._ensure_async_primitives()
        assert self._refresh_lock is not None

        async with self._refresh_lock:
            assert self._cache_ready is not None

            stamp = self._current_stamp()
            since, until = _compute_date_range()

            if ratings is None:
                ratings = list(RATING_BRACKETS)
            if speeds is None:
                speeds = list(_SPEEDS)
            if colors is None:
                colors = ["white", "black"]

            self._opening_fetch_memo.clear()
            new_items: Dict[str, List[Dict[str, Any]]] = {}
            # 월 단위(전달 전체) 집계로 전환되어 매번 전체 재수집합니다.
            self._rolling_openings = {}
            for rating in ratings:
                for speed in speeds:
                    openings = await self._fetch_openings(
                        rating, speed, since=since, until=until, min_games=MIN_GAMES
                    )
                    rk = self._rolling_key(rating, speed)
                    self._rolling_openings[rk] = {
                        eco: self._node_to_dict(node) for eco, node in openings.items()
                    }
                    for color in colors:
                        tiers = self._assign_tiers(openings, color)
                        new_items[self._cache_key(rating, speed, color)] = tiers
            self._rolling_window_start = since
            self._rolling_window_end = until

            payload = {
                "logic_version": CACHE_LOGIC_VERSION,
                "stamp": stamp,
                "since": self._rolling_window_start or since,
                "until": self._rolling_window_end or until,
                "items": new_items,
                "rolling_openings": self._rolling_openings,
            }
            _LATEST_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)

            # atomic-ish write: temp -> replace
            tmp_path = _LATEST_CACHE_PATH.with_suffix(".tmp")
            tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp_path.replace(_LATEST_CACHE_PATH)

            self._tier_cache = new_items
            self._cache_since = self._rolling_window_start or since
            self._cache_until = self._rolling_window_end or until
            self._cache_stamp = stamp
            self._cache_ready.set()
            return stamp

    async def _fetch_openings(
        self,
        rating: int,
        speed: str,
        since: Optional[str] = None,
        until: Optional[str] = None,
        min_games: int = MIN_GAMES,
    ) -> Dict[str, "_OpeningNode"]:
        if since is None or until is None:
            since, until = _compute_date_range()
        # 1. 카탈로그 기반 병렬 탐색 (Primary)
        openings = await self._catalog_explore(rating, speed, since, until, min_games=min_games)

        # 2. BFS 폴백 (카탈로그 결과 부족 시)
        if len(openings) < MIN_CATALOG_RESULTS:
            logger.warning(
                "Catalog returned %d entries for rating=%s speed=%s, falling back to BFS",
                len(openings), rating, speed,
            )
            bfs_openings = await self._bfs_explore(rating, speed, since, until, min_games=min_games)
            for eco, node in bfs_openings.items():
                if eco not in openings or node.depth > openings[eco].depth:
                    openings[eco] = node
        return openings

    # ─────────────────────────────────────────────────
    # 카탈로그 기반 병렬 탐색 (Primary)
    # ─────────────────────────────────────────────────

    async def _catalog_explore(
        self, rating: int, speed: str, since: str, until: str, *, min_games: int = MIN_GAMES
    ) -> Dict[str, "_OpeningNode"]:
        """OPENINGS_CATALOG 기반 FEN 생성 후 Lichess Explorer 병렬 조회.

        asyncio.Semaphore(MAX_CONCURRENT)로 동시 요청 수를 제한하며
        모든 카탈로그 항목을 asyncio.gather()로 병렬 처리합니다.
        """
        semaphore = asyncio.Semaphore(MAX_CONCURRENT)

        async def fetch_one(
            entry: OpeningEntry,
        ) -> Optional[Tuple[str, "_OpeningNode"]]:
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
                data = await self._fetch_position(fen, rating, speed, since, until)

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

            if total < min_games:
                return None

            return (
                eco,
                _OpeningNode(
                    eco=eco,
                    name=name,
                    # 색 분류는 응답 이름(Attack/Defense 규칙) + 예외 ECO 하드코딩을 우선 적용합니다.
                    opening_side=_infer_opening_side_by_eco(eco, name, entry["moves"], depth),
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
        self, rating: int, speed: str, since: str, until: str, *, min_games: int = MIN_GAMES
    ) -> Dict[str, "_OpeningNode"]:
        """Lichess Explorer API를 BFS로 탐색 (카탈로그 부족 시 폴백)."""
        board = chess.Board()
        queue: deque[Tuple[chess.Board, int]] = deque([(board, 0)])
        visited: set[str] = set()
        openings: Dict[str, "_OpeningNode"] = {}
        node_count = 0

        while queue and node_count < MAX_NODES:
            current_board, depth = queue.popleft()

            fen = current_board.fen()
            fen_key = " ".join(fen.split()[:4])
            if fen_key in visited or depth > MAX_DEPTH:
                continue
            visited.add(fen_key)

            await asyncio.sleep(REQUEST_DELAY)
            data = await self._fetch_position(fen, rating, speed, since, until)
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
                    if total >= min_games:
                        if eco not in openings or depth > openings[eco].depth:
                            openings[eco] = _OpeningNode(
                                eco=eco,
                                name=name,
                                opening_side=_infer_opening_side_by_eco(eco, name, None, depth),
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
                    if total < min_games:
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
        self, fen: str, rating: int, speed: str, since: str, until: str
    ) -> Optional[Dict[str, Any]]:
        """레이팅 구간에 해당하는 Lichess bucket ID들을 단일 요청으로 전송합니다.

        Lichess Explorer API의 ratings 파라미터는 쉼표로 구분된 단일 문자열이어야 합니다.
        예: ratings=1200,1400  (NO brackets, NO repeated params)
        """
        lichess_ids = _LICHESS_RATINGS_PARAMS.get(rating, [rating])
        ratings_str = ",".join(str(r) for r in lichess_ids)
        return await self._fetch_single(fen, ratings_str, speed, since, until)

    async def _fetch_single(
        self, fen: str, ratings_str: str, speed: str, since: str, until: str
    ) -> Optional[Dict[str, Any]]:
        """Lichess Explorer API 단건 호출.

        Lichess lila-openingexplorer 소스 확인:
          ratings: StringWithSeparator<CommaSeparator, RatingGroup>
          speeds:  StringWithSeparator<CommaSeparator, Speed>
        → 배열 파라미터(ratings[], speeds[]) 아닌 쉼표 구분 단일 문자열로 전달해야 합니다.
        예: ratings=1200,1400&speeds=blitz
        """
        speed_val = SPEED_MAP.get(speed, speed)
        since_month = _to_explorer_month(since)
        until_month = _to_explorer_month(until)
        current_month = datetime.now(UTC).strftime("%Y-%m")
        # Lichess Explorer 는 현재 진행 중인 월에서 불안정/오류가 발생할 수 있어
        # 지난 달까지만 고정합니다.
        if until_month >= current_month:
            until_month = _prev_month(current_month)
        if since_month > until_month:
            since_month = until_month
        # 쉼표 구분 단일 파라미터 (NO [] brackets)
        params = [
            ("fen", fen),
            ("ratings", ratings_str),
            ("speeds", speed_val),
            ("moves", TOP_N_MOVES),
            ("topGames", 0),
            ("recentGames", 0),
            ("since", since_month),
            ("until", until_month),
        ]
        memo_key = f"{fen}|{ratings_str}|{speed_val}|{since_month}|{until_month}"
        if memo_key in self._opening_fetch_memo:
            return self._opening_fetch_memo[memo_key]
        try:
            # explorer.lichess.org/lichess 는 인증이 필요한 엔드포인트입니다.
            # (Lichess 정책 변경으로 익명 요청도 401 반환)
            ua = (
                settings.LICHESS_USER_AGENT.strip()
                or f"{settings.PROJECT_NAME}/1.0 (lichess opening explorer)"
            )
            headers = {"Accept": "application/json", "User-Agent": ua}
            if settings.LICHESS_API_TOKEN:
                headers["Authorization"] = f"Bearer {settings.LICHESS_API_TOKEN}"
            async with httpx.AsyncClient(timeout=10.0) as client:
                last_exc: Exception | None = None
                for attempt in range(3):
                    try:
                        resp = await client.get(EXPLORER_URL, params=params, headers=headers)
                        resp.raise_for_status()
                        data = resp.json()
                        self._opening_fetch_memo[memo_key] = data
                        return data
                    except Exception as exc:
                        last_exc = exc
                        if attempt < 2:
                            await asyncio.sleep(0.35 * (attempt + 1))
                if last_exc:
                    raise last_exc
        except Exception as err:
            logger.error("Lichess Explorer failed ratings=%s speed=%s exc=%s", ratings_str, speed_val, err)
            return None

    # ─────────────────────────────────────────────────
    # 티어 배정 (Z-score 기반)
    # ─────────────────────────────────────────────────

    @staticmethod
    def _remove_parent_entries(
        openings: Dict[str, "_OpeningNode"],
    ) -> Dict[str, "_OpeningNode"]:
        """moves 시퀀스가 다른 항목의 prefix인 부모 항목을 제거합니다.

        체스 오프닝에서 포지션 A의 moves 가 포지션 B moves 의 앞부분이면,
        A는 B를 포함하는 슈퍼셋이므로 게임 수가 이중 계산됩니다.

        예시:
          D06 'Queen's Gambit'  moves=[d4,d5,c4]       ← D20·D30의 prefix → 제거
          D20 'QGA'             moves=[d4,d5,c4,dxc4]  ← 독립 유지
          D30 'QGD'             moves=[d4,d5,c4,e6]    ← 독립 유지
          (QGA ≠ QGD: 서로 다른 수순이므로 별개 항목으로 취급)

          C60 'Ruy Lopez'       moves=[e4,e5,Nf3,Nc6,Bb5]        ← C65의 prefix → 제거
          C65 'Berlin Defense'  moves=[..., Nf6]                  ← 독립 유지
        """
        move_seqs = {
            eco: tuple(node.moves) if node.moves else ()
            for eco, node in openings.items()
        }

        def is_prefix_of_another(eco: str, seq: tuple) -> bool:
            if not seq:
                return False
            for other_eco, other_seq in move_seqs.items():
                if other_eco != eco and len(other_seq) > len(seq) and other_seq[: len(seq)] == seq:
                    return True
            return False

        return {
            eco: node
            for eco, node in openings.items()
            if not is_prefix_of_another(eco, move_seqs[eco])
        }

    def _assign_tiers(
        self, openings: Dict[str, _OpeningNode], color: str
    ) -> List[Dict[str, Any]]:
        if not openings:
            return []

        openings = self._remove_parent_entries(openings)

        # 요청 색상과 오프닝 기준 색상이 일치하는 항목만 유지
        openings = {
            eco: node
            for eco, node in openings.items()
            if node.opening_side == color
        }
        if not openings:
            return []

        # 0단계: 너무 얕은(범용) 포지션 제거 — 1.e4처럼 모든 게임을 포함하는 항목 배제
        openings = {
            eco: node
            for eco, node in openings.items()
            if node.depth >= MIN_TIER_DEPTH
        }
        if not openings:
            return []

        # 1단계: 인기도 정규화용 전체 최댓값 + 전체 게임 합산
        max_total = max(
            (n.white_wins + n.draws + n.black_wins for n in openings.values()),
            default=1,
        )
        max_total = max(max_total, 1)

        # 1b: 전체 게임 수 합산 (픽률 계산용)
        total_all_games = sum(
            n.white_wins + n.draws + n.black_wins
            for n in openings.values()
        )
        total_all_games = max(total_all_games, 1)

        # 1c: 색깔 평균 승률 (픽률 가중 평균) — relative performance 기준점
        total_all_wins = 0.0
        for node in openings.values():
            tot = node.white_wins + node.draws + node.black_wins
            if tot == 0:
                continue
            if color == "white":
                total_all_wins += node.white_wins + 0.5 * node.draws
            else:
                total_all_wins += node.black_wins + 0.5 * node.draws
        avg_win_rate = total_all_wins / total_all_games

        # 2단계: 복합 점수 계산
        # score = WIN_WEIGHT × (오프닝 승률 - 색깔 평균 승률)
        #       + POP_WEIGHT × log 인기도 × 픽률 보정
        scored: List[Tuple[str, float, _OpeningNode, bool]] = []
        for eco, node in openings.items():
            total = node.white_wins + node.draws + node.black_wins
            if total == 0:
                continue
            if color == "white":
                win_component = node.white_wins + 0.5 * node.draws
            else:
                win_component = node.black_wins + 0.5 * node.draws

            # 베이지안 평활화된 승률: 게임 수 적을수록 50%로 수렴
            smoothed_win = (win_component + SCORING_PRIOR * 0.5) / (total + SCORING_PRIOR)

            # 상대적 퍼포먼스: 이 오프닝이 평균 대비 얼마나 더 이기는가
            relative_perf = smoothed_win - avg_win_rate

            # 로그 인기도 × 깊이 보정: 얕은 오프닝일수록 인기도 패널티
            depth_factor = min(node.depth / POP_DEPTH_TARGET, 1.0)
            pop_score = (math.log1p(total) / math.log1p(max_total)) * depth_factor

            # 픽률 가중치: 전체의 2% 이상이면 최대, 미만이면 비례 감점
            pick_rate = total / total_all_games
            is_minor = pick_rate < MIN_PICK_RATE
            pick_bonus = 1.0 if pick_rate >= PICK_RATE_THRESHOLD else (pick_rate / PICK_RATE_THRESHOLD)

            score = WIN_WEIGHT * relative_perf + POP_WEIGHT * pop_score * pick_bonus
            scored.append((eco, score, node, is_minor))

        if not scored:
            return []

        values = [s[1] for s in scored]
        mean = statistics.mean(values)
        stdev = statistics.stdev(values) if len(values) > 1 else 1.0
        # Tier.S의 절대 z-임계값이 데이터 분포에 따라 너무 빡빡해질 때가 있어,
        # 점수(tier_score) 상위 비율을 S로 우선 배정해 S 출현 빈도를 높입니다.
        # (하드코딩 숫자 3~4가 아니라 "비율"로 범위를 늘립니다.)
        top_s_ratio = 0.065  # ~60개면 S가 대략 3~4개 수준
        n = len(scored)
        top_s_count = max(1, int(round(n * top_s_ratio)))

        scored_sorted = sorted(scored, key=lambda x: x[1], reverse=True)
        top_s_ecos = {eco for eco, _, _, _ in scored_sorted[:top_s_count]}

        result: List[Dict[str, Any]] = []
        for eco, score, node, is_minor in scored:
            z = (score - mean) / stdev if stdev > 0 else 0.0
            total = node.white_wins + node.draws + node.black_wins
            win_rate = (node.white_wins if color == "white" else node.black_wins) / total
            draw_rate = node.draws / total

            if eco in top_s_ecos:
                tier = Tier.S
            else:
                # S 제외하고 나머지 티어만 기존 z-range 기준으로 매핑
                if z >= 0.6:
                    tier = Tier.A
                elif z >= -0.6:
                    tier = Tier.B
                elif z >= -1.258:
                    tier = Tier.C
                else:
                    tier = Tier.D

            result.append(
                {
                    "eco": node.eco,
                    "name": node.name,
                    "tier": tier,
                    "white_wins": node.white_wins,
                    "draws": node.draws,
                    "black_wins": node.black_wins,
                    "total_games": total,
                    "win_rate": round(win_rate, 4),
                    "draw_rate": round(draw_rate, 4),
                    "tier_score": round(score, 4),
                    "moves": node.moves,
                    "is_minor": is_minor,
                }
            )

        result.sort(key=lambda x: x["tier_score"], reverse=True)
        return result

    @staticmethod
    def filter_openings(
        openings: List[Dict[str, Any]],
        q: str | None = None,
    ) -> List[Dict[str, Any]]:
        query = (q or "").strip().lower()
        if not query:
            return openings
        return [
            row
            for row in openings
            if query in str(row.get("name", "")).lower() or query in str(row.get("eco", "")).lower()
        ]

    @staticmethod
    def _z_to_tier(z: float) -> Tier:
        if z >= 1.258:   # 상위 ~3.6% → 60개 기준 약 2개
            return Tier.S
        if z >= 0.6:   # 상위 ~27%까지
            return Tier.A
        if z >= -0.6:  # 중간 ~45%
            return Tier.B
        if z >= -1.258:  # 하위권
            return Tier.C
        return Tier.D
