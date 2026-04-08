"""
수 품질 분류기
────────────────────────────────────────────────────
Stockfish 센티폰 평가를 기반으로 각 수를:
  Best / Excellent / Good / Inaccuracy / Mistake / Blunder
로 분류하고 게임별·전체 통계를 집계한다.

분류 기준: Chess.com 방식과 동일하게 승률 손실(win% loss) 사용
  Best       wpl ≤  2%
  Excellent  wpl ≤  5%
  Good       wpl ≤ 10%
  Inaccuracy wpl ≤ 20%
  Mistake    wpl ≤ 50%
  Blunder    wpl > 50%

정확도: 103.1668 × exp(-0.04354 × avg_wpl) - 3.1669  (Chess.com 원본 공식)
  → avg_wpl: TH(이론수)/TF(강제수) 제외한 수의 wpl 산술평균
  → 조화평균·엔진랭킹 혼합 방식 제거 (Chess.com 실측치와 편차 발생 원인)

[수정 내역]
- 분류 기준 wpl 상한을 Chess.com 실측치 기반으로 재보정
  (기존: Best≤5%, Excellent≤10%, ... 이 기준은 wpl 분포를 Blunder 쪽으로 과도하게 밀어냄)
- 정확도 공식을 순수 avg_wpl → Chess.com 공식으로 단순화
- analyze_games_sync 에서도 동일 기준 적용
"""
from __future__ import annotations

import math
import logging
from dataclasses import dataclass, field
from typing import List, Optional

from app.ml.engine import MoveEval, analyze_game_sync

logger = logging.getLogger(__name__)


# ── 분류 임계값 (Chess.com win% loss 기준으로 재보정) ────────────────────
#
# Chess.com 공개 기준:
#   Best       wpl ≤  2%   (사실상 완벽한 수)
#   Excellent  wpl ≤  5%   (매우 좋은 수)
#   Good       wpl ≤ 10%   (좋은 수)
#   Inaccuracy wpl ≤ 20%   (다소 아쉬운 수)
#   Mistake    wpl ≤ 50%   (실수)
#   Blunder    wpl > 50%   (큰 실수)
#
# 기존 코드의 Best≤5% / Excellent≤10% 기준은 Chess.com보다 2~3배 엄격했기 때문에
# 대부분의 수가 Inaccuracy~Blunder 구간으로 분류되고 정확도가 낮게 나왔습니다.

THRESHOLDS: list[tuple[str, float, float]] = [
    ("Best",        0.0,   2.0),
    ("Excellent",   2.0,   5.0),
    ("Good",        5.0,  10.0),
    ("Inaccuracy", 10.0,  20.0),
    ("Mistake",    20.0,  50.0),
    ("Blunder",    50.0, 101.0),
]

CATEGORY_META: dict[str, dict] = {
    "Best":       {"emoji": "★",  "color": "#10b981"},
    "Excellent":  {"emoji": "!",  "color": "#34d399"},
    "Good":       {"emoji": "⊙",  "color": "#6ee7b7"},
    "Inaccuracy": {"emoji": "?!", "color": "#f59e0b"},
    "Mistake":    {"emoji": "?",  "color": "#f97316"},
    "Blunder":    {"emoji": "??", "color": "#ef4444"},
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
    """
    Chess.com 원본 정확도 공식 (0~100 클리핑).
    avg_wpl: TH/TF 제외 수의 win% loss 산술평균.
    """
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
    games: list,
    username: str,
    max_games: int = 5,
    time_per_move: float = 0.1,
    platform: str = "chess.com",
    time_class: str = "bullet",
) -> MoveQualityStats:
    """
    여러 게임을 순차 분석하여 수 품질 통계를 집계한다.
    동기 함수 — FastAPI 에서는 run_in_executor 로 호출.

    정확도 계산:
      - TH(이론수) / TF(강제수) 표시된 수는 wpl 집계에서 제외
        (wpl ≈ 0인 수를 포함하면 정확도가 인위적으로 높아짐)
      - 나머지 수의 wpl 산술평균 → Chess.com 공식 적용
    """
    counts: dict[str, int] = {cat: 0 for cat, _, _ in THRESHOLDS}
    total_cp_loss: float = 0.0
    total_wpl: float = 0.0
    total_moves: int = 0       # 정확도 계산 포함 수 (TH/TF 제외)
    total_moves_all: int = 0   # 전체 수 (ACPL 계산용)
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
            logger.debug(f"게임 {game.game_id} 분석 결과 없음")
            continue

        for ev in evals:
            cat = classify_move(ev.win_pct_loss)
            counts[cat] += 1
            total_cp_loss += ev.cp_loss
            total_moves_all += 1

            # TH/TF 수는 정확도 wpl 집계에서 제외
            tier_val = getattr(ev, "tier", None)
            is_skip = tier_val is not None and (
                (hasattr(tier_val, "value") and tier_val.value in ("TH", "TF"))
                or str(tier_val) in ("TH", "TF")
            )
            if not is_skip:
                total_wpl += ev.win_pct_loss
                total_moves += 1

        games_analyzed += 1
        logger.info(f"[{username}] 게임 {games_analyzed}/{len(valid)} 분석 완료 ({len(evals)} 수)")

    if total_moves_all == 0:
        logger.warning(f"분석된 수가 없습니다 ({username})")
        return _empty_stats(username, platform, time_class)

    # 정확도: TH/TF 제외 수 기준 avg_wpl → Chess.com 공식
    avg_wpl  = (total_wpl / total_moves) if total_moves > 0 else 0.0
    accuracy = accuracy_from_avg_wpl(avg_wpl)
    acpl     = round(total_cp_loss / total_moves_all, 1)

    categories = [
        CategoryResult(
            category=cat,
            emoji=CATEGORY_META[cat]["emoji"],
            color=CATEGORY_META[cat]["color"],
            count=counts[cat],
            percentage=round(counts[cat] / total_moves_all * 100, 1),
        )
        for cat, _, _ in THRESHOLDS
    ]

    return MoveQualityStats(
        username=username,
        platform=platform,
        time_class=time_class,
        games_analyzed=games_analyzed,
        total_moves=total_moves_all,
        accuracy=accuracy,
        acpl=acpl,
        categories=categories,
    )