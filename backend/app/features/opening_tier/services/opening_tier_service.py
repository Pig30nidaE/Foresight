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
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
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
MIN_GAMES = 100
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
MIN_TIER_DEPTH = 3     # 최소 수(half-move) — 이보다 얕은 범용 포지션 제외
POP_DEPTH_TARGET = 5   # 이 depth 이상이면 인기도 패널티 없음

# ── 레이팅 구간 (opening.md 매핑, 5개 구간) ──────────────────────────
# 구간 키: Lichess API 조회에 사용할 대표 rating (낮은 값)
# 표시 라벨은 Chess.com 기준 (유저에게 친숙한 수치)
RATING_BRACKETS = [1000, 1400, 1800, 2200, 2500]

# Chess.com 기준 표시 구간 (lo, hi=None → 상한 없음)
_BRACKET_DISPLAY: Dict[int, Tuple[int, Optional[int]]] = {
    1000: (600,  800),    # 입문자 (Novice)
    1400: (1000, 1200),   # 초보자 (Beginner)
    1800: (1400, 1600),   # 중급자 (Intermediate)
    2200: (2000, 2200),   # 상급자 (Advanced)
    2500: (2400, None),   # 마스터 (Master)
}

# Lichess Explorer API 유효 rating bucket ID:
# 400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500
# (2400 등은 무효 — 실제 존재하는 ID만 사용)
_LICHESS_RATINGS_PARAMS: Dict[int, List[int]] = {
    1000: [1000, 1200],   # Lichess 1000–1200 → Chess.com 600–800
    1400: [1400, 1600],   # Lichess 1400–1600 → Chess.com 1000–1200
    1800: [1800, 2000],   # Lichess 1800–2000 → Chess.com 1400–1600
    2200: [2200],         # Lichess 2200      → Chess.com 2000–2200 (2400은 유효하지 않은 ID)
    2500: [2500],         # Lichess 2500+     → Chess.com 2400+
}

SPEED_MAP: Dict[str, str] = {
    "bullet":    "bullet",
    "blitz":     "blitz",
    "rapid":     "rapid",
    "classical": "classical",
}

# ── 캐시 설정 ─────────────────────────────────────────────────────────
CACHE_TTL = timedelta(days=30)
DATA_WINDOW_MONTHS = 6  # 최근 N개월 데이터만 사용

# 인메모리 캐시: (rating, speed, since, until) → (openings, timestamp)
_cache: Dict[Tuple[int, str, str, str], Tuple[Dict[str, "_OpeningNode"], datetime]] = {}


def _compute_date_range() -> Tuple[str, str]:
    """현재 시각 기준 DATA_WINDOW_MONTHS 전 ~ 지난 달 반환 (YYYY-MM).

    until 은 지난 달로 설정합니다. Lichess Explorer 는 현재 진행 중인 월은
    색인이 완료되지 않아 인증 없이 조회 시 401을 반환할 수 있습니다.
    """
    now = datetime.utcnow()
    # since: DATA_WINDOW_MONTHS 개월 전
    since_month = now.month - DATA_WINDOW_MONTHS
    since_year = now.year
    while since_month <= 0:
        since_month += 12
        since_year -= 1
    since = f"{since_year:04d}-{since_month:02d}"
    # until: 지난 달 (현재 월 제외)
    until_month = now.month - 1
    until_year = now.year
    if until_month <= 0:
        until_month = 12
        until_year -= 1
    until = f"{until_year:04d}-{until_month:02d}"
    return since, until


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


def _display_label(bracket_key: int) -> str:
    """Chess.com 기준 레이팅 표시 라벨 반환."""
    lo, hi = _BRACKET_DISPLAY[bracket_key]
    return f"{lo}+" if hi is None else f"{lo}–{hi}"


class OpeningTierService:

    # ─────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────

    async def get_opening_tiers(
        self, rating: int, speed: str, color: str
    ) -> Tuple[List[Dict[str, Any]], str]:
        """오프닝 티어 목록과 데이터 기간 반환. 캐시 미스 시 카탈로그/BFS 탐색 수행."""
        openings, since, until = await self._get_or_fetch(rating, speed)
        return self._assign_tiers(openings, color), f"{since} ~ {until}"

    def get_bracket_labels(self, speed: str) -> List[RatingBracket]:  # noqa: ARG002
        """레이팅 구간 목록 반환 (Chess.com 기준 라벨)."""
        result = []
        for bracket_key in RATING_BRACKETS:
            lo, _ = _BRACKET_DISPLAY[bracket_key]
            label = _display_label(bracket_key)
            result.append(
                RatingBracket(
                    lichess_rating=bracket_key,
                    chesscom_rating=lo,
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
        since, until = _compute_date_range()
        _cache.pop((rating, speed, since, until), None)
        path = self._disk_cache_path(rating, speed, since, until)
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
    ) -> Tuple[Dict[str, "_OpeningNode"], str, str]:
        since, until = _compute_date_range()
        cache_key = (rating, speed, since, until)

        # 1. 인메모리 캐시
        if cache_key in _cache:
            result, ts = _cache[cache_key]
            if datetime.utcnow() - ts < CACHE_TTL:
                return result, since, until

        # 2. 디스크 캐시
        disk_result = self._disk_cache_load(rating, speed, since, until)
        if disk_result is not None:
            _cache[cache_key] = (disk_result, datetime.utcnow())
            return disk_result, since, until

        # 3. 카탈로그 기반 병렬 탐색 (Primary)
        openings = await self._catalog_explore(rating, speed, since, until)

        # 4. BFS 폴백 (카탈로그 결과 부족 시)
        if len(openings) < MIN_CATALOG_RESULTS:
            logger.warning(
                "Catalog returned %d entries for rating=%s speed=%s, falling back to BFS",
                len(openings), rating, speed,
            )
            bfs_openings = await self._bfs_explore(rating, speed, since, until)
            for eco, node in bfs_openings.items():
                if eco not in openings or node.depth > openings[eco].depth:
                    openings[eco] = node

        # 5. 캐시 저장
        _cache[cache_key] = (openings, datetime.utcnow())
        self._disk_cache_save(rating, speed, since, until, openings)
        return openings, since, until

    # ── 디스크 캐시 헬퍼 ─────────────────────────────────────────────

    @staticmethod
    def _disk_cache_path(rating: int, speed: str, since: str, until: str) -> Path:
        return CACHE_DIR / f"{rating}_{speed}_{since}_{until}.json"

    def _disk_cache_load(
        self, rating: int, speed: str, since: str, until: str
    ) -> Optional[Dict[str, "_OpeningNode"]]:
        path = self._disk_cache_path(rating, speed, since, until)
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
            logger.warning("Disk cache load failed %s_%s_%s_%s: %s", rating, speed, since, until, exc)
            return None

    def _disk_cache_save(
        self, rating: int, speed: str, since: str, until: str, openings: Dict[str, "_OpeningNode"]
    ) -> None:
        if not openings:
            return
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            path = self._disk_cache_path(rating, speed, since, until)
            payload = {eco: asdict(node) for eco, node in openings.items()}
            with path.open("w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            logger.info("Disk cache saved: %s", path)
        except Exception as exc:
            logger.warning("Disk cache save failed %s_%s_%s_%s: %s", rating, speed, since, until, exc)

    # ─────────────────────────────────────────────────
    # 카탈로그 기반 병렬 탐색 (Primary)
    # ─────────────────────────────────────────────────

    async def _catalog_explore(
        self, rating: int, speed: str, since: str, until: str
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
        self, rating: int, speed: str, since: str, until: str
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
        # 쉼표 구분 단일 파라미터 (NO [] brackets)
        params = [
            ("fen", fen),
            ("ratings", ratings_str),
            ("speeds", speed_val),
            ("moves", TOP_N_MOVES),
            ("topGames", 0),
            ("recentGames", 0),
            ("since", since),
            ("until", until),
        ]
        try:
            # explorer.lichess.org/lichess 는 인증이 필요한 엔드포인트입니다.
            # (Lichess 정책 변경으로 익명 요청도 401 반환)
            headers = {"Accept": "application/json"}
            if settings.LICHESS_API_TOKEN:
                headers["Authorization"] = f"Bearer {settings.LICHESS_API_TOKEN}"
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(EXPLORER_URL, params=params, headers=headers)
                resp.raise_for_status()
                return resp.json()
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
        scored: List[Tuple[str, float, _OpeningNode]] = []
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
            pick_bonus = 1.0 if pick_rate >= PICK_RATE_THRESHOLD else (pick_rate / PICK_RATE_THRESHOLD)

            score = WIN_WEIGHT * relative_perf + POP_WEIGHT * pop_score * pick_bonus
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
        if z >= 1.258:   # 상위 ~3.6% → 60개 기준 약 2개
            return Tier.S
        if z >= 0.6:   # 상위 ~27%까지
            return Tier.A
        if z >= -0.6:  # 중간 ~45%
            return Tier.B
        if z >= -1.258:  # 하위권
            return Tier.C
        return Tier.D
