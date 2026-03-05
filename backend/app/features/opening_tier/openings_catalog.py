"""
오프닝 카탈로그
===============
ECO 코드 기반 주요 오프닝 목록 (UCI 수 순서 포함).
python-chess를 사용하여 각 오프닝 포지션의 FEN을 생성하는 데 사용됩니다.

UCI 표기법: <from><to> (예: "e2e4", "g1f3", "e1g1" = 킹사이드 캐슬링)
"""
from __future__ import annotations

import logging
from typing import List, Optional, TypedDict

import chess

logger = logging.getLogger(__name__)


class OpeningEntry(TypedDict):
    eco: str
    name: str
    moves: List[str]  # UCI 형식


# 주요 오프닝 카탈로그 (A~E ECO 시리즈, 60+ 오프닝)
OPENINGS_CATALOG: List[OpeningEntry] = [
    # ── A 시리즈 (1.c4, 1.Nf3, 비정규 오프닝) ──────────────────────
    {"eco": "A00", "name": "Starting Position",          "moves": []},
    {"eco": "A10", "name": "English Opening",            "moves": ["c2c4"]},
    {"eco": "A20", "name": "English: 1...e5",            "moves": ["c2c4", "e7e5"]},
    {"eco": "A30", "name": "English: Symmetrical",       "moves": ["c2c4", "c7c5"]},
    {"eco": "A45", "name": "Indian Defense",             "moves": ["d2d4", "g8f6"]},
    {"eco": "A46", "name": "Indian: London System",      "moves": ["d2d4", "g8f6", "g1f3"]},
    # ── B 시리즈 (1.e4 응답: 시실리언, 카로칸, 스칸디나비안 등) ─────
    {"eco": "B00", "name": "King's Pawn Game",           "moves": ["e2e4"]},
    {"eco": "B01", "name": "Scandinavian Defense",       "moves": ["e2e4", "d7d5"]},
    {"eco": "B02", "name": "Alekhine's Defense",         "moves": ["e2e4", "g8f6"]},
    {"eco": "B06", "name": "Modern Defense",             "moves": ["e2e4", "g7g6"]},
    {"eco": "B07", "name": "Pirc Defense",               "moves": ["e2e4", "d7d6", "d2d4", "g8f6"]},
    {"eco": "B10", "name": "Caro-Kann Defense",          "moves": ["e2e4", "c7c6"]},
    {"eco": "B12", "name": "Caro-Kann: Advance",         "moves": ["e2e4", "c7c6", "d2d4", "d7d5", "e4e5"]},
    {"eco": "B13", "name": "Caro-Kann: Exchange",        "moves": ["e2e4", "c7c6", "d2d4", "d7d5", "e4d5", "c6d5"]},
    {"eco": "B15", "name": "Caro-Kann: Main Line",       "moves": ["e2e4", "c7c6", "d2d4", "d7d5", "b1c3"]},
    {"eco": "B20", "name": "Sicilian Defense",           "moves": ["e2e4", "c7c5"]},
    {"eco": "B23", "name": "Sicilian: Closed",           "moves": ["e2e4", "c7c5", "b1c3"]},
    {"eco": "B30", "name": "Sicilian: Old Sicilian",     "moves": ["e2e4", "c7c5", "g1f3", "b8c6"]},
    {"eco": "B40", "name": "Sicilian: 2.Nf3 e6",         "moves": ["e2e4", "c7c5", "g1f3", "e7e6"]},
    {"eco": "B50", "name": "Sicilian: 2.Nf3 d6",         "moves": ["e2e4", "c7c5", "g1f3", "d7d6"]},
    {"eco": "B54", "name": "Sicilian: Dragon",           "moves": ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "g7g6"]},
    {"eco": "B60", "name": "Sicilian: Scheveningen",     "moves": ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "e7e6"]},
    {"eco": "B90", "name": "Sicilian: Najdorf",          "moves": ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"]},
    # ── C 시리즈 (1.e4 e5 킹스폰 계열, 프렌치) ─────────────────────
    {"eco": "C00", "name": "French Defense",             "moves": ["e2e4", "e7e6"]},
    {"eco": "C02", "name": "French: Advance",            "moves": ["e2e4", "e7e6", "d2d4", "d7d5", "e4e5"]},
    {"eco": "C10", "name": "French: Classical",          "moves": ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3"]},
    {"eco": "C20", "name": "King's Pawn: 1.e4 e5",       "moves": ["e2e4", "e7e5"]},
    {"eco": "C30", "name": "King's Gambit",              "moves": ["e2e4", "e7e5", "f2f4"]},
    {"eco": "C40", "name": "King's Knight Opening",      "moves": ["e2e4", "e7e5", "g1f3"]},
    {"eco": "C41", "name": "Philidor Defense",           "moves": ["e2e4", "e7e5", "g1f3", "d7d6"]},
    {"eco": "C42", "name": "Petrov's Defense",           "moves": ["e2e4", "e7e5", "g1f3", "g8f6"]},
    {"eco": "C44", "name": "Scotch Game",                "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4"]},
    {"eco": "C45", "name": "Scotch: Main Line",          "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4", "f3d4"]},
    {"eco": "C46", "name": "Three Knights Game",         "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3"]},
    {"eco": "C47", "name": "Four Knights Game",          "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3", "g8f6"]},
    {"eco": "C50", "name": "Italian Game",               "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"]},
    {"eco": "C55", "name": "Two Knights Defense",        "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"]},
    {"eco": "C60", "name": "Ruy Lopez",                  "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"]},
    {"eco": "C65", "name": "Ruy Lopez: Berlin Defense",  "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "g8f6"]},
    {"eco": "C78", "name": "Ruy Lopez: Morphy Defense",  "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6"]},
    {"eco": "C80", "name": "Ruy Lopez: Open Variation",  "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f6e4"]},
    {"eco": "C90", "name": "Ruy Lopez: Closed",          "moves": ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7"]},
    # ── D 시리즈 (1.d4 d5) ─────────────────────────────────────────
    {"eco": "D00", "name": "Queen's Pawn Game",          "moves": ["d2d4", "d7d5"]},
    {"eco": "D02", "name": "London System",              "moves": ["d2d4", "d7d5", "g1f3", "g8f6", "c1f4"]},
    {"eco": "D06", "name": "Queen's Gambit",             "moves": ["d2d4", "d7d5", "c2c4"]},
    {"eco": "D10", "name": "Slav Defense",               "moves": ["d2d4", "d7d5", "c2c4", "c7c6"]},
    {"eco": "D20", "name": "Queen's Gambit Accepted",    "moves": ["d2d4", "d7d5", "c2c4", "d5c4"]},
    {"eco": "D30", "name": "Queen's Gambit Declined",    "moves": ["d2d4", "d7d5", "c2c4", "e7e6"]},
    {"eco": "D37", "name": "QGD: 4.Nf3",                "moves": ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "g1f3"]},
    {"eco": "D43", "name": "Semi-Slav Defense",          "moves": ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "g1f3", "c7c6"]},
    {"eco": "D50", "name": "QGD: 4.Bg5",                "moves": ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5"]},
    {"eco": "D80", "name": "Grunfeld Defense",           "moves": ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5"]},
    {"eco": "D85", "name": "Grunfeld: Exchange",         "moves": ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5", "c4d5", "f6d5", "e2e4", "d5c3", "b2c3", "f8g7"]},
    # ── E 시리즈 (1.d4 Nf6: 인디안 디펜스 계열) ────────────────────
    {"eco": "E00", "name": "Catalan Opening",            "moves": ["d2d4", "g8f6", "c2c4", "e7e6", "g2g3"]},
    {"eco": "E10", "name": "Queen's Indian Defense",     "moves": ["d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "b7b6"]},
    {"eco": "E20", "name": "Nimzo-Indian Defense",       "moves": ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4"]},
    {"eco": "E60", "name": "King's Indian Defense",      "moves": ["d2d4", "g8f6", "c2c4", "g7g6"]},
    {"eco": "E80", "name": "KID: Samisch Variation",     "moves": ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "f2f3"]},
]


def generate_fen(moves: List[str]) -> Optional[str]:
    """UCI 수 목록으로 python-chess 보드를 재현하여 FEN 반환.

    Args:
        moves: UCI 형식 수 목록 (예: ["e2e4", "e7e5"])

    Returns:
        FEN 문자열, 유효하지 않은 수가 있으면 None
    """
    board = chess.Board()
    try:
        for uci in moves:
            board.push(chess.Move.from_uci(uci))
    except (ValueError, chess.InvalidMoveError) as exc:
        logger.warning("generate_fen: invalid move sequence %s — %s", moves, exc)
        return None
    return board.fen()
