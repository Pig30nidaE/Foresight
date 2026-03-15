"""
개별 게임 분석기 (T1~T5 등급 체계)
────────────────────────────────────────────────────
Stockfish 기반 개별 게임 수 품질 분석

T1: 엔진 추천수이며, 해당 포지션에서 유저가 유리해지는 유일한 최선수
T2: 엔진 1순위 추천수 (T1과의 평가 차이가 미미한 경우도 포함)
T3: 엔진 2~3순위 추천수
T4: 엔진 추천 상위 수에 없지만 평가가 크게 달라지지 않는 수 (≤30% 승률 손실)
T5: 수를 둔 후 평가가 크게 하락하는 수 (>30% 승률 손실)
"""
from __future__ import annotations

import io
import math
import shutil
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from enum import Enum

import chess
import chess.pgn
import chess.engine

logger = logging.getLogger(__name__)

STOCKFISH_PATH: str = (
    shutil.which("stockfish")
    or "/opt/homebrew/bin/stockfish"
    or "/usr/local/bin/stockfish"
    or "/usr/bin/stockfish"
)

MATE_SCORE = 10_000


class MoveTier(Enum):
    """수 품질 등급 T1~T5"""
    T1 = "T1"  # 유일 최선수
    T2 = "T2"  # 엔진 1순위 추천
    T3 = "T3"  # 엔진 2~3순위 추천
    T4 = "T4"  # 무난한 수 (약간의 승률 손실)
    T5 = "T5"  # 큰 실수 (큰 승률 손실)


# 등급별 메타데이터 (UI 표시용)
TIER_META = {
    MoveTier.T1: {"label": "최상", "emoji": "★", "color": "#10b981", "description": "유일한 최선수"},
    MoveTier.T2: {"label": "우수", "emoji": "✓", "color": "#34d399", "description": "엔진 1순위 추천"},
    MoveTier.T3: {"label": "양호", "emoji": "○", "color": "#6ee7b7", "description": "엔진 2~3순위 추천"},
    MoveTier.T4: {"label": "보통", "emoji": "△", "color": "#fbbf24", "description": "무난한 수"},
    MoveTier.T5: {"label": "불량", "emoji": "✗", "color": "#ef4444", "description": "큰 실수"},
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
        
        # Chess.com 방식 정확도 (승률 손실 기반)
        avg_wpl = sum(m.win_pct_loss for m in self.analyzed_moves) / total
        self.accuracy = round(
            max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * avg_wpl) - 3.1669)), 1
        )


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
        
        # Chess.com 방식 정확도 (승률 손실 기반)
        avg_wpl = sum(m.win_pct_loss for m in self.analyzed_moves) / total
        self.accuracy = round(
            max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * avg_wpl) - 3.1669)), 1
        )


@dataclass
class BothPlayersAnalysisResult:
    """양쪽 플레이어 분석 결과"""
    game_id: str
    white_player: str
    black_player: str
    white_analysis: PlayerAnalysisResult
    black_analysis: PlayerAnalysisResult


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
    top_n: int = 5
) -> List[Tuple[str, str, int, int]]:
    """
    Stockfish로 상위 N개 수 분석
    
    Returns: [(uci, san, cp_score, rank), ...]
    """
    # 멀티 PV 모드로 설정
    try:
        # limit 정보를 설정
        limit = chess.engine.Limit(time=time_limit)
        
        # 분석 실행 (MultiPV를 이용해 여러 수 분석)
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
        # 폴백: 단일 분석
        try:
            info = engine.analyse(board, chess.engine.Limit(time=time_limit))
            score = _get_score_pov(info, color)
            if score is not None:
                # best move 정보 가져오기
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
    top_moves: List[Tuple[str, str, int, int]],
    user_uci: str
) -> MoveTier:
    """
    T1~T5 등급 결정
    
    T1: 유일한 최선수 (is_only_best가 True이며 user_rank == 1)
    T2: 엔진 1순위 추천 (user_rank == 1)
    T3: 엔진 2~3순위 추천 (2 <= user_rank <= 3)
    T4: 순위권外지만 승률 손실 ≤ 30%
    T5: 승률 손실 > 30%
    """
    # T5: 큰 실수 (승률 손실 > 30%)
    if user_win_pct_loss > 30.0:
        return MoveTier.T5
    
    # T1: 유일한 최선수
    if is_only_best and user_rank == 1:
        return MoveTier.T1
    
    # T2: 엔진 1순위 추천
    if user_rank == 1:
        return MoveTier.T2
    
    # T3: 엔진 2~3순위 추천
    if 2 <= user_rank <= 3:
        return MoveTier.T3
    
    # T4: 순위권外지만 승률 손실이 적은 수
    return MoveTier.T4


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
                        # 2순위와의 평가 차이가 30센티폰 이상이면 유일한 최선수로 간주
                        if len(top_moves_raw) >= 2:
                            second_cp = top_moves_raw[1][2]
                            if best_cp - second_cp > 30 and user_rank == 1:
                                is_only_best = True
                        elif len(top_moves_raw) == 1 and user_rank == 1:
                            is_only_best = True
                    
                    # 등급 결정
                    tier = _determine_tier(
                        cp_loss, win_pct_loss, user_rank, is_only_best, top_moves_raw, user_uci
                    )
                    
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
    time_per_multi: float = 0.10,
) -> Optional[AnalyzedMove]:
    """
    단일 수 분석 (FEN 포함) - 보드 상태를 수정하지 않음
    """
    moving_color = board.turn
    color_str = "white" if moving_color == chess.WHITE else "black"
    
    # 수 전 FEN 저장
    fen_before = board.fen()
    
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
    fen_after = board.fen()
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
    
    # 상위 수 분석 (MultiPV) - 보드 복원 후 분석
    board.pop()
    top_moves_raw = _get_top_moves(
        engine, board, moving_color, time_per_multi, top_n=5
    )
    
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
        if len(top_moves_raw) >= 2:
            second_cp = top_moves_raw[1][2]
            if best_cp - second_cp > 30 and user_rank == 1:
                is_only_best = True
        elif len(top_moves_raw) == 1 and user_rank == 1:
            is_only_best = True
    
    # 등급 결정
    tier = _determine_tier(
        cp_loss, win_pct_loss, user_rank, is_only_best, top_moves_raw, user_uci
    )
    
    # 상위 수 정보 정리
    top_moves_info = [
        {"san": san, "cp": cp, "rank": rank}
        for uci, san, cp, rank in top_moves_raw[:5]
    ]
    
    # 보드 상태를 원래대로 유지 (호출자가 push/pop 관리)
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
        win_pct_before=round(win_pct_before, 2),
        win_pct_after=round(win_pct_after, 2),
        win_pct_loss=round(win_pct_loss, 2),
        tier=tier,
        top_moves=top_moves_info,
        user_move_rank=user_rank,
        is_only_best=is_only_best,
    )


def analyze_both_players_sync(
    pgn_str: str,
    game_id: str = "",
    time_per_move: float = 0.15,
    time_per_multi: float = 0.10,
) -> Optional[BothPlayersAnalysisResult]:
    """
    양쪽 플레이어 모두 T1~T5 등급으로 분석
    
    Args:
        pgn_str: 게임 PGN 문자열
        game_id: 게임 ID
        time_per_move: 수별 기본 분석 시간
        time_per_multi: 멀티PV 분석 시간 (상위 수 분석용)
    
    Returns:
        BothPlayersAnalysisResult 또는 None (분석 실패 시)
    """
    game = chess.pgn.read_game(io.StringIO(pgn_str))
    if game is None:
        logger.warning("Invalid PGN")
        return None
    
    # 플레이어 이름 추출
    white_player = game.headers.get("White", "White")
    black_player = game.headers.get("Black", "Black")
    
    white_moves: List[AnalyzedMove] = []
    black_moves: List[AnalyzedMove] = []
    
    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            board = game.board()
            node = game
            halfmove = 0
            
            while node.variations:
                next_node = node.variations[0]
                move = next_node.move
                moving_color = board.turn
                
                # 모든 수 분석 (양쪽 모두)
                analyzed = _analyze_single_move_with_fen(
                    engine, board, move, halfmove, time_per_move, time_per_multi
                )
                
                if analyzed:
                    if moving_color == chess.WHITE:
                        white_moves.append(analyzed)
                    else:
                        black_moves.append(analyzed)
                
                board.push(move)
                node = next_node
                halfmove += 1
    
    except FileNotFoundError:
        logger.error(f"Stockfish not found: {STOCKFISH_PATH}")
        return None
    except Exception as exc:
        logger.exception(f"Game analysis error: {exc}")
        return None
    
    # 결과 생성
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
    )
