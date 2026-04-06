"""
개별 게임 분석기 (T1~T6 등급 체계)
────────────────────────────────────────────────────
Stockfish 기반 개별 게임 수 품질 분석

T1: Brilliant (역전/희생 등 전술적 고품질 수)
T2: 최상급 (엔진 1순위, 손실 극소)
T3: 우수 (기존 T2 수준)
T4: 양호 (기존 T3 수준)
T5: 보통 (기존 T4 수준)
T6: 실수 (기존 T5 수준)
"""
from __future__ import annotations

import io
import math
import os
import shutil
import logging
import threading
import time
from collections import OrderedDict
from pathlib import Path
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Tuple, Dict
from enum import Enum

import chess
import chess.pgn
import chess.engine

from app.shared.services import opening_db
from app.core.config import settings

logger = logging.getLogger(__name__)


def _find_stockfish() -> str:
    """
    Stockfish 실행 파일 경로를 탐색합니다.

    shutil.which 는 PATH 에 있는 경우만 찾습니다. Debian/Ubuntu apt 패키지는
    /usr/games/stockfish 에 설치되는데 PATH 에 없을 수 있으므로, 실제 파일
    존재 여부를 순서대로 확인합니다.
    """
    by_which = shutil.which("stockfish")
    if by_which:
        return by_which
    for candidate in (
        "/usr/games/stockfish",      # Debian apt 기본 위치 (Docker 컨테이너)
        "/usr/bin/stockfish",
        "/usr/local/bin/stockfish",
        "/opt/homebrew/bin/stockfish",  # macOS Homebrew
    ):
        if os.path.isfile(candidate):
            return candidate
    return "stockfish"  # 최후 fallback — 실행 시 FileNotFoundError


STOCKFISH_PATH: str = _find_stockfish()

MATE_SCORE = 10_000

ONLY_BEST_MARGIN_CP = 40

# 새 체계:
# T1: Brilliant (T2 후보 중 전술적 고품질)
# T2: 최상급
# T3~T6: 기존 T2~T5를 한 칸씩 뒤로 이동
T2_MAX_CP_LOSS = 10
T2_MAX_WIN_PCT_LOSS = 1.5
T3_MAX_CP_LOSS = 25
T3_MAX_WIN_PCT_LOSS = 4.0
T4_MAX_CP_LOSS = 55
T4_MAX_WIN_PCT_LOSS = 7.5
T5_MAX_CP_LOSS = 95
T5_MAX_WIN_PCT_LOSS = 14.0
T6_MAX_CP_LOSS = 140
T6_MAX_WIN_PCT_LOSS = 22.0


DECISIVE_CP_THRESHOLD = 700
MATE_LIKE_CP_THRESHOLD = 9500

T1_MIN_BRILLIANCY_SCORE = 60.0
T1_ONLY_BEST_GAP_CP = 80
T1_DECISIVE_PRE_CP_MAX = 350
T1_DECISIVE_SWING_CP = 220
T1_MAX_CP_LOSS = 8
T1_MAX_WIN_PCT_LOSS = 1.2

# ── FEN 단위 공유 분석 캐시 (논문 Acher/Esnault 아이디어 적용) ─────────────────────
# 동일한 FEN 포지션은 깊이·multipv가 같으면 결과를 재사용합니다.
# 게임이 달라도 같은 오프닝/국면이면 엔진 호출을 건너뜁니다.
# 키: (epd, depth, multipv_count)  — epd = FEN 앞 4필드(50수 카운터·수 번호 제외)
# 값: (List[InfoDict], timestamp)
#
# 최대 크기: 500 포지션(~0.5~1 MB), TTL: 2시간
_FEN_CACHE_MAXSIZE = 500
_FEN_CACHE_TTL_SEC = 7200

_fen_cache_lock = threading.Lock()
_fen_analysis_cache: "OrderedDict[Tuple[str, int, int], Tuple[List, float]]" = OrderedDict()

# 세션별 캐시 적중 카운터 (스레드-로컬, analyze_game_streaming 내부에서 초기화)
_fen_cache_hits_local = threading.local()


def _fen_cache_lookup(epd: str, depth: int, multipv: int) -> Optional[List]:
    """FEN 캐시 조회. 적중 시 InfoDict 리스트를 반환, 미스·만료 시 None."""
    key = (epd, depth, multipv)
    with _fen_cache_lock:
        entry = _fen_analysis_cache.get(key)
        if entry is None:
            return None
        result, ts = entry
        if time.monotonic() - ts > _FEN_CACHE_TTL_SEC:
            del _fen_analysis_cache[key]
            return None
        _fen_analysis_cache.move_to_end(key)
        return result


def _fen_cache_store(epd: str, depth: int, multipv: int, result: List) -> None:
    """FEN 캐시 저장 (LRU 초과 시 가장 오래된 항목 제거)."""
    key = (epd, depth, multipv)
    with _fen_cache_lock:
        _fen_analysis_cache[key] = (result, time.monotonic())
        _fen_analysis_cache.move_to_end(key)
        while len(_fen_analysis_cache) > _FEN_CACHE_MAXSIZE:
            _fen_analysis_cache.popitem(last=False)


def get_fen_cache_stats() -> Dict[str, int]:
    """현재 FEN 캐시 상태를 반환합니다 (모니터링용)."""
    with _fen_cache_lock:
        return {"size": len(_fen_analysis_cache), "maxsize": _FEN_CACHE_MAXSIZE}


def _inc_fen_cache_hits() -> None:
    """현재 스레드의 FEN 캐시 적중 카운터를 1 증가시킵니다."""
    val = getattr(_fen_cache_hits_local, "count", 0)
    _fen_cache_hits_local.count = val + 1


def _stabilize_win_pct_loss_for_accuracy(move: "AnalyzedMove") -> float:
    """메이트/결정적 우세 구간에서 정확도 과민 반응을 완화합니다.

    - 동일한 쪽이 이미 크게 이기고 있는 상태(양수/음수 부호 동일, 절대값 큼)에서
      메이트 수순 길이 변화로 `win_pct_loss`가 과도하게 커지면 게임 정확도가 급락합니다.
    - 정확도 계산용으로만 완화하여(티어 분류 로직은 유지) 체감 품질을 안정화합니다.
    """
    base_loss = max(0.0, float(getattr(move, "win_pct_loss", 0.0) or 0.0))
    cp_before = getattr(move, "cp_before", None)
    cp_after = getattr(move, "cp_after", None)
    if cp_before is None or cp_after is None:
        return base_loss

    # 같은 쪽이 계속 우세(부호 동일)한 결정적 구간만 완화
    same_winner = (cp_before > 0 and cp_after > 0) or (cp_before < 0 and cp_after < 0)
    if not same_winner:
        return base_loss

    abs_before = abs(cp_before)
    abs_after = abs(cp_after)
    if abs_before < DECISIVE_CP_THRESHOLD or abs_after < DECISIVE_CP_THRESHOLD:
        return base_loss

    cp_delta = abs(cp_before - cp_after)

    # 메이트 유사 영역에서는 페널티를 매우 작게 제한
    if abs_before >= MATE_LIKE_CP_THRESHOLD or abs_after >= MATE_LIKE_CP_THRESHOLD:
        return min(base_loss, 0.8)

    # 결정적 우세 구간에서는 평가 변화량 기반으로 완화
    # (예: 120cp 변화 ≈ 1.0% 수준 상한)
    softened = cp_delta / 120.0
    return min(base_loss, softened)


def _engine_alignment_score_for_accuracy(move: "AnalyzedMove") -> float:
    """엔진 추천 순위 기반 정합도 점수(0~100)."""
    top_moves = getattr(move, "top_moves", None) or []
    if not top_moves:
        # 엔진 랭킹 정보가 없으면 과도한 패널티를 주지 않는다.
        return 100.0

    rank = int(getattr(move, "user_move_rank", 0) or 0)
    if rank == 1:
        return 100.0
    if rank == 2:
        return 88.0
    if rank == 3:
        return 76.0
    return 58.0


def _cp_alignment_score_for_accuracy(move: "AnalyzedMove") -> float:
    """센티폰 손실 기반 정합도 점수(0~100)."""
    cp_loss = max(0.0, float(getattr(move, "cp_loss", 0.0) or 0.0))
    penalty = min(45.0, math.sqrt(cp_loss) * 4.5)
    return max(0.0, 100.0 - penalty)


def _move_accuracy_score(move: "AnalyzedMove") -> float:
    """승률 손실 + 엔진 정합도 + cp 손실을 합성한 per-move 정확도.
    
    T5(약 14% 이상 손실) 이상은 크리티컬하게 페널티를 준다:
    - T5/T6는 "아쉬운 수/실수" 범주로 20~45점 범위에서만 점수 부여
    - tier 기반 상한선을 적용해 T5/T6가 과도하게 높은 정확도를 받지 않도록
    """
    eff_wpl = _stabilize_win_pct_loss_for_accuracy(move)
    wpl_accuracy = 103.1668 * math.exp(-0.04354 * eff_wpl) - 3.1669
    wpl_accuracy = max(0.0, min(100.0, wpl_accuracy))

    engine_alignment = _engine_alignment_score_for_accuracy(move)
    cp_alignment = _cp_alignment_score_for_accuracy(move)

    blended = (
        (wpl_accuracy * 0.65)
        + (engine_alignment * 0.20)
        + (cp_alignment * 0.15)
    )

    if getattr(move, "is_only_best", False):
        blended += 1.5

    # 등급별 상한선: 실수(T5/T6)는 정확도 상한을 낮춘다
    tier = getattr(move, "tier", None)
    if tier is not None:
        tier_str = tier.value if hasattr(tier, "value") else str(tier)
        if tier_str == "T6":  # 실수: 상한 40
            return max(0.0, min(40.0, blended))
        elif tier_str == "T5":  # 보통: 상한 50
            return max(0.0, min(50.0, blended))
        # T1~T4, TH, TF는 일반 범위

    return max(0.0, min(100.0, blended))


def _compute_accuracy(analyzed_moves: list) -> float:
    """
    per-move 정확도의 조화평균으로 게임 정확도 계산

    - 각 수마다: 승률손실 기반 정확도 + 엔진 추천 일치도 + cp 손실을 합성
    - 조화평균: n / sum(1 / acc_i) → 블런더에 더 민감하게 반응
    - TH(이론수) 제외: wpl≈0 이므로 acc≈100, 포함 시 인위적으로 정확도 상승

    승률손실 단일 지표만으로는 엔진 추천수와의 정합도가 누락되므로,
    게임 체감 품질(정확한 수 선택 여부)을 더 세밀하게 반영합니다.
    """
    # TH(이론수), TF(강제수)는 정확도 계산에서 제외
    non_th = [
        m
        for m in analyzed_moves
        if getattr(m, "tier", None) is not None and m.tier.value not in ("TH", "TF")
    ]
    if not non_th:
        return 0.0
    accs = []
    for m in non_th:
        accs.append(_move_accuracy_score(m))
    n = len(accs)
    # 조화평균: acc=0인 경우 0.01로 clamp해 ZeroDivision 방지
    harmonic = n / sum(1.0 / (a if a > 0.0 else 0.01) for a in accs)
    return round(max(0.0, min(100.0, harmonic)), 1)


class MoveTier(Enum):
    """수 품질 등급 T1~T6"""
    TF = "TF"  # forced move (합법 수가 1개뿐인 경우 등)
    TH = "TH"  # 오프닝 이론수 (theory move)
    T1 = "T1"  # Brilliant
    T2 = "T2"  # 최상급
    T3 = "T3"  # 우수
    T4 = "T4"  # 양호
    T5 = "T5"  # 보통
    T6 = "T6"  # 실수


# 등급별 메타데이터 (UI 표시용)
TIER_META = {
    MoveTier.TF: {"label": "강제수", "emoji": "TF", "color": "#0ea5e9", "description": "강제로 둘 수밖에 없는 수"},
    MoveTier.TH: {"label": "이론", "emoji": "TH", "color": "#8b5cf6", "description": "오프닝 이론수"},
    MoveTier.T1: {"label": "브릴리언트", "emoji": "!!", "color": "#22c55e", "description": "그 게임에서 가장 잘 둔 수"},
    MoveTier.T2: {"label": "최상", "emoji": "★", "color": "#10b981", "description": "최상급 정확수"},
    MoveTier.T3: {"label": "우수", "emoji": "✓", "color": "#34d399", "description": "우수한 수"},
    MoveTier.T4: {"label": "양호", "emoji": "○", "color": "#84cc16", "description": "양호한 수"},
    MoveTier.T5: {"label": "보통", "emoji": "△", "color": "#f59e0b", "description": "아쉬운 수"},
    MoveTier.T6: {"label": "실수", "emoji": "✗", "color": "#ef4444", "description": "큰 실수"},
}


@dataclass
class AnalyzedMove:
    """분석된 개별 수 데이터"""
    halfmove: int
    move_number: int
    color: str  # "white" | "black"
    san: str  # 사용자가 둔 수 (Standard Algebraic Notation)
    uci: str  # UCI notation
    fen_before: str = ""  # 수 전 FEN (체스보드 표시용)
    fen_after: str = ""  # 수 후 FEN
    
    # 평가 정보
    cp_before: Optional[int] = None  # 수 전 센티폰 (사용자 관점)
    cp_after: Optional[int] = None  # 수 후 센티폰 (사용자 관점)
    cp_loss: int = 0  # 센티폰 손실
    
    # 승률 정보
    win_pct_before: float = 50.0  # 수 전 승률
    win_pct_after: float = 50.0  # 수 후 승률
    win_pct_loss: float = 0.0  # 승률 손실
    
    # 등급 정보
    tier: MoveTier = MoveTier.T4
    top_moves: List[dict] = field(default_factory=list)  # 엔진 추천 상위 수들
    user_move_rank: int = 0  # 사용자 수의 엔진 랭킹 (1부터 시작, 0=순위권外)
    is_only_best: bool = False  # 유일한 최선수 여부
    best_gap_cp: int = 0  # 1순위-2순위 평가 차이(cp)
    cp_swing: int = 0  # 수 전후 평가 변화량(cp_after - cp_before)
    is_decisive: bool = False  # 결정적 우세를 만든 수인지
    is_sacrifice: bool = False  # 희생 성격(최선 응수로 즉시 재획득 허용)
    sacrifice_value: int = 0  # 희생된 말 가치(폰=1, 나이트/비숍=3, 룩=5, 퀸=9)


@dataclass
class GameAnalysisResult:
    """게임 전체 분석 결과"""
    game_id: str
    username: str
    user_color: str  # "white" | "black"
    total_moves: int
    analyzed_moves: List[AnalyzedMove] = field(default_factory=list)
    
    # 통계
    tier_counts: dict = field(default_factory=dict)
    tier_percentages: dict = field(default_factory=dict)
    avg_cp_loss: float = 0.0
    accuracy: float = 0.0  # Chess.com 방식 정확도
    
    def __post_init__(self):
        """등급별 통계 자동 계산"""
        if not self.analyzed_moves:
            return
        
        total = len(self.analyzed_moves)
        for tier in MoveTier:
            count = sum(1 for m in self.analyzed_moves if m.tier == tier)
            self.tier_counts[tier.value] = count
            self.tier_percentages[tier.value] = round(count / total * 100, 1)
        
        self.avg_cp_loss = round(
            sum(m.cp_loss for m in self.analyzed_moves) / total, 1
        )
        
        # per-move accuracy 조화평균 방식 (Lichess 방식, TH 이론수 제외)
        self.accuracy = _compute_accuracy(self.analyzed_moves)


@dataclass
class PlayerAnalysisResult:
    """개별 플레이어 분석 결과"""
    username: str
    color: str  # "white" | "black"
    total_moves: int
    analyzed_moves: List[AnalyzedMove] = field(default_factory=list)
    
    # 통계
    tier_counts: dict = field(default_factory=dict)
    tier_percentages: dict = field(default_factory=dict)
    avg_cp_loss: float = 0.0
    accuracy: float = 0.0
    
    # T1~T5별 수 목록 (필터링용)
    moves_by_tier: Dict[str, List[AnalyzedMove]] = field(default_factory=dict)
    
    def __post_init__(self):
        """등급별 통계 자동 계산"""
        if not self.analyzed_moves:
            return
        
        total = len(self.analyzed_moves)
        for tier in MoveTier:
            count = sum(1 for m in self.analyzed_moves if m.tier == tier)
            self.tier_counts[tier.value] = count
            self.tier_percentages[tier.value] = round(count / total * 100, 1)
            # 등급별 수 목록 저장
            self.moves_by_tier[tier.value] = [m for m in self.analyzed_moves if m.tier == tier]
        
        self.avg_cp_loss = round(
            sum(m.cp_loss for m in self.analyzed_moves) / total, 1
        )
        
        # per-move accuracy 조화평균 방식 (Lichess 방식, TH 이론수 제외)
        self.accuracy = _compute_accuracy(self.analyzed_moves)


@dataclass
class BothPlayersAnalysisResult:
    """양쪽 플레이어 분석 결과"""
    game_id: str
    white_player: str
    black_player: str
    white_analysis: PlayerAnalysisResult
    black_analysis: PlayerAnalysisResult
    opening: dict = field(default_factory=dict)


def _compute_opening_theory(pgn_str: str) -> dict:
    """
    오프닝 라인(변형) 및 이론수(TH)를 계산.

    - PGN **메인 변형**을 따라가며, 각 포지션(EPD)이 lichess 오프닝 DB에 있으면 이론수로 카운트.
    - ECO 코드가 수순마다 바뀌는 **바리에이션/서브라인**도 DB에 포지션이 있으면 끊지 않고 포함
      (이전에는 동일 ECO 연속 또는 헤더 ECO 강제 매칭으로 일찍 종료될 수 있었음).
    - 표시용 eco/name: PGN [ECO]/[Opening] 헤더 우선, 없으면 마지막 매칭 엔트리·ECO 조회.
    """
    try:
        if not opening_db.is_loaded():
            return {}

        game = chess.pgn.read_game(io.StringIO(pgn_str))
        if game is None:
            return {}

        eco_header = (game.headers.get("ECO") or "").strip().upper() or None
        opening_header = (game.headers.get("Opening") or "").strip() or None

        def key4(b: chess.Board) -> str:
            return " ".join(b.fen().split()[:4])

        board = game.board()
        node = game
        th_plies = 0
        last_entry: Optional[dict] = None

        while node.variations:
            next_node = node.variations[0]
            move = next_node.move
            board.push(move)
            entry = opening_db.get_entry_by_epd(key4(board))
            if not entry:
                break
            th_plies += 1
            last_entry = entry
            node = next_node

        if not last_entry or th_plies == 0:
            return {}

        eco_out = eco_header or last_entry.get("eco")
        name_out = (
            opening_header
            or (opening_db.get_name_by_eco(eco_header) if eco_header else None)
            or (opening_db.get_name_by_eco(last_entry.get("eco")) if last_entry.get("eco") else None)
            or last_entry.get("name")
        )

        th_fullmoves = (th_plies + 1) // 2
        return {
            "eco": eco_out,
            "name": name_out,
            "th_plies": th_plies,
            "th_fullmoves": th_fullmoves,
        }
    except Exception:
        return {}


def _cp_to_win_pct(cp: Optional[int]) -> float:
    """센티폰 → 승률(0~100) 변환"""
    if cp is None:
        return 50.0
    capped = max(-MATE_SCORE, min(MATE_SCORE, cp))
    return 50.0 + 50.0 * (2.0 / (1.0 + math.exp(-0.00368208 * capped)) - 1.0)


def _get_score_pov(info: dict, color: chess.Color) -> Optional[int]:
    """engine.analyse 결과에서 지정 색 관점 센티폰 반환"""
    try:
        return info["score"].pov(color).score(mate_score=MATE_SCORE)
    except Exception:
        return None


def _get_top_moves(
    engine: chess.engine.SimpleEngine,
    board: chess.Board,
    color: chess.Color,
    time_limit: float = 0.15,
    top_n: int = 5,
    depth: Optional[int] = None,
) -> List[Tuple[str, str, int, int]]:
    """
    Stockfish로 상위 N개 수 분석

    depth와 time_limit 모두 지정 시 먼저 도달하는 쪽에서 중단.
    이를 통해 느린 하드웨어(컨테이너 1 CPU)에서도 시간이 보장됩니다.

    Returns: [(uci, san, cp_score, rank), ...]
    """
    limit = chess.engine.Limit(depth=depth, time=time_limit)

    try:
        info = engine.analyse(board, limit, multipv=top_n)
        
        results = []
        for rank, pv_info in enumerate(info, 1):
            try:
                score = pv_info["score"].pov(color).score(mate_score=MATE_SCORE)
                if "pv" in pv_info and len(pv_info["pv"]) > 0:
                    move = pv_info["pv"][0]
                    uci = move.uci()
                    san = board.san(move)
                    results.append((uci, san, score, rank))
            except Exception as e:
                logger.debug(f"Top move analysis error: {e}")
                continue
        
        return results
    except Exception as e:
        logger.warning(f"MultiPV analysis failed: {e}")
        try:
            info = engine.analyse(board, limit)
            score = _get_score_pov(info, color)
            if score is not None:
                best_move = info.get("pv", [None])[0] if "pv" in info else None
                if best_move:
                    return [(best_move.uci(), board.san(best_move), score, 1)]
        except Exception:
            pass
        return []


def _determine_tier(
    user_cp_loss: int,
    user_win_pct_loss: float,
    user_rank: int,
    is_only_best: bool,
) -> MoveTier:
    """
    T2~T6 기본 등급 결정 (T1 Brilliant는 별도 승급)

    분류는 추천 순위와 실제 손실을 함께 본다.

    T2: 최상급
    T3: 우수
    T4: 양호
    T5: 보통
    T6: 큰 실수
    """
    if user_cp_loss >= T6_MAX_CP_LOSS or user_win_pct_loss > T6_MAX_WIN_PCT_LOSS:
        return MoveTier.T6

    # 유일 최선(only-best)인데 승률 손실이 작으면 cp_loss가 다소 커도 최상급으로 처리
    # (사용자 기대값: "유일수"는 손실이 있어도 T3로 밀리는 일이 없게)
    if is_only_best and user_win_pct_loss <= T2_MAX_WIN_PCT_LOSS:
        return MoveTier.T2

    # 최상급: 1순위이거나 유일 최선 수준 + 극소 손실
    if (is_only_best or user_rank == 1) and user_cp_loss <= T2_MAX_CP_LOSS and user_win_pct_loss <= T2_MAX_WIN_PCT_LOSS:
        return MoveTier.T2

    if user_rank == 1 and user_cp_loss <= T3_MAX_CP_LOSS and user_win_pct_loss <= T3_MAX_WIN_PCT_LOSS:
        return MoveTier.T3

    if 1 <= user_rank <= 3 and user_cp_loss <= T4_MAX_CP_LOSS and user_win_pct_loss <= T4_MAX_WIN_PCT_LOSS:
        return MoveTier.T4

    if user_cp_loss <= T5_MAX_CP_LOSS and user_win_pct_loss <= T5_MAX_WIN_PCT_LOSS:
        return MoveTier.T5

    return MoveTier.T6


def _material_score(board: chess.Board, color: chess.Color) -> int:
    values = {
        chess.PAWN: 1,
        chess.KNIGHT: 3,
        chess.BISHOP: 3,
        chess.ROOK: 5,
        chess.QUEEN: 9,
    }
    return sum(
        len(board.pieces(pt, color)) * val
        for pt, val in values.items()
    )


def _is_decisive_t1_signal(cp_before: Optional[int], cp_after: Optional[int]) -> bool:
    """T1 후보를 위한 결정타 신호 판정."""
    if cp_before is None or cp_after is None:
        return False
    if cp_after <= 0:
        return False

    swing = cp_after - cp_before

    if cp_after >= MATE_LIKE_CP_THRESHOLD and swing >= 120:
        return True

    if (
        abs(cp_before) <= T1_DECISIVE_PRE_CP_MAX
        and cp_after >= DECISIVE_CP_THRESHOLD
        and swing >= T1_DECISIVE_SWING_CP
    ):
        return True

    if cp_after >= 900 and swing >= 320:
        return True

    return False


def _detect_sacrifice_on_best_reply(
    board_after_move: chess.Board,
    played_move: chess.Move,
    moving_color: chess.Color,
    after_pv: List[chess.engine.InfoDict],
) -> Tuple[bool, int]:
    """엔진 최선 응수 첫 수가 방금 둔 말을 즉시 잡는지 검사한다."""
    if not after_pv:
        return (False, 0)

    try:
        pv = after_pv[0].get("pv") or []
        if not pv:
            return (False, 0)

        best_reply = pv[0]
        if best_reply.to_square != played_move.to_square:
            return (False, 0)
        if not board_after_move.is_capture(best_reply):
            return (False, 0)

        moved_piece = board_after_move.piece_at(played_move.to_square)
        if moved_piece is None or moved_piece.color != moving_color:
            return (False, 0)

        values = {
            chess.PAWN: 1,
            chess.KNIGHT: 3,
            chess.BISHOP: 3,
            chess.ROOK: 5,
            chess.QUEEN: 9,
        }
        return (True, values.get(moved_piece.piece_type, 0))
    except Exception:
        return (False, 0)


def _t1_candidate_score(move: AnalyzedMove) -> float:
    """T1 후보 점수: 희생/결정타/유일최선 희소 신호를 합산."""
    if move.tier != MoveTier.T2:
        return 0.0
    if move.user_move_rank != 1:
        return 0.0
    if move.cp_loss > T1_MAX_CP_LOSS or move.win_pct_loss > T1_MAX_WIN_PCT_LOSS:
        return 0.0

    score = 24.0
    score += max(0.0, 14.0 - (move.cp_loss * 1.6))
    score += max(0.0, 12.0 - (move.win_pct_loss * 8.0))

    if move.is_only_best:
        score += 10.0

    if move.best_gap_cp >= T1_ONLY_BEST_GAP_CP:
        score += min(20.0, 8.0 + ((move.best_gap_cp - T1_ONLY_BEST_GAP_CP) * 0.2))

    if move.is_sacrifice:
        if move.sacrifice_value >= 3:
            score += 26.0
        elif move.sacrifice_value >= 1:
            score += 16.0

    if move.is_decisive:
        score += 24.0

    # 전술 신호 없이 단순 정확수는 T1로 올리지 않음.
    if not (move.is_sacrifice or move.is_decisive or move.best_gap_cp >= T1_ONLY_BEST_GAP_CP):
        score -= 12.0

    return score


def _promote_best_t2_to_t1(
    white_moves: List[AnalyzedMove],
    black_moves: List[AnalyzedMove],
) -> Optional[AnalyzedMove]:
    """
    T2 수 중 희소 신호를 충족하는 수만 T1 후보로 보고,
    점수가 가장 높은 1개만 T1으로 승격.

    희소 신호 미충족 시 T1은 부여하지 않는다.
    승격된 수를 반환 (스트리밍 클라이언트에 tier 갱신 전송용).
    """
    pool = white_moves + black_moves
    t2_only = [m for m in pool if m.tier == MoveTier.T2]
    if not t2_only:
        return None

    scored_candidates: List[Tuple[float, AnalyzedMove]] = []
    for move in t2_only:
        score = _t1_candidate_score(move)
        if score >= T1_MIN_BRILLIANCY_SCORE:
            scored_candidates.append((score, move))

    if not scored_candidates:
        return None

    scored_candidates.sort(
        key=lambda item: (
            -item[0],
            item[1].cp_loss,
            item[1].win_pct_loss,
            item[1].halfmove,
        )
    )

    promoted = scored_candidates[0][1]
    promoted.tier = MoveTier.T1
    return promoted


def analyze_single_game_sync(
    pgn_str: str,
    username: str,
    game_id: str = "",
    time_per_move: float = 0.15,
    time_per_multi: float = 0.10,
) -> Optional[GameAnalysisResult]:
    """
    단일 게임을 T1~T5 등급으로 분석
    
    Args:
        pgn_str: 게임 PGN 문자열
        username: 분석할 사용자 이름
        game_id: 게임 ID
        time_per_move: 수별 기본 분석 시간
        time_per_multi: 멀티PV 분석 시간 (상위 수 분석용)
    
    Returns:
        GameAnalysisResult 또는 None (분석 실패 시)
    """
    game = chess.pgn.read_game(io.StringIO(pgn_str))
    if game is None:
        logger.warning("Invalid PGN")
        return None
    
    # 사용자 색상 확인
    white_player = game.headers.get("White", "").lower()
    black_player = game.headers.get("Black", "").lower()
    uname = username.lower()
    
    if uname == white_player:
        target_color = chess.WHITE
        user_color = "white"
    elif uname == black_player:
        target_color = chess.BLACK
        user_color = "black"
    else:
        # 부분 일치 시도
        if uname in white_player or white_player in uname:
            target_color = chess.WHITE
            user_color = "white"
        elif uname in black_player or black_player in uname:
            target_color = chess.BLACK
            user_color = "black"
        else:
            logger.warning(f"User '{username}' not found in game ({white_player} vs {black_player})")
            return None
    
    analyzed_moves: List[AnalyzedMove] = []
    
    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            board = game.board()
            node = game
            halfmove = 0
            
            while node.variations:
                next_node = node.variations[0]
                move = next_node.move
                moving_color = board.turn
                
                if moving_color == target_color:
                    # 강제수(TF): 현재 포지션에서 합법 수가 1개뿐이면 강제로 둔 수로 간주
                    try:
                        lm = iter(board.legal_moves)
                        first_lm = next(lm, None)
                        second_lm = next(lm, None)
                        is_forced = first_lm is not None and second_lm is None
                    except Exception:
                        is_forced = False

                    # 수 전 평가
                    info_before = engine.analyse(
                        board,
                        chess.engine.Limit(time=time_per_move),
                    )
                    cp_before = _get_score_pov(info_before, moving_color)
                    
                    # 사용자가 둔 수 정보
                    user_san = board.san(move)
                    user_uci = move.uci()
                    
                    # 수 실행 후 평가
                    board.push(move)
                    info_after = engine.analyse(
                        board,
                        chess.engine.Limit(time=time_per_move),
                    )
                    cp_after = _get_score_pov(info_after, moving_color)
                    
                    # 손실 계산
                    cp_loss = max(0, (cp_before or 0) - (cp_after or 0))
                    win_pct_before = _cp_to_win_pct(cp_before)
                    win_pct_after = _cp_to_win_pct(cp_after)
                    win_pct_loss = max(0.0, win_pct_before - win_pct_after)
                    
                    # 상위 수 분석 (MultiPV)
                    board.pop()  # 되돌려서 분석
                    top_moves_raw = _get_top_moves(
                        engine, board, moving_color, time_per_multi, top_n=5
                    )
                    board.push(move)  # 다시 실행
                    
                    # 사용자 수의 순위 확인
                    user_rank = 0
                    is_only_best = False
                    best_cp = None
                    best_gap_cp = 0
                    
                    if top_moves_raw:
                        best_cp = top_moves_raw[0][2]  # 1순위 수의 평가
                        
                        # 사용자 수 찾기
                        for uci, san, cp, rank in top_moves_raw:
                            if uci == user_uci:
                                user_rank = rank
                                break
                        
                        # 유일한 최선수 여부 확인
                        # 2순위와의 평가 차이가 충분히 클 때만 유일 최선으로 간주한다.
                        if len(top_moves_raw) >= 2:
                            second_cp = top_moves_raw[1][2]
                            best_gap_cp = best_cp - second_cp
                            if best_cp - second_cp >= ONLY_BEST_MARGIN_CP and user_rank == 1:
                                is_only_best = True
                        elif len(top_moves_raw) == 1 and user_rank == 1:
                            is_only_best = True

                    cp_swing = (cp_after or 0) - (cp_before or 0)
                    is_decisive = _is_decisive_t1_signal(cp_before, cp_after)
                    
                    # 등급 결정
                    tier = _determine_tier(
                        cp_loss, win_pct_loss, user_rank, is_only_best
                    )

                    if is_forced:
                        tier = MoveTier.TF
                    
                    # 상위 수 정보 정리
                    top_moves_info = [
                        {"uci": uci, "san": san, "cp": cp, "rank": rank}
                        for uci, san, cp, rank in top_moves_raw[:5]
                    ]
                    
                    analyzed_moves.append(AnalyzedMove(
                        halfmove=halfmove,
                        move_number=halfmove // 2 + 1,
                        color="white" if moving_color == chess.WHITE else "black",
                        san=user_san,
                        uci=user_uci,
                        cp_before=cp_before,
                        cp_after=cp_after,
                        cp_loss=cp_loss,
                        win_pct_before=round(win_pct_before, 2),
                        win_pct_after=round(win_pct_after, 2),
                        win_pct_loss=round(win_pct_loss, 2),
                        tier=tier,
                        top_moves=top_moves_info,
                        user_move_rank=user_rank,
                        is_only_best=is_only_best,
                        best_gap_cp=best_gap_cp,
                        cp_swing=cp_swing,
                        is_decisive=is_decisive,
                    ))
                else:
                    board.push(move)
                
                node = next_node
                halfmove += 1
    
    except FileNotFoundError:
        logger.error(f"Stockfish not found: {STOCKFISH_PATH}")
        return None
    except Exception as exc:
        logger.exception(f"Game analysis error: {exc}")
        return None
    
    return GameAnalysisResult(
        game_id=game_id,
        username=username,
        user_color=user_color,
        total_moves=len(analyzed_moves),
        analyzed_moves=analyzed_moves,
    )


def _analyze_single_move_with_fen(
    engine: chess.engine.SimpleEngine,
    board: chess.Board,
    move: chess.Move,
    halfmove: int,
    time_per_move: float = 0.15,
    stockfish_depth: Optional[int] = None,
    prev_multipv: Optional[List[chess.engine.InfoDict]] = None,
) -> Tuple[Optional[AnalyzedMove], List[chess.engine.InfoDict]]:
    """
    단일 수 분석 (FEN 포함) - 극한의 실무 최적화 적용 버전
    """
    moving_color = board.turn
    color_str = "white" if moving_color == chess.WHITE else "black"

    fen_before = board.fen()

    # 1. TF 판정 (강제수)
    is_forced = False
    try:
        legal_moves = list(board.legal_moves)
        if len(legal_moves) == 1:
            is_forced = True
        elif board.is_check() and len(legal_moves) <= 3:
            def _opponent_has_mate_in_one_after(mv: chess.Move) -> bool:
                board.push(mv)
                try:
                    for reply in list(board.legal_moves):
                        board.push(reply)
                        try:
                            if board.is_checkmate():
                                return True
                        finally:
                            board.pop()
                    return False
                finally:
                    board.pop()

            safe_moves = [mv for mv in legal_moves if not _opponent_has_mate_in_one_after(mv)]
            if len(safe_moves) == 1 and safe_moves[0] == move:
                is_forced = True
    except Exception:
        is_forced = False

    # ① Before 포지션 정보 추출
    epd_before = " ".join(fen_before.split()[:4])
    if prev_multipv:
        before_pv = prev_multipv
    else:
        # 최초 1수 째는 얕은 깊이로 빠르게 초기화 (어차피 오프닝 구간)
        # 🚀 FEN 캐시: 동일 포지션은 다른 게임에서도 재사용
        _BEFORE_INIT_DEPTH = 10
        cached_before = _fen_cache_lookup(epd_before, _BEFORE_INIT_DEPTH, 3)
        if cached_before is not None:
            before_pv = cached_before
            _inc_fen_cache_hits()
        else:
            init_limit = chess.engine.Limit(depth=_BEFORE_INIT_DEPTH, time=time_per_move)
            before_pv = engine.analyse(board, init_limit, multipv=3)
            if stockfish_depth is not None:  # depth 기반 분석만 캐시 (time 기반은 비결정적)
                _fen_cache_store(epd_before, _BEFORE_INIT_DEPTH, 3, before_pv)

    cp_before: Optional[int] = None
    try:
        cp_before = before_pv[0]["score"].pov(moving_color).score(mate_score=MATE_SCORE)
    except Exception:
        pass

    # 🚀 최적화 A: 가비지 타임 다이어트
    # 이미 승패가 700 센티폰(폰 7개) 이상 차이로 완벽하게 기울었다면, 깊게 볼 필요가 없습니다.
    is_garbage_time = cp_before is not None and abs(cp_before) >= 700

    target_depth = stockfish_depth
    if target_depth is not None:
        if is_forced:
            target_depth = min(10, target_depth)  # 강제수는 깊게 연산할 필요 없음
        elif is_garbage_time:
            target_depth = max(12, target_depth - 6)  # 승패가 기운 곳은 얕게 연산

    limit = chess.engine.Limit(depth=target_depth, time=time_per_move)

    user_san = board.san(move)
    user_uci = move.uci()

    # ② After 포지션 세팅
    board.push(move)
    fen_after = board.fen()
    epd_after = " ".join(fen_after.split()[:4])

    # TH 조기 종료
    is_th = False
    try:
        if opening_db.is_loaded():
            entry = opening_db.get_entry_by_epd(epd_after)
            if entry:
                is_th = True
    except Exception:
        pass

    # 🚀 최적화 B & C: 메인 라인과 MultiPV의 완벽한 분리(Decoupling)
    if is_th and not is_forced:
        # TH(오프닝 이론수): 얕은 분석 + FEN 캐시 (오프닝 포지션은 여러 게임 간 높은 재사용률)
        _TH_DEPTH = 8
        cached_th = _fen_cache_lookup(epd_after, _TH_DEPTH, 3)
        if cached_th is not None:
            after_pv = cached_th
            _inc_fen_cache_hits()
        else:
            th_limit = chess.engine.Limit(depth=_TH_DEPTH, time=0.03)
            after_pv = engine.analyse(board, th_limit, multipv=3)
            _fen_cache_store(epd_after, _TH_DEPTH, 3, after_pv)
    else:
        # 지정된 Depth가 14 이상일 때만 분리 연산 발동
        if target_depth and target_depth >= 14:
            # 1. 점수 계산용 메인 라인: 깊고 정확하게 딱 1개만 찾음 + FEN 캐시
            cached_exact = _fen_cache_lookup(epd_after, target_depth, 1)
            if cached_exact is not None:
                exact_info = cached_exact[0]
                _inc_fen_cache_hits()
            else:
                exact_info = engine.analyse(board, limit)
                _fen_cache_store(epd_after, target_depth, 1, [exact_info])

            # 2. UI 추천 수용 서브 라인: 깊이를 4 깎아서 얕고 넓게 찾음 + FEN 캐시
            # 🚨 에러 해결: time_per_move가 None일 때의 방어 로직 추가
            _shallow_depth = target_depth - 4
            shallow_time = time_per_move * 0.7 if time_per_move is not None else None
            cached_shallow = _fen_cache_lookup(epd_after, _shallow_depth, 3)
            if cached_shallow is not None:
                after_pv = list(cached_shallow)  # 복사: 아래 score 덮어쓰기가 캐시를 오염시키지 않도록
                _inc_fen_cache_hits()
            else:
                shallow_limit = chess.engine.Limit(depth=_shallow_depth, time=shallow_time)
                after_pv = engine.analyse(board, shallow_limit, multipv=3)
                _fen_cache_store(epd_after, _shallow_depth, 3, after_pv)
                after_pv = list(after_pv)  # 복사: 아래 score 덮어쓰기가 캐시를 오염시키지 않도록

            # 3. 마법의 트릭: 얕게 찾은 점수를 정확한 점수로 덮어쓰기
            # ⚠️ 리스트는 복사됐으나 내부 dict는 공유됨 → dict도 복사하여 캐시 불변성 보장
            if after_pv and "score" in exact_info:
                after_pv[0] = dict(after_pv[0])
                after_pv[0]["score"] = exact_info["score"]
        else:
            # 기존 방식 (얕은 깊이) + FEN 캐시
            if target_depth is not None:
                cached_normal = _fen_cache_lookup(epd_after, target_depth, 3)
                if cached_normal is not None:
                    after_pv = cached_normal
                    _inc_fen_cache_hits()
                else:
                    after_pv = engine.analyse(board, limit, multipv=3)
                    _fen_cache_store(epd_after, target_depth, 3, after_pv)
            else:
                # time-based analysis: 캐시하지 않음 (비결정적 깊이)
                after_pv = engine.analyse(board, limit, multipv=3)

    is_sacrifice, sacrifice_value = _detect_sacrifice_on_best_reply(
        board,
        move,
        moving_color,
        after_pv if isinstance(after_pv, list) else [],
    )

    cp_after: Optional[int] = None
    try:
        cp_after = after_pv[0]["score"].pov(moving_color).score(mate_score=MATE_SCORE)
    except Exception:
        pass

    board.pop()  # before 포지션으로 복원

    # 손실 계산
    cp_loss = max(0, (cp_before or 0) - (cp_after or 0))
    win_pct_before = _cp_to_win_pct(cp_before)
    win_pct_after = _cp_to_win_pct(cp_after)
    win_pct_loss = max(0.0, win_pct_before - win_pct_after)

    # ③ 순위: before_pv 에서 추출 (별도 엔진 호출 없음)
    top_moves_raw: List[Tuple[str, str, int, int]] = []
    for rank, pv_info in enumerate(before_pv, 1):
        try:
            score = pv_info["score"].pov(moving_color).score(mate_score=MATE_SCORE)
            if "pv" in pv_info and pv_info["pv"]:
                mv = pv_info["pv"][0]
                top_moves_raw.append((mv.uci(), board.san(mv), score, rank))
        except Exception:
            continue

    user_rank = 0
    is_only_best = False
    best_gap_cp = 0

    if top_moves_raw:
        best_cp = top_moves_raw[0][2]
        for uci, san, cp, rank in top_moves_raw:
            if uci == user_uci:
                user_rank = rank
                break
        if len(top_moves_raw) >= 2:
            second_cp = top_moves_raw[1][2]
            best_gap_cp = best_cp - second_cp
            if best_cp - second_cp >= ONLY_BEST_MARGIN_CP and user_rank == 1:
                is_only_best = True
        elif len(top_moves_raw) == 1 and user_rank == 1:
            is_only_best = True

    cp_swing = (cp_after or 0) - (cp_before or 0)
    is_decisive = _is_decisive_t1_signal(cp_before, cp_after)

    # 등급 결정 (T1은 게임 종료 후 T2 중 최고의 수 1개로 확정)
    tier = _determine_tier(cp_loss, win_pct_loss, user_rank, is_only_best)
    if is_th:
        tier = MoveTier.TH
    if is_forced:
        tier = MoveTier.TF

    top_moves_info = [
        {"uci": uci, "san": san, "cp": cp, "rank": rank}
        for uci, san, cp, rank in top_moves_raw[:3]
    ]

    board.push(move)  # 호출자와 상태 동기화

    analyzed_move = AnalyzedMove(
        halfmove=halfmove,
        move_number=halfmove // 2 + 1,
        color=color_str,
        san=user_san,
        uci=user_uci,
        fen_before=fen_before,
        fen_after=fen_after,
        cp_before=cp_before,
        cp_after=cp_after,
        cp_loss=cp_loss,
        win_pct_before=round(win_pct_before, 2),
        win_pct_after=round(win_pct_after, 2),
        win_pct_loss=round(win_pct_loss, 2),
        tier=tier,
        top_moves=top_moves_info,
        user_move_rank=user_rank,
        is_only_best=is_only_best,
        best_gap_cp=best_gap_cp,
        cp_swing=cp_swing,
        is_decisive=is_decisive,
        is_sacrifice=is_sacrifice,
        sacrifice_value=sacrifice_value,
    )
    return analyzed_move, after_pv


def analyze_game_streaming(
    pgn_str: str,
    game_id: str = "",
    stockfish_depth: Optional[int] = None,
    on_init: Optional[Callable] = None,
    on_move: Optional[Callable] = None,
    cancel_event: Optional[threading.Event] = None,
) -> Optional[BothPlayersAnalysisResult]:
    """
    SSE 스트리밍용 게임 분석. 수 하나 분석 완료 시마다 on_move 콜백을 호출하여
    실시간으로 프론트엔드에 결과를 전달합니다.

    Args:
        pgn_str: 게임 PGN 문자열
        game_id: 게임 ID
        stockfish_depth: Stockfish 분석 깊이 (None이면 시간 기반)
        on_init: 초기 정보 콜백 (total_moves, players, opening)
        on_move: 수 분석 완료 콜백 (AnalyzedMove dict)
        cancel_event: 설정 시 is_set()이면 다음 수로 넘어가기 전에 중단 (클라이언트 연결 끊김 등)

    Returns:
        BothPlayersAnalysisResult (요약 통계 포함)
    """
    # depth 미지정(None)이면 시간 기반 분석
    time_per_move = 0.15 if not stockfish_depth else None

    # FEN 캐시 적중 카운터 초기화 (스레드-로컬)
    _fen_cache_hits_local.count = 0

    game = chess.pgn.read_game(io.StringIO(pgn_str))
    if game is None:
        logger.warning("Invalid PGN")
        return None

    white_player = game.headers.get("White", "White")
    black_player = game.headers.get("Black", "Black")

    opening_info = _compute_opening_theory(pgn_str)

    # 총 수 계산
    total_moves = 0
    tmp_node = game
    while tmp_node.variations:
        total_moves += 1
        tmp_node = tmp_node.variations[0]

    if on_init:
        on_init({
            "total_moves": total_moves,
            "white_player": white_player,
            "black_player": black_player,
            "opening": opening_info or {},
        })

    white_moves: List[AnalyzedMove] = []
    black_moves: List[AnalyzedMove] = []

    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            engine.configure({
                "Threads": settings.STOCKFISH_THREADS,
                "Hash": settings.STOCKFISH_HASH_MB,
            })

            board = game.board()
            node = game
            halfmove = 0
            prev_multipv: Optional[List[chess.engine.InfoDict]] = None

            while node.variations:
                if cancel_event is not None and cancel_event.is_set():
                    logger.info("[Game Analysis] cancel_event set; stopping Stockfish loop")
                    return None

                next_node = node.variations[0]
                move = next_node.move
                moving_color = board.turn

                analyzed, prev_multipv = _analyze_single_move_with_fen(
                    engine,
                    board,
                    move,
                    halfmove,
                    time_per_move,
                    stockfish_depth,
                    prev_multipv=prev_multipv,
                )

                if analyzed:
                    if moving_color == chess.WHITE:
                        white_moves.append(analyzed)
                    else:
                        black_moves.append(analyzed)
                    if on_move:
                        on_move(_analyzed_move_to_dict(analyzed))

                # board.push는 _analyze_single_move_with_fen 내부에서 수행
                node = next_node
                halfmove += 1

    except FileNotFoundError:
        logger.error(f"Stockfish not found: {STOCKFISH_PATH}")
        return None
    except Exception as exc:
        logger.exception(f"Game analysis error: {exc}")
        raise

    fen_hits = getattr(_fen_cache_hits_local, "count", 0)
    total_engine_calls_avoided = fen_hits
    logger.info(
        f"[FEN Cache] game_id={game_id!r} depth={stockfish_depth} "
        f"fen_cache_hits={fen_hits} total_halfmoves={halfmove} "
        f"cache_size={get_fen_cache_stats()['size']}"
    )

    promoted = _promote_best_t2_to_t1(white_moves, black_moves)
    if on_move and promoted is not None:
        on_move(_analyzed_move_to_dict(promoted))

    white_analysis = PlayerAnalysisResult(
        username=white_player,
        color="white",
        total_moves=len(white_moves),
        analyzed_moves=white_moves,
    )

    black_analysis = PlayerAnalysisResult(
        username=black_player,
        color="black",
        total_moves=len(black_moves),
        analyzed_moves=black_moves,
    )

    return BothPlayersAnalysisResult(
        game_id=game_id,
        white_player=white_player,
        black_player=black_player,
        white_analysis=white_analysis,
        black_analysis=black_analysis,
        opening=opening_info or {},
    )


def _analyzed_move_to_dict(m: AnalyzedMove) -> dict:
    """AnalyzedMove dataclass → JSON-safe dict"""
    return {
        "halfmove": m.halfmove,
        "move_number": m.move_number,
        "color": m.color,
        "san": m.san,
        "uci": m.uci,
        "fen_before": m.fen_before,
        "fen_after": m.fen_after,
        "cp_before": m.cp_before,
        "cp_after": m.cp_after,
        "cp_loss": m.cp_loss,
        "win_pct_before": m.win_pct_before,
        "win_pct_after": m.win_pct_after,
        "win_pct_loss": m.win_pct_loss,
        "tier": m.tier.value,
        "top_moves": m.top_moves,
        "user_move_rank": m.user_move_rank,
        "is_only_best": m.is_only_best,
        "best_gap_cp": m.best_gap_cp,
        "cp_swing": m.cp_swing,
        "is_decisive": m.is_decisive,
        "is_sacrifice": m.is_sacrifice,
        "sacrifice_value": m.sacrifice_value,
    }
