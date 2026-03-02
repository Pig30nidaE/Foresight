"""
PGN 파싱 서비스 (python-chess 기반)
────────────────────────────────────────────────────
각 수마다:
  - 수 표기 (SAN)
  - 시계 잔여 시간 `{[%clk H:MM:SS]}` 파싱
  - 소비 시간 계산
  - 색상 (white/black)
  - 수 번호

게임 페이즈 분류:
  - opening : 수 1~10
  - middlegame : 수 11~30
  - endgame : 수 31+
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

import chess
import chess.pgn
import io

# ── 정규식 ─────────────────────────────────────────────────
_RE_CLK = re.compile(r"\[%clk\s+(\d+):(\d{2}):(\d{2})\]")
_RE_EMT = re.compile(r"\[%emt\s+(\d+):(\d{2}):(\d{2})\]")  # elapsed move time


def _clk_to_seconds(hours: str, minutes: str, seconds: str) -> float:
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def _parse_clock(comment: str) -> Optional[float]:
    """PGN 코멘트에서 잔여 시계(초) 추출."""
    m = _RE_CLK.search(comment or "")
    if m:
        return _clk_to_seconds(*m.groups())
    return None


def _parse_emt(comment: str) -> Optional[float]:
    """%emt(elapsed move time) 추출 — Lichess 포맷."""
    m = _RE_EMT.search(comment or "")
    if m:
        return _clk_to_seconds(*m.groups())
    return None


# ── 데이터 모델 ──────────────────────────────────────────────

@dataclass
class MoveData:
    move_number: int          # 수 번호 (1-based, 양 색 공유)
    halfmove: int             # 반수 인덱스 (0-based)
    color: str                # "white" | "black"
    san: str                  # Standard Algebraic Notation
    clock_after: Optional[float]   # 수 후 잔여 시간(초)
    time_spent: Optional[float]    # 소비 시간(초)
    phase: str                # "opening" | "middlegame" | "endgame"
    is_time_pressure: bool    # True if clock_after < pressure_threshold


@dataclass
class ParsedGame:
    game_id: str
    white: str
    black: str
    result: str               # "1-0" | "0-1" | "1/2-1/2" | "*"
    time_control: Optional[str]
    eco: Optional[str]
    opening: Optional[str]
    total_moves: int          # 반수 수
    moves: List[MoveData] = field(default_factory=list)

    # ── 집계 필드 ────────────────────────────────────────────
    white_time_pressure_moves: int = 0
    black_time_pressure_moves: int = 0
    avg_time_spent_white: Optional[float] = None
    avg_time_spent_black: Optional[float] = None
    time_pressure_ratio_white: float = 0.0   # 0~1
    time_pressure_ratio_black: float = 0.0


# ── 파서 ────────────────────────────────────────────────────

def _phase(halfmove: int) -> str:
    move_num = halfmove // 2 + 1
    if move_num <= 10:
        return "opening"
    if move_num <= 30:
        return "middlegame"
    return "endgame"


def parse_pgn(
    pgn_str: str,
    game_id: str = "",
    pressure_threshold: float = 30.0,   # 잔여 30초 미만 = 시간 압박
) -> Optional[ParsedGame]:
    """PGN 문자열 → ParsedGame. 파싱 실패 시 None 반환."""
    if not pgn_str:
        return None

    try:
        game = chess.pgn.read_game(io.StringIO(pgn_str))
    except Exception:
        return None

    if game is None:
        return None

    headers = game.headers
    white = headers.get("White", "?")
    black = headers.get("Black", "?")
    result = headers.get("Result", "*")
    time_control = headers.get("TimeControl")
    eco = headers.get("ECO")
    opening = headers.get("Opening")

    moves: List[MoveData] = []
    board = game.board()

    # 이전 시계 값 (백/흑 각각)
    prev_clock: dict[str, Optional[float]] = {"white": None, "black": None}

    for node in game.mainline():
        color = "white" if board.turn == chess.WHITE else "black"
        # node.move 적용 전 board.turn 으로 현재 색 판단
        # (node는 수 적용 후 상태이므로 부모에서 turn 확인)
        san = board.san(node.move)
        halfmove = board.ply()  # 0-based, 수 적용 전 반수
        move_number = halfmove // 2 + 1

        comment = node.comment or ""
        clock_after = _parse_clock(comment)
        emt = _parse_emt(comment)

        # 소비 시간 계산
        if emt is not None:
            time_spent: Optional[float] = emt
        elif clock_after is not None and prev_clock[color] is not None:
            time_spent = prev_clock[color] - clock_after
            if time_spent < 0:
                time_spent = None  # 시간 증가분(딜레이/인크리먼트)은 무시
        else:
            time_spent = None

        is_pressure = (clock_after is not None and clock_after < pressure_threshold)

        moves.append(MoveData(
            move_number=move_number,
            halfmove=halfmove,
            color=color,
            san=san,
            clock_after=clock_after,
            time_spent=time_spent,
            phase=_phase(halfmove),
            is_time_pressure=is_pressure,
        ))

        prev_clock[color] = clock_after
        board.push(node.move)

    if not moves:
        return None

    total = len(moves)

    # ── 집계 ────────────────────────────────────────────────
    white_moves = [m for m in moves if m.color == "white"]
    black_moves = [m for m in moves if m.color == "black"]

    def _avg_time(lst: List[MoveData]) -> Optional[float]:
        vals = [m.time_spent for m in lst if m.time_spent is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    def _pressure_ratio(lst: List[MoveData]) -> float:
        if not lst:
            return 0.0
        clocked = [m for m in lst if m.clock_after is not None]
        if not clocked:
            return 0.0
        n = sum(1 for m in clocked if m.is_time_pressure)
        return round(n / len(clocked), 4)

    wp = sum(1 for m in white_moves if m.is_time_pressure)
    bp = sum(1 for m in black_moves if m.is_time_pressure)

    return ParsedGame(
        game_id=game_id,
        white=white,
        black=black,
        result=result,
        time_control=time_control,
        eco=eco,
        opening=opening,
        total_moves=total,
        moves=moves,
        white_time_pressure_moves=wp,
        black_time_pressure_moves=bp,
        avg_time_spent_white=_avg_time(white_moves),
        avg_time_spent_black=_avg_time(black_moves),
        time_pressure_ratio_white=_pressure_ratio(white_moves),
        time_pressure_ratio_black=_pressure_ratio(black_moves),
    )


def parse_games_bulk(
    game_summaries: list,          # List[GameSummary]  pgn 필드 포함
    pressure_threshold: float = 30.0,
) -> List[ParsedGame]:
    """
    GameSummary 목록에서 PGN이 있는 게임만 파싱.
    pgn 없는 게임은 조용히 스킵.
    """
    results: List[ParsedGame] = []
    for gs in game_summaries:
        pgn = getattr(gs, "pgn", None)
        if not pgn:
            continue
        parsed = parse_pgn(pgn, game_id=gs.game_id, pressure_threshold=pressure_threshold)
        if parsed:
            results.append(parsed)
    return results
