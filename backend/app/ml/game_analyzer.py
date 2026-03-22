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

# Brilliant 후보 임계
BRILLIANT_SWING_CP = 60           # comeback: -60→0 스윙이면 충분 (기존 120은 불가능한 요구값)
BRILLIANT_SWING_WIN_PCT = 7.0     # 승률 7% 개선 (기존 12.0 → 완화)
BRILLIANT_COMEBACK_BEFORE_CP = -60  # 불리한 상태 기준 완화 (기존 -80)
BRILLIANT_COMEBACK_AFTER_CP = 0     # 균형화로도 충분 (기존 20)
BRILLIANT_SACRIFICE_CP_IMPROVE = 25 # 희생 후 0.25폰 개선으로도 인정 (기존 70)


def _compute_accuracy(analyzed_moves: list) -> float:
    """
    per-move accuracy의 조화평균으로 게임 정확도 계산 (Lichess 방식)

    - 각 수마다: acc_i = 103.1668 * exp(-0.04354 * wpl_i) - 3.1669
    - 조화평균: n / sum(1 / acc_i) → 블런더에 더 민감하게 반응
    - TH(이론수) 제외: wpl≈0 이므로 acc≈100, 포함 시 인위적으로 정확도 상승

    avg_wpl을 공식에 직접 대입하면 Jensen 부등식(볼록 함수)으로 인해
    실제 값보다 항상 높게 계산되는 오류가 있으므로 이 방식으로 대체.
    """
    # TH(이론수), TF(강제수)는 정확도 계산에서 제외
    non_th = [
        m
        for m in analyzed_moves
        if getattr(m, "tier", None) is not None and m.tier.value not in ("TH", "TF")
    ]
    if not non_th:
        return 0.0
    accs = [
        max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * m.win_pct_loss) - 3.1669))
        for m in non_th
    ]
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
    MoveTier.T1: {"label": "브릴리언트", "emoji": "!!", "color": "#22c55e", "description": "역전/희생급 명수"},
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

    정의(간단/안전):
    - 시작 포지션에서부터 게임 수순을 한 수씩 진행하며, 해당 포지션(EPD)이 오프닝 DB에 존재하는 동안만 '이론수'로 간주.
    - 첫 미스매치가 나오면 중단. (연속 구간)
    - PGN 헤더의 ECO가 있으면, TH/오프닝 이름은 그 ECO를 기준으로 맞춥니다.
    - 마지막으로 매칭된 엔트리의 name/eco를 '오프닝 라인'으로 반환.
    """
    try:
        if not opening_db.is_loaded():
            return {}

        game = chess.pgn.read_game(io.StringIO(pgn_str))
        if game is None:
            return {}

        # chess.com 등 외부에서 제공하는 ECO가 있다면 그걸 기준으로 오프닝명을 통일합니다.
        # (EPD 매칭만으로는 같은 포지션이라도 다른 변형명이 매칭될 수 있음)
        eco_header = (game.headers.get("ECO") or "").strip().upper() or None
        opening_header = (game.headers.get("Opening") or "").strip() or None
        canonical_eco = eco_header

        # 오프닝 이름 우선순위: PGN [Opening] 헤더(플랫폼 제공명) > ECO DB 이름
        # 전적 검색에서 표시하는 이름(플랫폼 API 제공)과 동일하게 맞추기 위해 헤더 우선.
        canonical_name = opening_header or (
            opening_db.get_name_by_eco(canonical_eco)
            if canonical_eco
            else None
        )

        def key4(b: chess.Board) -> str:
            # Use FEN 4-field key to match lichess openings EPD keys robustly
            return " ".join(b.fen().split()[:4])

        def walk(require_eco: Optional[str]) -> tuple[int, Optional[dict]]:
            """
            th_plies와 마지막 매칭 엔트리를 반환합니다.

            - require_eco가 있으면, entry.eco가 require_eco와 다르면 즉시 중단
            - require_eco가 없으면, 첫 매칭 엔트리의 eco를 current_eco로 두고 동일 eco 내부에서만 확장
            """
            board = game.board()
            node = game
            th_plies_local = 0
            last_entry_local: Optional[dict] = None
            current_eco_local: Optional[str] = None

            while node.variations:
                next_node = node.variations[0]
                move = next_node.move
                board.push(move)
                entry = opening_db.get_entry_by_epd(key4(board))
                if not entry:
                    break

                if require_eco is not None:
                    if entry.get("eco") != require_eco:
                        break
                else:
                    if current_eco_local is None:
                        current_eco_local = entry.get("eco")
                    elif entry.get("eco") != current_eco_local:
                        break

                th_plies_local += 1
                last_entry_local = entry
                node = next_node

            return th_plies_local, last_entry_local

        # 1) ECO 헤더 기반(강제) 시도
        if canonical_eco:
            th_plies, last_entry = walk(canonical_eco)
            if last_entry and th_plies > 0:
                th_fullmoves = (th_plies + 1) // 2
                return {
                    "eco": canonical_eco,
                    "name": canonical_name or last_entry.get("name"),
                    "th_plies": th_plies,
                    "th_fullmoves": th_fullmoves,
                }

            # 2) 실패 시 기존 방식으로 TH 유지 (이름만 ECO에 맞춰 교정)
            th_plies, last_entry = walk(None)
            if not last_entry or th_plies == 0:
                return {}

            eco_out = last_entry.get("eco")
            # 표시용 오프닝명: PGN [Opening] 헤더(플랫폼명) > ECO DB 이름
            name_out = (
                canonical_name
                or (opening_db.get_name_by_eco(eco_out) if eco_out else None)
                or last_entry.get("name")
            )

            th_fullmoves = (th_plies + 1) // 2
            return {
                "eco": eco_out,
                "name": name_out,
                "th_plies": th_plies,
                "th_fullmoves": th_fullmoves,
            }

        # ECO 헤더가 없는 경우: 기존 방식만 사용
        th_plies, last_entry = walk(None)
        if not last_entry or th_plies == 0:
            return {}

        eco_out = last_entry.get("eco")
        # PGN [Opening] 헤더 우선, 없으면 DB 이름
        name_out = (
            opening_header
            or (opening_db.get_name_by_eco(eco_out) if eco_out else None)
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


def _is_brilliant_candidate(
    *,
    base_tier: MoveTier,
    cp_before: Optional[int],
    cp_after: Optional[int],
    win_pct_before: float,
    win_pct_after: float,
    material_before: int,
    material_after: int,
) -> bool:
    """
    T1 Brilliant 승급 판단.

    comeback (T2만 해당):
      - 불리한 상태(cp_before ≤ BRILLIANT_COMEBACK_BEFORE_CP)에서
        균형/역전(cp_after ≥ BRILLIANT_COMEBACK_AFTER_CP)으로 전환
      - cp 개선 또는 승률 개선이 임계 이상

    sacrifice_brilliant (T2 또는 T3):
      - 기물을 희생한 뒤 평가가 유의미하게 개선된 경우
      - Stockfish 낮은 깊이에서 희생수가 2위로 평가될 수 있어 T3도 허용
    """
    if base_tier not in (MoveTier.T2, MoveTier.T3):
        return False

    before = cp_before if cp_before is not None else 0
    after = cp_after if cp_after is not None else 0
    cp_swing = after - before
    win_swing = win_pct_after - win_pct_before
    sacrificed = material_after < material_before

    # comeback: 정밀한 수만 해당 (T2 전용)
    comeback = (
        base_tier == MoveTier.T2
        and before <= BRILLIANT_COMEBACK_BEFORE_CP
        and after >= BRILLIANT_COMEBACK_AFTER_CP
        and (cp_swing >= BRILLIANT_SWING_CP or win_swing >= BRILLIANT_SWING_WIN_PCT)
    )
    # 희생 브릴리언트: T2 또는 T3 (낮은 깊이 분석에서 희생수가 2위로 평가될 수 있음)
    sacrifice_brilliant = sacrificed and (cp_swing >= BRILLIANT_SACRIFICE_CP_IMPROVE or win_swing >= BRILLIANT_SWING_WIN_PCT)
    return comeback or sacrifice_brilliant


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
                            if best_cp - second_cp >= ONLY_BEST_MARGIN_CP and user_rank == 1:
                                is_only_best = True
                        elif len(top_moves_raw) == 1 and user_rank == 1:
                            is_only_best = True
                    
                    # 등급 결정
                    tier = _determine_tier(
                        cp_loss, win_pct_loss, user_rank, is_only_best
                    )

                    if is_forced:
                        tier = MoveTier.TF
                    
                    # 상위 수 정보 정리
                    top_moves_info = [
                        {"san": san, "cp": cp, "rank": rank}
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
    opening_eco: Optional[str] = None,
    prev_multipv: Optional[List[chess.engine.InfoDict]] = None,
) -> Tuple[Optional[AnalyzedMove], List[chess.engine.InfoDict]]:
    """
    단일 수 분석 (FEN 포함)

    ── 핵심 최적화: analyse_after(multipv=3) 결과를 다음 수의 analyse_before로 재사용 ──
    원래 수당 엔진 호출 2회(analyse_after + 별도 MultiPV)에서 1회로 절감.

    prev_multipv: 직전 수의 analyse_after(multipv=3) 결과 리스트.
                  이 포지션 = 현재 수의 before 포지션이므로:
                    - [0]["score"].pov(moving_color) → cp_before
                    - [i]["pv"][0] → top moves for ranking
    Returns: (AnalyzedMove | None, after_multipv: List[InfoDict])
    """
    moving_color = board.turn
    color_str = "white" if moving_color == chess.WHITE else "black"

    fen_before = board.fen()
    material_before = _material_score(board, moving_color)

    # TF 판정
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

    limit = chess.engine.Limit(depth=stockfish_depth, time=time_per_move)

    # ① Before 포지션: prev_multipv 재사용 or 최초 수면 직접 분석
    if prev_multipv:
        before_pv = prev_multipv
    else:
        before_pv = engine.analyse(board, limit, multipv=3)

    cp_before: Optional[int] = None
    try:
        cp_before = before_pv[0]["score"].pov(moving_color).score(mate_score=MATE_SCORE)
    except Exception:
        pass

    user_san = board.san(move)
    user_uci = move.uci()

    # ② After 포지션: multipv=3으로 분석 (다음 수의 before로 재사용)
    board.push(move)
    fen_after = board.fen()
    material_after = _material_score(board, moving_color)
    epd_after = " ".join(fen_after.split()[:4])

    # TH 조기 종료: 이론수가 확실하면 cheap depth로 충분 (cp 표시용만)
    is_th = False
    try:
        if opening_db.is_loaded():
            entry = opening_db.get_entry_by_epd(epd_after)
            if entry and (opening_eco is None or entry.get("eco") == opening_eco):
                is_th = True
    except Exception:
        pass

    if is_th and not is_forced:
        # TH: cp 표시용 최소 분석 + multipv=3 (다음 수 재사용용)
        th_limit = chess.engine.Limit(depth=8, time=0.03)
        after_pv = engine.analyse(board, th_limit, multipv=3)
    else:
        after_pv = engine.analyse(board, limit, multipv=3)

    cp_after: Optional[int] = None
    try:
        cp_after = after_pv[0]["score"].pov(moving_color).score(mate_score=MATE_SCORE)
    except Exception:
        pass

    board.pop()  # before 포지션으로 복원 (SAN 계산용)

    # 손실 계산
    cp_loss = max(0, (cp_before or 0) - (cp_after or 0))
    win_pct_before = _cp_to_win_pct(cp_before)
    win_pct_after = _cp_to_win_pct(cp_after)
    win_pct_loss = max(0.0, win_pct_before - win_pct_after)

    # ③ 순위: before_pv (현재 before 포지션의 multipv 결과) 에서 추출
    #    별도 엔진 호출 없이 재사용
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

    if top_moves_raw:
        best_cp = top_moves_raw[0][2]
        for uci, san, cp, rank in top_moves_raw:
            if uci == user_uci:
                user_rank = rank
                break
        if len(top_moves_raw) >= 2:
            second_cp = top_moves_raw[1][2]
            if best_cp - second_cp >= ONLY_BEST_MARGIN_CP and user_rank == 1:
                is_only_best = True
        elif len(top_moves_raw) == 1 and user_rank == 1:
            is_only_best = True

    # 등급 결정
    tier = _determine_tier(cp_loss, win_pct_loss, user_rank, is_only_best)
    if _is_brilliant_candidate(
        base_tier=tier,
        cp_before=cp_before,
        cp_after=cp_after,
        win_pct_before=win_pct_before,
        win_pct_after=win_pct_after,
        material_before=material_before,
        material_after=material_after,
    ):
        tier = MoveTier.T1

    if is_th:
        tier = MoveTier.TH
    if is_forced:
        tier = MoveTier.TF

    top_moves_info = [
        {"san": san, "cp": cp, "rank": rank}
        for _, san, cp, rank in top_moves_raw[:3]
    ]

    board.push(move)  # after 포지션으로 복원 (호출자와 상태 동기화)

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
    )
    return analyzed_move, after_pv


def analyze_game_streaming(
    pgn_str: str,
    game_id: str = "",
    stockfish_depth: Optional[int] = None,
    on_init: Optional[Callable] = None,
    on_move: Optional[Callable] = None,
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

    Returns:
        BothPlayersAnalysisResult (요약 통계 포함)
    """
    # depth 미지정(None)이면 시간 기반 분석
    time_per_move = 0.15 if not stockfish_depth else None

    game = chess.pgn.read_game(io.StringIO(pgn_str))
    if game is None:
        logger.warning("Invalid PGN")
        return None

    white_player = game.headers.get("White", "White")
    black_player = game.headers.get("Black", "Black")

    opening_info = _compute_opening_theory(pgn_str)
    opening_eco = opening_info.get("eco") if isinstance(opening_info, dict) else None

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
                    opening_eco=opening_eco,
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
    }
