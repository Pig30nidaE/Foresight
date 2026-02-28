"""
수 품질 분류기
────────────────────────────────────────────────────
Stockfish 센티폰 평가를 기반으로 각 수를:
  Best / Excellent / Good / Inaccuracy / Mistake / Blunder
로 분류하고 게임별·전체 통계를 집계한다.

분류 기준: Chess.com 방식과 유사하게 승률 손실(win% loss) 사용
  Best       ≤  5%
  Excellent  ≤ 10%
  Good       ≤ 20%
  Inaccuracy ≤ 40%
  Mistake    ≤ 70%
  Blunder    > 70%

정확도: 103.1668 × exp(-0.04354 × avg_win_pct_loss) - 3.1669  (Chess.com 공식)
"""
from __future__ import annotations

import math
import logging
from dataclasses import dataclass, field
from typing import List, Optional

from app.ml.engine import MoveEval, analyze_game_sync

logger = logging.getLogger(__name__)


# ── 분류 임계값 (win% loss 기준) ─────────────────────────────

THRESHOLDS: list[tuple[str, float, float]] = [
    ("Best",       0.0,  5.0),
    ("Excellent",  5.0, 10.0),
    ("Good",      10.0, 20.0),
    ("Inaccuracy",20.0, 40.0),
    ("Mistake",   40.0, 70.0),
    ("Blunder",   70.0, 101.0),
]

# UI 메타데이터 (색상은 MoveQualityDonut 와 동기화)
CATEGORY_META: dict[str, dict] = {
    "Best":       {"emoji": "✅", "color": "#10b981"},
    "Excellent":  {"emoji": "👍", "color": "#34d399"},
    "Good":       {"emoji": "🆗", "color": "#6ee7b7"},
    "Inaccuracy": {"emoji": "⚡", "color": "#f59e0b"},
    "Mistake":    {"emoji": "❌", "color": "#f97316"},
    "Blunder":    {"emoji": "💀", "color": "#ef4444"},
}


# ── 결과 데이터 모델 ─────────────────────────────────────────

@dataclass
class CategoryResult:
    category: str
    emoji: str
    color: str
    count: int
    percentage: float


@dataclass
class MoveQualityStats:
    username: str
    platform: str
    time_class: str
    games_analyzed: int
    total_moves: int
    accuracy: float                      # 0~100, Chess.com 방식
    acpl: float                          # 평균 센티폰 손실
    categories: List[CategoryResult] = field(default_factory=list)


# ── 유틸리티 ─────────────────────────────────────────────────

def classify_move(win_pct_loss: float) -> str:
    """승률 손실(0~100) → 수 품질 범주."""
    for category, lo, hi in THRESHOLDS:
        if lo <= win_pct_loss < hi:
            return category
    return "Blunder"


def accuracy_from_avg_wpl(avg_wpl: float) -> float:
    """Chess.com 방식 정확도 공식 (0~100 클리핑)."""
    raw = 103.1668 * math.exp(-0.04354 * avg_wpl) - 3.1669
    return round(max(0.0, min(100.0, raw)), 1)


def _empty_stats(username: str, platform: str, time_class: str) -> MoveQualityStats:
    return MoveQualityStats(
        username=username,
        platform=platform,
        time_class=time_class,
        games_analyzed=0,
        total_moves=0,
        accuracy=0.0,
        acpl=0.0,
        categories=[
            CategoryResult(
                category=cat,
                emoji=CATEGORY_META[cat]["emoji"],
                color=CATEGORY_META[cat]["color"],
                count=0,
                percentage=0.0,
            )
            for cat, _, _ in THRESHOLDS
        ],
    )


# ── 핵심 집계 함수 ────────────────────────────────────────────

def analyze_games_sync(
    games: list,            # List[GameSummary] — pgn 필드 필요
    username: str,
    max_games: int = 5,
    time_per_move: float = 0.1,
    platform: str = "chess.com",
    time_class: str = "bullet",
) -> MoveQualityStats:
    """
    여러 게임을 순차 분석하여 수 품질 통계를 집계한다.
    동기 함수 — FastAPI 에서는 run_in_executor 로 호출.
    """
    counts: dict[str, int] = {cat: 0 for cat, _, _ in THRESHOLDS}
    total_cp_loss: float = 0.0
    total_wpl: float = 0.0
    total_moves: int = 0
    games_analyzed: int = 0

    valid = [g for g in games if g.pgn][:max_games]
    if not valid:
        logger.warning(f"PGN이 있는 {time_class} 게임이 없습니다 ({username})")
        return _empty_stats(username, platform, time_class)

    for game in valid:
        evals: List[MoveEval] = analyze_game_sync(
            game.pgn, username, time_per_move=time_per_move
        )
        if not evals:
            logger.debug(f"게임 {game.game_id} 분석 결과 없음 (username 불일치?)")
            continue

        for ev in evals:
            cat = classify_move(ev.win_pct_loss)
            counts[cat] += 1
            total_cp_loss += ev.cp_loss
            total_wpl += ev.win_pct_loss
            total_moves += 1

        games_analyzed += 1
        logger.info(f"[{username}] 게임 {games_analyzed}/{len(valid)} 분석 완료 ({len(evals)} 수)")

    if total_moves == 0:
        logger.warning(f"분석된 수가 없습니다 ({username})")
        return _empty_stats(username, platform, time_class)

    avg_wpl = total_wpl / total_moves
    accuracy = accuracy_from_avg_wpl(avg_wpl)
    acpl = round(total_cp_loss / total_moves, 1)

    categories = [
        CategoryResult(
            category=cat,
            emoji=CATEGORY_META[cat]["emoji"],
            color=CATEGORY_META[cat]["color"],
            count=counts[cat],
            percentage=round(counts[cat] / total_moves * 100, 1),
        )
        for cat, _, _ in THRESHOLDS
    ]

    return MoveQualityStats(
        username=username,
        platform=platform,
        time_class=time_class,
        games_analyzed=games_analyzed,
        total_moves=total_moves,
        accuracy=accuracy,
        acpl=acpl,
        categories=categories,
    )
