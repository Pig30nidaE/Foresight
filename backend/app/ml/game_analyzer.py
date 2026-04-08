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

[수정 내역]
1. 정확도(accuracy): Chess.com 공식과 동일하게 avg_wpl 단일 지표로만 계산.
   - 조화평균 제거 → 산술평균 wpl로 직접 정확도 산출
   - T5/T6 상한 클리핑 제거 (왜곡 요인)
   - 결정적 구간 완화 로직 유지 (단, 정확도 계산 전용)
2. 티어 기준 재보정 (Chess.com 실측치 기반):
   - T2~T5 wpl 상한을 Chess.com 기준에 맞게 넓힘
   - T6는 wpl > 10% (Inaccuracy 이상)가 아닌 진짜 Mistake/Blunder 구간으로 한정
3. T1(Brilliant) 조건 강화:
   - "이 수가 없으면 불리해진다"는 "회피 필요성" 조건 추가
   - 단순 희생/정확수만으로는 부여하지 않음
   - 게임당 최대 2개, 단 모든 조건 충족 시에만 부여
"""
from __future__ import annotations

import io
import math
import os
import shutil
import logging
import threading
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
    by_which = shutil.which("stockfish")
    if by_which:
        return by_which
    for candidate in (
        "/usr/games/stockfish",
        "/usr/bin/stockfish",
        "/usr/local/bin/stockfish",
        "/opt/homebrew/bin/stockfish",
    ):
        if os.path.isfile(candidate):
            return candidate
    return "stockfish"


STOCKFISH_PATH: str = _find_stockfish()

MATE_SCORE = 10_000
ONLY_BEST_MARGIN_CP = 40
DECISIVE_CP_THRESHOLD = 700
MATE_LIKE_CP_THRESHOLD = 9500

# ── 티어 기준 (Chess.com win% loss 기준으로 재보정) ────────────────────────
# Chess.com 기준:
#   Best       wpl ≤ 2%
#   Excellent  wpl ≤ 5%
#   Good       wpl ≤ 10%
#   Inaccuracy wpl ≤ 20%
#   Mistake    wpl ≤ 50%
#   Blunder    wpl > 50%
#
# T2(Best+Excellent), T3(Good), T4(Inaccuracy), T5(Mistake), T6(Blunder)로 매핑.
# cp_loss는 보조 조건(wpl이 낮아도 cp 손실이 너무 크면 강등)으로만 사용.

T2_MAX_WPL = 2.0       # Best
T2_MAX_CP  = 15

T3_MAX_WPL = 5.0       # Excellent
T3_MAX_CP  = 40

T4_MAX_WPL = 10.0      # Good
T4_MAX_CP  = 80

T5_MAX_WPL = 25.0      # Inaccuracy + 일부 Mistake
T5_MAX_CP  = 150

# T6: Mistake/Blunder 구간 (wpl > 25% 또는 cp_loss > 150)
# → T5 기준을 벗어나면 자동으로 T6

# ── T1(Brilliant) 조건 ────────────────────────────────────────────────────
# Chess.com Brilliant 핵심 기준:
# 1) 엔진 1순위 수 (user_rank == 1)
# 2) 극소 손실 (wpl ≤ 1.5%, cp ≤ 10)
# 3) 다음 중 하나 이상:
#    a) 희생 수 (상대 최선 응수가 내 기물을 즉시 잡음)
#    b) 결정타 (cp_swing ≥ 200이고, 이전 국면이 팽팽하거나 내가 불리)
#    c) 유일 탈출 (다른 수 두면 불리해지는 唯一 활로: best_gap_cp ≥ 120)
# 4) 게임당 최대 2개

T1_MAX_WPL          = 1.5
T1_MAX_CP           = 10
T1_MIN_SCORE        = 70.0   # 후보 점수 하한 (상향 조정)
T1_BEST_GAP_CP      = 120    # 유일 탈출 판정 기준 (상향)
T1_DECISIVE_SWING   = 200    # 결정타 기준 swing
T1_PRE_CP_MAX       = 250    # 결정타 발동 최대 사전 평가 (팽팽/불리 구간)
T1_MAX_PER_GAME     = 2      # 게임당 최대 T1 수


class MoveTier(Enum):
    """수 품질 등급 T1~T6"""
    TF = "TF"  # forced move
    TH = "TH"  # 오프닝 이론수
    T1 = "T1"  # Brilliant
    T2 = "T2"  # 최상급
    T3 = "T3"  # 우수
    T4 = "T4"  # 양호
    T5 = "T5"  # 보통
    T6 = "T6"  # 실수


TIER_META = {
    MoveTier.TF: {"label": "강제수",   "emoji": "TF", "color": "#0ea5e9", "description": "강제로 둘 수밖에 없는 수"},
    MoveTier.TH: {"label": "이론",     "emoji": "TH", "color": "#8b5cf6", "description": "오프닝 이론수"},
    MoveTier.T1: {"label": "브릴리언트","emoji": "!!","color": "#22c55e", "description": "탁월한 전술적 수"},
    MoveTier.T2: {"label": "최상",     "emoji": "★",  "color": "#10b981", "description": "최상급 정확수"},
    MoveTier.T3: {"label": "우수",     "emoji": "✓",  "color": "#34d399", "description": "우수한 수"},
    MoveTier.T4: {"label": "양호",     "emoji": "○",  "color": "#84cc16", "description": "양호한 수"},
    MoveTier.T5: {"label": "보통",     "emoji": "△",  "color": "#f59e0b", "description": "아쉬운 수"},
    MoveTier.T6: {"label": "실수",     "emoji": "✗",  "color": "#ef4444", "description": "큰 실수"},
}


@dataclass
class AnalyzedMove:
    """분석된 개별 수 데이터"""
    halfmove: int
    move_number: int
    color: str
    san: str
    uci: str
    fen_before: str = ""
    fen_after: str = ""

    cp_before: Optional[int] = None
    cp_after: Optional[int] = None
    cp_loss: int = 0

    win_pct_before: float = 50.0
    win_pct_after: float = 50.0
    win_pct_loss: float = 0.0

    tier: MoveTier = MoveTier.T4
    top_moves: List[dict] = field(default_factory=list)
    user_move_rank: int = 0
    is_only_best: bool = False
    best_gap_cp: int = 0
    cp_swing: int = 0
    is_decisive: bool = False
    is_sacrifice: bool = False
    sacrifice_value: int = 0


@dataclass
class GameAnalysisResult:
    game_id: str
    username: str
    user_color: str
    total_moves: int
    analyzed_moves: List[AnalyzedMove] = field(default_factory=list)

    tier_counts: dict = field(default_factory=dict)
    tier_percentages: dict = field(default_factory=dict)
    avg_cp_loss: float = 0.0
    accuracy: float = 0.0

    def __post_init__(self):
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
        self.accuracy = _compute_accuracy(self.analyzed_moves)


@dataclass
class PlayerAnalysisResult:
    username: str
    color: str
    total_moves: int
    analyzed_moves: List[AnalyzedMove] = field(default_factory=list)

    tier_counts: dict = field(default_factory=dict)
    tier_percentages: dict = field(default_factory=dict)
    avg_cp_loss: float = 0.0
    accuracy: float = 0.0
    moves_by_tier: Dict[str, List[AnalyzedMove]] = field(default_factory=dict)

    def __post_init__(self):
        if not self.analyzed_moves:
            return
        total = len(self.analyzed_moves)
        for tier in MoveTier:
            count = sum(1 for m in self.analyzed_moves if m.tier == tier)
            self.tier_counts[tier.value] = count
            self.tier_percentages[tier.value] = round(count / total * 100, 1)
            self.moves_by_tier[tier.value] = [m for m in self.analyzed_moves if m.tier == tier]
        self.avg_cp_loss = round(
            sum(m.cp_loss for m in self.analyzed_moves) / total, 1
        )
        self.accuracy = _compute_accuracy(self.analyzed_moves)


@dataclass
class BothPlayersAnalysisResult:
    game_id: str
    white_player: str
    black_player: str
    white_analysis: PlayerAnalysisResult
    black_analysis: PlayerAnalysisResult
    opening: dict = field(default_factory=dict)


# ── 핵심 유틸 ─────────────────────────────────────────────────────────────

def _cp_to_win_pct(cp: Optional[int]) -> float:
    """센티폰 → 승률(0~100) 변환"""
    if cp is None:
        return 50.0
    capped = max(-MATE_SCORE, min(MATE_SCORE, cp))
    return 50.0 + 50.0 * (2.0 / (1.0 + math.exp(-0.00368208 * capped)) - 1.0)


def _accuracy_formula(avg_wpl: float) -> float:
    """Chess.com 공식: 103.1668 × exp(-0.04354 × avg_wpl) - 3.1669"""
    raw = 103.1668 * math.exp(-0.04354 * avg_wpl) - 3.1669
    return round(max(0.0, min(100.0, raw)), 1)


def _stabilize_wpl_for_accuracy(move: AnalyzedMove) -> float:
    """
    결정적 우세 구간(±700cp 이상, 같은 쪽이 계속 이기는 상황)에서는
    메이트 수순 길이 차이로 wpl이 과도하게 부풀어 정확도가 왜곡되는 것을 방지.
    정확도 계산 전용 — 티어 분류에는 영향 없음.
    """
    base = max(0.0, float(move.win_pct_loss or 0.0))
    cp_b, cp_a = move.cp_before, move.cp_after
    if cp_b is None or cp_a is None:
        return base

    same_side_winning = (cp_b > 0 and cp_a > 0) or (cp_b < 0 and cp_a < 0)
    if not same_side_winning:
        return base

    if abs(cp_b) < DECISIVE_CP_THRESHOLD or abs(cp_a) < DECISIVE_CP_THRESHOLD:
        return base

    # 메이트 직전 영역: 사실상 손실 없음
    if abs(cp_b) >= MATE_LIKE_CP_THRESHOLD or abs(cp_a) >= MATE_LIKE_CP_THRESHOLD:
        return min(base, 0.5)

    # 결정적 우세 구간: cp 변화량 기반으로 완화
    cp_delta = abs(cp_b - cp_a)
    softened = cp_delta / 100.0
    return min(base, softened)


def _compute_accuracy(analyzed_moves: list) -> float:
    """
    Chess.com 방식 정확도:
      1) TH(이론수), TF(강제수) 제외
      2) 각 수의 wpl을 결정적 구간 완화 처리
      3) 평균 wpl → Chess.com 공식 적용

    조화평균·엔진랭킹·cp 혼합 방식을 제거하고
    Chess.com 원본 공식으로 단순화하여 실제 수치와 근접하게 함.
    """
    skip = {"TH", "TF"}
    moves = [m for m in analyzed_moves
             if m.tier is not None and m.tier.value not in skip]
    if not moves:
        return 0.0

    total_wpl = sum(_stabilize_wpl_for_accuracy(m) for m in moves)
    avg_wpl = total_wpl / len(moves)
    return _accuracy_formula(avg_wpl)


# ── 티어 결정 ──────────────────────────────────────────────────────────────

def _determine_tier(
    cp_loss: int,
    wpl: float,
    user_rank: int,
    is_only_best: bool,
) -> MoveTier:
    """
    Chess.com win% loss 기준으로 재보정된 T2~T6 분류.

    우선순위:
      1. T2(Best): wpl ≤ 2% AND cp ≤ 15 AND rank 1 (또는 유일 최선)
      2. T3(Excellent): wpl ≤ 5% AND cp ≤ 40
      3. T4(Good): wpl ≤ 10% AND cp ≤ 80
      4. T5(Inaccuracy/Mistake): wpl ≤ 25% AND cp ≤ 150
      5. T6(Mistake/Blunder): 나머지

    cp_loss는 보조 조건: wpl이 낮아도 cp 손실이 기준 초과 시 한 단계 강등.
    """
    # T2: 최상급 — rank 1이거나 유일 최선, 손실 극소
    if (user_rank == 1 or is_only_best) and wpl <= T2_MAX_WPL and cp_loss <= T2_MAX_CP:
        return MoveTier.T2

    # T3: 우수 — 손실 작음
    if wpl <= T3_MAX_WPL and cp_loss <= T3_MAX_CP:
        return MoveTier.T3

    # T4: 양호
    if wpl <= T4_MAX_WPL and cp_loss <= T4_MAX_CP:
        return MoveTier.T4

    # T5: 보통 (Inaccuracy 구간)
    if wpl <= T5_MAX_WPL and cp_loss <= T5_MAX_CP:
        return MoveTier.T5

    # T6: 실수/블런더
    return MoveTier.T6


# ── T1 (Brilliant) ─────────────────────────────────────────────────────────

def _is_decisive_swing(cp_before: Optional[int], cp_after: Optional[int]) -> bool:
    """
    결정타 판정: 이전 국면이 팽팽하거나 약간 불리한 상황에서
    한 수로 큰 우세를 만들어낸 경우.
    """
    if cp_before is None or cp_after is None:
        return False
    if cp_after <= 0:
        return False

    swing = cp_after - cp_before

    # 팽팽하거나 내가 불리 → 큰 우세로 전환
    if abs(cp_before) <= T1_PRE_CP_MAX and cp_after >= DECISIVE_CP_THRESHOLD and swing >= T1_DECISIVE_SWING:
        return True

    # 메이트 유도 수순 진입 (이전 국면이 어느 정도 우세해도 허용)
    if cp_after >= MATE_LIKE_CP_THRESHOLD and swing >= 150:
        return True

    # 상당한 우세 창출 (이전 약간 불리 → 900cp+)
    if cp_before <= 100 and cp_after >= 900 and swing >= 350:
        return True

    return False


def _t1_candidate_score(move: AnalyzedMove) -> float:
    """
    T1 후보 점수 계산.

    오직 "탁월한 희생 수"만 T1으로 측정합니다.
    - 엔진 1순위 (user_rank == 1)
    - 손실이 매우 적음 (T1_MAX_CP, T1_MAX_WPL 이하)
    - 순수한 기물 희생이 발생 (net_loss >= 2)
    """
    if move.tier != MoveTier.T2:
        return 0.0
    if move.user_move_rank != 1:
        return 0.0
    if move.cp_loss > T1_MAX_CP or move.win_pct_loss > T1_MAX_WPL:
        return 0.0

    # 오직 희생 수만 T1 검토 대상
    if not move.is_sacrifice or move.sacrifice_value < 2:
        return 0.0

    # 조건을 만족하는 모든 탁월한 희생 수는 높은 점수를 기본으로 부여하여 무조건 T1으로 승격되게 함
    score = 100.0 + move.sacrifice_value * 10.0 - move.cp_loss - move.win_pct_loss * 5.0
    
    return score


def _promote_t2_to_t1(
    white_moves: List[AnalyzedMove],
    black_moves: List[AnalyzedMove],
) -> List[AnalyzedMove]:
    """
    T2 수 중 조건을 충족하는 (탁월한 희생 수) 수를 T1으로 승격.
    게임당 최대 T1_MAX_PER_GAME개만 승격.
    """
    pool = white_moves + black_moves
    candidates: List[Tuple[float, AnalyzedMove]] = []

    for move in pool:
        score = _t1_candidate_score(move)
        if score > 0.0:  # 점수가 있으면(즉, 탁월한 희생 수라면) 추가
            candidates.append((score, move))

    if not candidates:
        return []

    # 점수 내림차순 정렬, 동점 시 손실 낮은 순
    candidates.sort(key=lambda x: (-x[0], x[1].cp_loss, x[1].win_pct_loss))

    promoted: List[AnalyzedMove] = []
    for score, move in candidates[:T1_MAX_PER_GAME]:
        move.tier = MoveTier.T1
        promoted.append(move)

    return promoted


# ── 기타 유틸 ──────────────────────────────────────────────────────────────

def _material_score(board: chess.Board, color: chess.Color) -> int:
    values = {
        chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
        chess.ROOK: 5, chess.QUEEN: 9,
    }
    return sum(len(board.pieces(pt, color)) * val for pt, val in values.items())


def _detect_sacrifice_on_best_reply(
    board_after_move: chess.Board,
    played_move: chess.Move,
    moving_color: chess.Color,
    after_pv: List[chess.engine.InfoDict],
    captured_value: int = 0,
) -> Tuple[bool, int]:
    """엔진 최선 응수가 내 기물을 잡는지(순수 희생인지) 검사."""
    if not after_pv:
        return (False, 0)
    try:
        pv = after_pv[0].get("pv") or []
        if not pv:
            return (False, 0)
        best_reply = pv[0]
        if not board_after_move.is_capture(best_reply):
            return (False, 0)
            
        # 앙파상인 경우 (단순 폰 희생) 무시
        if board_after_move.is_en_passant(best_reply):
            return (False, 0)
            
        sac_piece = board_after_move.piece_at(best_reply.to_square)
        if sac_piece is None or sac_piece.color != moving_color:
            return (False, 0)
            
        values = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
        sac_value = values.get(sac_piece.piece_type, 0)
        
        # 순수 손실(희생값 계산): 적어도 2점 이상의 기물 손해 발생 시에만 인정
        net_loss = sac_value - captured_value
        if net_loss >= 2:
            return (True, net_loss)
        return (False, 0)
    except Exception:
        return (False, 0)


def _get_score_pov(info: dict, color: chess.Color) -> Optional[int]:
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
    limit = chess.engine.Limit(depth=depth, time=time_limit)
    try:
        info = engine.analyse(board, limit, multipv=top_n)
        results = []
        for rank, pv_info in enumerate(info, 1):
            try:
                score = pv_info["score"].pov(color).score(mate_score=MATE_SCORE)
                if "pv" in pv_info and pv_info["pv"]:
                    mv = pv_info["pv"][0]
                    results.append((mv.uci(), board.san(mv), score, rank))
            except Exception:
                continue
        return results
    except Exception:
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


# ── 오프닝 이론 ────────────────────────────────────────────────────────────

def _compute_opening_theory(pgn_str: str) -> dict:
    try:
        if not opening_db.is_loaded():
            return {}
        game = chess.pgn.read_game(io.StringIO(pgn_str))
        if game is None:
            return {}

        eco_header    = (game.headers.get("ECO")     or "").strip().upper() or None
        opening_header = (game.headers.get("Opening") or "").strip() or None

        def key4(b: chess.Board) -> str:
            return " ".join(b.fen().split()[:4])

        board = game.board()
        node = game
        th_plies = 0
        last_entry: Optional[dict] = None

        while node.variations:
            next_node = node.variations[0]
            board.push(next_node.move)
            entry = opening_db.get_entry_by_epd(key4(board))
            if not entry:
                break
            th_plies += 1
            last_entry = entry
            node = next_node

        if not last_entry or th_plies == 0:
            return {}

        eco_out  = eco_header or last_entry.get("eco")
        name_out = (
            opening_header
            or (opening_db.get_name_by_eco(eco_header) if eco_header else None)
            or (opening_db.get_name_by_eco(last_entry.get("eco")) if last_entry.get("eco") else None)
            or last_entry.get("name")
        )
        return {
            "eco": eco_out,
            "name": name_out,
            "th_plies": th_plies,
            "th_fullmoves": (th_plies + 1) // 2,
        }
    except Exception:
        return {}


# ── 단일 수 분석 (FEN 포함, 스트리밍용) ────────────────────────────────────

def _analyze_single_move_with_fen(
    engine: chess.engine.SimpleEngine,
    board: chess.Board,
    move: chess.Move,
    halfmove: int,
    time_per_move: float = 0.15,
    stockfish_depth: Optional[int] = None,
    prev_multipv: Optional[List[chess.engine.InfoDict]] = None,
) -> Tuple[Optional[AnalyzedMove], List[chess.engine.InfoDict]]:
    moving_color = board.turn
    color_str = "white" if moving_color == chess.WHITE else "black"
    fen_before = board.fen()

    # TF 판정
    is_forced = False
    try:
        legal_moves = list(board.legal_moves)
        if len(legal_moves) == 1:
            is_forced = True
        elif board.is_check() and len(legal_moves) <= 3:
            def _opp_mate_in_one(mv: chess.Move) -> bool:
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
            safe = [mv for mv in legal_moves if not _opp_mate_in_one(mv)]
            if len(safe) == 1 and safe[0] == move:
                is_forced = True
    except Exception:
        is_forced = False

    # Before 평가
    if prev_multipv:
        before_pv = prev_multipv
    else:
        init_limit = chess.engine.Limit(depth=10, time=time_per_move)
        before_pv = engine.analyse(board, init_limit, multipv=3)

    cp_before: Optional[int] = None
    try:
        cp_before = before_pv[0]["score"].pov(moving_color).score(mate_score=MATE_SCORE)
    except Exception:
        pass

    is_garbage_time = cp_before is not None and abs(cp_before) >= 700

    target_depth = stockfish_depth
    if target_depth is not None:
        if is_forced:
            target_depth = min(10, target_depth)
        elif is_garbage_time:
            target_depth = max(12, target_depth - 6)

    # 방금 둔 수가 잡은 기물(교환된 기물) 가치 (Captured piece detection)
    captured_piece = board.piece_at(move.to_square)
    captured_value = 0
    if captured_piece:
        values_map = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
        captured_value = values_map.get(captured_piece.piece_type, 0)
    elif board.is_en_passant(move):
        captured_value = 1

    limit = chess.engine.Limit(depth=target_depth, time=time_per_move)

    user_san = board.san(move)
    user_uci = move.uci()

    board.push(move)
    fen_after = board.fen()
    epd_after = " ".join(fen_after.split()[:4])

    # TH 판정
    is_th = False
    try:
        if opening_db.is_loaded():
            entry = opening_db.get_entry_by_epd(epd_after)
            if entry:
                is_th = True
    except Exception:
        pass

    if is_th and not is_forced:
        th_limit = chess.engine.Limit(depth=8, time=0.03)
        after_pv = engine.analyse(board, th_limit, multipv=3)
    else:
        if target_depth and target_depth >= 14:
            exact_info = engine.analyse(board, limit)
            shallow_time = time_per_move * 0.7 if time_per_move is not None else None
            shallow_limit = chess.engine.Limit(depth=target_depth - 4, time=shallow_time)
            after_pv = engine.analyse(board, shallow_limit, multipv=3)
            if after_pv and "score" in exact_info:
                after_pv[0]["score"] = exact_info["score"]
        else:
            after_pv = engine.analyse(board, limit, multipv=3)

    is_sacrifice, sacrifice_value = _detect_sacrifice_on_best_reply(
        board, move, moving_color,
        after_pv if isinstance(after_pv, list) else [],
        captured_value,
    )

    cp_after: Optional[int] = None
    try:
        cp_after = after_pv[0]["score"].pov(moving_color).score(mate_score=MATE_SCORE)
    except Exception:
        pass

    board.pop()

    cp_loss     = max(0, (cp_before or 0) - (cp_after or 0))
    wpl_before  = _cp_to_win_pct(cp_before)
    wpl_after   = _cp_to_win_pct(cp_after)
    wpl_loss    = max(0.0, wpl_before - wpl_after)

    # 순위 및 유일 최선 판정
    top_moves_raw: List[Tuple[str, str, int, int]] = []
    for rank, pv_info in enumerate(before_pv, 1):
        try:
            score = pv_info["score"].pov(moving_color).score(mate_score=MATE_SCORE)
            if "pv" in pv_info and pv_info["pv"]:
                mv = pv_info["pv"][0]
                top_moves_raw.append((mv.uci(), board.san(mv), score, rank))
        except Exception:
            continue

    user_rank    = 0
    is_only_best = False
    best_gap_cp  = 0

    if top_moves_raw:
        best_cp = top_moves_raw[0][2]
        for uci, san, cp, rank in top_moves_raw:
            if uci == user_uci:
                user_rank = rank
                break
        if len(top_moves_raw) >= 2:
            second_cp    = top_moves_raw[1][2]
            best_gap_cp  = best_cp - second_cp
            if best_gap_cp >= ONLY_BEST_MARGIN_CP and user_rank == 1:
                is_only_best = True
        elif len(top_moves_raw) == 1 and user_rank == 1:
            is_only_best = True

    cp_swing    = (cp_after or 0) - (cp_before or 0)
    is_decisive = _is_decisive_swing(cp_before, cp_after)

    tier = _determine_tier(cp_loss, wpl_loss, user_rank, is_only_best)
    if is_th:
        tier = MoveTier.TH
    if is_forced:
        tier = MoveTier.TF

    top_moves_info = [
        {"uci": uci, "san": san, "cp": cp, "rank": rank}
        for uci, san, cp, rank in top_moves_raw[:3]
    ]

    board.push(move)

    return AnalyzedMove(
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
        win_pct_before=round(wpl_before, 2),
        win_pct_after=round(wpl_after, 2),
        win_pct_loss=round(wpl_loss, 2),
        tier=tier,
        top_moves=top_moves_info,
        user_move_rank=user_rank,
        is_only_best=is_only_best,
        best_gap_cp=best_gap_cp,
        cp_swing=cp_swing,
        is_decisive=is_decisive,
        is_sacrifice=is_sacrifice,
        sacrifice_value=sacrifice_value,
    ), after_pv


def _analyzed_move_to_dict(m: AnalyzedMove) -> dict:
    return {
        "halfmove":       m.halfmove,
        "move_number":    m.move_number,
        "color":          m.color,
        "san":            m.san,
        "uci":            m.uci,
        "fen_before":     m.fen_before,
        "fen_after":      m.fen_after,
        "cp_before":      m.cp_before,
        "cp_after":       m.cp_after,
        "cp_loss":        m.cp_loss,
        "win_pct_before": m.win_pct_before,
        "win_pct_after":  m.win_pct_after,
        "win_pct_loss":   m.win_pct_loss,
        "tier":           m.tier.value,
        "top_moves":      m.top_moves,
        "user_move_rank": m.user_move_rank,
        "is_only_best":   m.is_only_best,
        "best_gap_cp":    m.best_gap_cp,
        "cp_swing":       m.cp_swing,
        "is_decisive":    m.is_decisive,
        "is_sacrifice":   m.is_sacrifice,
        "sacrifice_value":m.sacrifice_value,
    }


# ── 스트리밍 분석 ──────────────────────────────────────────────────────────

def analyze_game_streaming(
    pgn_str: str,
    game_id: str = "",
    stockfish_depth: Optional[int] = None,
    on_init: Optional[Callable] = None,
    on_move: Optional[Callable] = None,
    cancel_event: Optional[threading.Event] = None,
) -> Optional[BothPlayersAnalysisResult]:
    time_per_move = 0.15 if not stockfish_depth else None

    game = chess.pgn.read_game(io.StringIO(pgn_str))
    if game is None:
        logger.warning("Invalid PGN")
        return None

    white_player = game.headers.get("White", "White")
    black_player = game.headers.get("Black", "Black")
    opening_info = _compute_opening_theory(pgn_str)

    total_moves = 0
    tmp_node = game
    while tmp_node.variations:
        total_moves += 1
        tmp_node = tmp_node.variations[0]

    if on_init:
        on_init({
            "total_moves":  total_moves,
            "white_player": white_player,
            "black_player": black_player,
            "opening":      opening_info or {},
        })

    white_moves: List[AnalyzedMove] = []
    black_moves: List[AnalyzedMove] = []

    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            engine.configure({
                "Threads": settings.STOCKFISH_THREADS,
                "Hash":    settings.STOCKFISH_HASH_MB,
            })

            board    = game.board()
            node     = game
            halfmove = 0
            prev_multipv: Optional[List[chess.engine.InfoDict]] = None

            while node.variations:
                if cancel_event is not None and cancel_event.is_set():
                    logger.info("[Game Analysis] cancel_event set; stopping")
                    return None

                next_node    = node.variations[0]
                move         = next_node.move
                moving_color = board.turn

                analyzed, prev_multipv = _analyze_single_move_with_fen(
                    engine, board, move, halfmove,
                    time_per_move, stockfish_depth,
                    prev_multipv=prev_multipv,
                )

                if analyzed:
                    if moving_color == chess.WHITE:
                        white_moves.append(analyzed)
                    else:
                        black_moves.append(analyzed)
                    if on_move:
                        on_move(_analyzed_move_to_dict(analyzed))

                node     = next_node
                halfmove += 1

    except FileNotFoundError:
        logger.error(f"Stockfish not found: {STOCKFISH_PATH}")
        return None
    except Exception as exc:
        logger.exception(f"Game analysis error: {exc}")
        raise

    # T1 승격 (게임 종료 후 일괄 처리)
    promoted_list = _promote_t2_to_t1(white_moves, black_moves)
    if on_move:
        for promoted in promoted_list:
            on_move(_analyzed_move_to_dict(promoted))

    white_analysis = PlayerAnalysisResult(
        username=white_player, color="white",
        total_moves=len(white_moves), analyzed_moves=white_moves,
    )
    black_analysis = PlayerAnalysisResult(
        username=black_player, color="black",
        total_moves=len(black_moves), analyzed_moves=black_moves,
    )

    return BothPlayersAnalysisResult(
        game_id=game_id,
        white_player=white_player,
        black_player=black_player,
        white_analysis=white_analysis,
        black_analysis=black_analysis,
        opening=opening_info or {},
    )


# ── 동기 단일 게임 분석 ────────────────────────────────────────────────────

def analyze_single_game_sync(
    pgn_str: str,
    username: str,
    game_id: str = "",
    time_per_move: float = 0.15,
    time_per_multi: float = 0.10,
) -> Optional[GameAnalysisResult]:
    game = chess.pgn.read_game(io.StringIO(pgn_str))
    if game is None:
        logger.warning("Invalid PGN")
        return None

    white_player = game.headers.get("White", "").lower()
    black_player = game.headers.get("Black", "").lower()
    uname = username.lower()

    if uname == white_player:
        target_color, user_color = chess.WHITE, "white"
    elif uname == black_player:
        target_color, user_color = chess.BLACK, "black"
    elif uname in white_player or white_player in uname:
        target_color, user_color = chess.WHITE, "white"
    elif uname in black_player or black_player in uname:
        target_color, user_color = chess.BLACK, "black"
    else:
        logger.warning(f"User '{username}' not found in game ({white_player} vs {black_player})")
        return None

    analyzed_moves: List[AnalyzedMove] = []

    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            board    = game.board()
            node     = game
            halfmove = 0

            while node.variations:
                next_node    = node.variations[0]
                move         = next_node.move
                moving_color = board.turn

                if moving_color == target_color:
                    # TF 판정
                    try:
                        lm = list(board.legal_moves)
                        is_forced = len(lm) == 1
                    except Exception:
                        is_forced = False

                    info_before = engine.analyse(board, chess.engine.Limit(time=time_per_move))
                    cp_before   = _get_score_pov(info_before, moving_color)
                    user_san    = board.san(move)
                    user_uci    = move.uci()

                    board.push(move)
                    info_after = engine.analyse(board, chess.engine.Limit(time=time_per_move))
                    cp_after   = _get_score_pov(info_after, moving_color)

                    cp_loss  = max(0, (cp_before or 0) - (cp_after or 0))
                    wpl_b    = _cp_to_win_pct(cp_before)
                    wpl_a    = _cp_to_win_pct(cp_after)
                    wpl_loss = max(0.0, wpl_b - wpl_a)

                    board.pop()
                    top_moves_raw = _get_top_moves(engine, board, moving_color, time_per_multi, top_n=5)
                    board.push(move)

                    user_rank    = 0
                    is_only_best = False
                    best_gap_cp  = 0

                    if top_moves_raw:
                        best_cp = top_moves_raw[0][2]
                        for uci, san, cp, rank in top_moves_raw:
                            if uci == user_uci:
                                user_rank = rank
                                break
                        if len(top_moves_raw) >= 2:
                            second_cp   = top_moves_raw[1][2]
                            best_gap_cp = best_cp - second_cp
                            if best_gap_cp >= ONLY_BEST_MARGIN_CP and user_rank == 1:
                                is_only_best = True
                        elif len(top_moves_raw) == 1 and user_rank == 1:
                            is_only_best = True

                    cp_swing    = (cp_after or 0) - (cp_before or 0)
                    is_decisive = _is_decisive_swing(cp_before, cp_after)
                    tier        = _determine_tier(cp_loss, wpl_loss, user_rank, is_only_best)
                    if is_forced:
                        tier = MoveTier.TF

                    top_moves_info = [
                        {"uci": uci, "san": san, "cp": cp, "rank": rank}
                        for uci, san, cp, rank in top_moves_raw[:5]
                    ]

                    analyzed_moves.append(AnalyzedMove(
                        halfmove=halfmove,
                        move_number=halfmove // 2 + 1,
                        color="white" if moving_color == chess.WHITE else "black",
                        san=user_san, uci=user_uci,
                        cp_before=cp_before, cp_after=cp_after, cp_loss=cp_loss,
                        win_pct_before=round(wpl_b, 2),
                        win_pct_after=round(wpl_a, 2),
                        win_pct_loss=round(wpl_loss, 2),
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

                node     = next_node
                halfmove += 1

    except FileNotFoundError:
        logger.error(f"Stockfish not found: {STOCKFISH_PATH}")
        return None
    except Exception as exc:
        logger.exception(f"Game analysis error: {exc}")
        return None

    # T1 승격
    _promote_t2_to_t1(analyzed_moves, [])

    return GameAnalysisResult(
        game_id=game_id,
        username=username,
        user_color=user_color,
        total_moves=len(analyzed_moves),
        analyzed_moves=analyzed_moves,
    )