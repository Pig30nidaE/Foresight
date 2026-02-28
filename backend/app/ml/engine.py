"""
Stockfish UCI 엔진 래퍼
────────────────────────────────────────────────────
python-chess chess.engine 모듈 사용 (동기 API)
asyncio.run_in_executor 로 비동기 호출

각 수에 대해 반환:
  - 수 전/후 센티폰 평가 (두는 플레이어 관점)
  - 센티폰 손실
  - 승률(0~100) 전/후 (Chess.com 방식 환산)
  - 승률 손실 (분류 기준)
"""
from __future__ import annotations

import io
import math
import shutil
import logging
from dataclasses import dataclass
from typing import List, Optional

import chess
import chess.pgn
import chess.engine

logger = logging.getLogger(__name__)

# ── Stockfish 경로 자동 탐색 ──────────────────────────────
STOCKFISH_PATH: str = (
    shutil.which("stockfish")
    or "/opt/homebrew/bin/stockfish"
    or "/usr/local/bin/stockfish"
    or "/usr/bin/stockfish"
)

# 메이트 점수 대체값 (센티폰)
MATE_SCORE = 10_000

# 기본 수당 분석 시간 (초)
DEFAULT_TIME_PER_MOVE: float = 0.1


# ── 데이터 모델 ──────────────────────────────────────────────

@dataclass
class MoveEval:
    halfmove: int               # 전체 반수 인덱스 (0-based)
    move_number: int            # 수 번호 (1-based)
    color: str                  # "white" | "black"
    san: str                    # 표준 체스 표기
    cp_before: Optional[int]    # 수 전 센티폰 (두는 색 관점)
    cp_after: Optional[int]     # 수 후 센티폰 (두는 색 관점)
    cp_loss: int                # max(0, cp_before - cp_after)
    win_pct_before: float       # 수 전 승률 0~100
    win_pct_after: float        # 수 후 승률 0~100
    win_pct_loss: float         # 승률 손실 (분류 기준, ≥ 0)


# ── 유틸리티 ─────────────────────────────────────────────────

def _cp_to_win_pct(cp: Optional[int]) -> float:
    """센티폰 → 승률(0~100). Chess.com 공식과 동일."""
    if cp is None:
        return 50.0
    capped = max(-MATE_SCORE, min(MATE_SCORE, cp))
    return 50.0 + 50.0 * (2.0 / (1.0 + math.exp(-0.00368208 * capped)) - 1.0)


def _get_score_pov(info: dict, color: chess.Color) -> Optional[int]:
    """engine.analyse 결과에서 지정 색 관점 센티폰 반환."""
    try:
        return info["score"].pov(color).score(mate_score=MATE_SCORE)
    except Exception:
        return None


# ── 핵심 분석 함수 ────────────────────────────────────────────

def analyze_game_sync(
    pgn_str: str,
    username: str,
    time_per_move: float = DEFAULT_TIME_PER_MOVE,
) -> List[MoveEval]:
    """
    단일 PGN 게임을 Stockfish로 분석하여 수별 평가 목록 반환.

    동기 함수이므로 FastAPI 에서는 반드시:
        loop.run_in_executor(None, analyze_game_sync, pgn, username)
    형태로 호출해야 한다.
    """
    game = chess.pgn.read_game(io.StringIO(pgn_str))
    if game is None:
        return []

    white_player = game.headers.get("White", "").lower()
    black_player = game.headers.get("Black", "").lower()
    uname = username.lower()

    if uname == white_player:
        target_color = chess.WHITE
    elif uname == black_player:
        target_color = chess.BLACK
    else:
        # 이름 부분 일치 시도 (e.g. Chess.com 접두사 차이)
        if any(uname in p for p in [white_player, black_player]):
            target_color = chess.WHITE if uname in white_player else chess.BLACK
        else:
            logger.debug(f"Player '{username}' not found in game ({white_player} vs {black_player})")
            return []

    results: List[MoveEval] = []

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
                    # ─ 수 전 평가 ─
                    san = board.san(move)           # push 전에 SAN 생성
                    info_before = engine.analyse(
                        board,
                        chess.engine.Limit(time=time_per_move),
                    )
                    cp_before = _get_score_pov(info_before, moving_color)

                    # ─ 수 실행 ─
                    board.push(move)

                    # ─ 수 후 평가 (두었던 색 관점으로 통일) ─
                    info_after = engine.analyse(
                        board,
                        chess.engine.Limit(time=time_per_move),
                    )
                    cp_after = _get_score_pov(info_after, moving_color)

                    cp_loss = max(0, (cp_before or 0) - (cp_after or 0))
                    wpl_before = _cp_to_win_pct(cp_before)
                    wpl_after  = _cp_to_win_pct(cp_after)

                    results.append(MoveEval(
                        halfmove=halfmove,
                        move_number=halfmove // 2 + 1,
                        color="white" if moving_color == chess.WHITE else "black",
                        san=san,
                        cp_before=cp_before,
                        cp_after=cp_after,
                        cp_loss=cp_loss,
                        win_pct_before=round(wpl_before, 2),
                        win_pct_after=round(wpl_after, 2),
                        win_pct_loss=round(max(0.0, wpl_before - wpl_after), 2),
                    ))
                else:
                    board.push(move)

                node = next_node
                halfmove += 1

    except FileNotFoundError:
        logger.error(f"Stockfish 바이너리를 찾을 수 없습니다: {STOCKFISH_PATH}")
        return []
    except Exception as exc:
        logger.warning(f"Stockfish 분석 중 오류 발생: {exc}")
        return []

    return results
