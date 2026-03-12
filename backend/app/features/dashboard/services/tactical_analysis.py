"""
전술 패턴 분석 서비스 — MVP.md 20가지 상황 전체 구현
========================================================
스택:
  - python-chess   : PGN 파싱 + 보드 구조 분석
  - Stockfish 18   : cp_loss 기반 블런더 탐지 / 희생·우위 유지 정확도
  - pandas/NumPy   : Feature 정형화·전처리
  - scikit-learn   : K-Means 게임 스타일 군집화
  - XGBoost        : 블런더 리스크 피처 중요도 분류 (data-leakage-free)

MVP.md 상황 번호 ↔ 패턴 매핑
──────────────────────────────────────────────────────────
  § 1. 전술적 취약점 분석
    상황 1  [Pin]       핀된 기물 무리한 이동률 (board)
    상황 2  [Fork]      나이트 포크 위협 회피율 (board)
    상황 3  [Sacrifice] Stockfish cp_loss 기반 기물 희생 정확도

  § 2. 시간 관리 및 심리적 요소
    상황 4  [TimeTrouble]   잔여 60s → Stockfish 블런더율 회귀
    상황 5  [Tilt]          역전패 후 다음 게임 승률
    상황 6  [CriticalPos]   Stockfish cp 급변 순간 시간 소모 vs 수 품질

  § 3. 오프닝 및 엔드게임 레퍼토리
    상황 7  [OppCastle]  반대 방향 캐슬링 난전 승률 (board)
    상황 8  [OutOfBook]  오프닝 이탈 직후 5수 Stockfish 품질
    상황 9  [Endgame]    퀸 교환 후 엔드게임 전환 승률
    상황 10 [IQP]        고립 퀸 폰(IQP) 구조 승률 (board)

  § 4. 수의 품질 및 평가 지표
    상황 11 [BishopPair] 비숍 쌍 20수 유지 승률 (board)
    상황 12 [DiscAtk]    발견 공격 활용률 (board)
    상황 13 [Defense]    Stockfish −2 이하 불리 상황 오버턴 비율

  § 5. 게임 흐름 및 포지션 복잡성
    상황 14 [Complexity] 3기물+ 동시 공격 상황 개선율 (board)
    상황 15 [QueenXchg]  퀸 교환 타이밍 Stockfish 평가 변화
    상황 16 [KingSafety] 폰 쉴드 파괴 후 블런더 빈도 (board)
    상황 17 [Space]      폰 수 우위 상황에서 승률 (board)

  § 6. 상대 플레이어와의 상호작용
    상황 18 [RatingGap]    상대 레이팅 구간별 수 품질 변화 (프록시)
    상황 19 [InstaMove]    3s 이내 즉각 응수 비율 vs 블런더율 (emt)
    상황 20 [MutualBlunder] Stockfish 상대 블런더 직후 응징 성공률

  + 보너스: 흑백 밸런스, 오프닝 레퍼토리 준비도
──────────────────────────────────────────────────────────
"""
from __future__ import annotations

import io
import logging
import os
import re
import threading
import time
from copy import deepcopy
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import List, Optional, Dict, Any, Tuple

import numpy as np
import pandas as pd
import chess
import chess.pgn
import chess.engine
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import xgboost as xgb

from app.models.schemas import GameSummary

logger = logging.getLogger(__name__)

# ── 상수 ──────────────────────────────────────────────────────
STOCKFISH_PATH = "/opt/homebrew/bin/stockfish"
STRENGTH_THRESHOLD = 55
SF_DEPTH = 8            # 10→8: blitz 분석에 충분, 속도 2-3배 개선
SF_BUDGET_GAMES = 15    # 25→15: 엔진 분석 대상 게임 수 축소
SF_BUDGET_MOVES = 30    # 40→30: 중반까지만 분석
BOARD_BUDGET_GAMES = 80  # 120→80: 보드 루프 게임 수 축소
# 우위 유지력(_p_advantage_throw) 전용 SF 예산
# 더 많은 게임을 20수까지만 depth 6으로 분석 → 충분한 우위게임 샘플 확보
SF_ADV_BUDGET_GAMES = 80  # board_games와 동일하게 맞춤
SF_ADV_BUDGET_MOVES = 50  # 희생 수가 중반 이후에도 발생하므로 40→50수로 확대
SF_ADV_DEPTH = 6          # 속도 우선 (cp_before/after 값만 필요하므로 충분)
BLUNDER_CP = 150   # centipawn 손실 ≥150 → 블런더 (하위 호환 유지)
SF_PARALLEL_WORKERS = 4  # 병렬 Stockfish 인스턴스 수 (CPU 코어 수 초과 권장 안 함)
SF_CACHE_TTL_SEC = 60 * 60 * 6
ANALYSIS_CACHE_TTL_SEC = 60 * 10

# 사용자 요청으로 제거된 패턴 라벨 목록
REMOVED_PATTERN_LABELS = {
    "높은 긴장도 대처",
    "퀸 교환 후 이해도",
    "폰 승급 레이스",
    "킹 헌트 마무리",
    "킹 안전도 관리",
    "불리 포지션 방어력",
}

# ── 수 품질 6단계 가중치 (체스닷컴 분류 근사, cp_loss 기준) ──────────────
# cp_loss = prev_cp − cp_now (음수 = 내 입장에서 포지션이 개선됨 = Best)
# 구간: Best / Excellent / Good / Inaccuracy / Mistake / Blunder
_CP_WEIGHT_TIERS: list[tuple[float, float]] = [
    (  5.0,  +2.0),   # Best       (0−5 cp 손실)  : 거의 최선수
    ( 20.0,  +1.0),   # Excellent  (5−20 cp 손실) : 아주 좋은 수
    ( 50.0,  +0.3),   # Good       (20−50 cp)     : 무난한 수
    (100.0,  -0.5),   # Inaccuracy (50−100 cp)    : 부정확
    (200.0,  -1.5),   # Mistake    (100−200 cp)   : 실수
    (float("inf"), -3.0),  # Blunder (200+ cp)    : 블런더
]


def _move_weight(cp_loss: float) -> float:
    """cp_loss → 수 품질 가중치 (음수 포함; Best=+2.0, Blunder=−3.0)."""
    # 음수 cp_loss = 포지션 개선 → 최선수 취급
    for thr, w in _CP_WEIGHT_TIERS:
        if cp_loss < thr:
            return w
    return -3.0


def _game_quality_score(sf_moves: list) -> float:
    """
    게임 sf_moves에서 내 수(is_my_move=True)의 가중 품질 점수 ÷ 내 수 수.
    양수 → 전반적으로 좋은 플레이, 음수 → 전반적으로 나쁜 플레이.
    데이터 없으면 0.0 반환.
    """
    my_moves = [m for m in sf_moves if m.get("is_my_move")]
    if not my_moves:
        return 0.0
    return sum(_move_weight(float(m.get("cp_loss", 0))) for m in my_moves) / len(my_moves)


def _quality_score_slice(
    sf_moves: list,
    move_min: int = 1,
    move_max: int = 9999,
) -> float:
    """특정 수 번호 구간 [move_min, move_max] 내 내 수의 가중 품질 점수."""
    sliced = [
        m for m in sf_moves
        if m.get("is_my_move")
        and move_min <= m.get("move_no", 0) <= move_max
    ]
    if not sliced:
        return 0.0
    return sum(_move_weight(float(m.get("cp_loss", 0))) for m in sliced) / len(sliced)

# ── 시계 파싱 ────────────────────────────────────────────────
_RE_CLK = re.compile(r"\[%clk\s+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)\]")
_RE_EMT = re.compile(r"\[%emt\s+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)\]")


def _clk_sec(h: str, m: str, s: str) -> float:
    return int(h) * 3600 + int(m) * 60 + float(s)


def _parse_clock(comment: str) -> Optional[float]:
    mt = _RE_CLK.search(comment or "")
    return _clk_sec(*mt.groups()) if mt else None


def _parse_emt(comment: str) -> Optional[float]:
    mt = _RE_EMT.search(comment or "")
    return _clk_sec(*mt.groups()) if mt else None


def _estimate_total_moves(pgn: str) -> int:
    nums = re.findall(r"(\d+)\.", pgn or "")
    return int(nums[-1]) if nums else 0


def _parse_game(pgn_str: str) -> Optional[chess.pgn.Game]:
    try:
        return chess.pgn.read_game(io.StringIO(pgn_str))
    except Exception:
        return None


# ── 결과 모델 ─────────────────────────────────────────────────
@dataclass
class PatternResult:
    label: str
    description: str
    icon: str
    score: int        # 0–100
    is_strength: bool
    games_analyzed: int
    detail: str
    category: str     # time | position | opening | endgame | balance
    situation_id: int = 0   # MVP.md 상황 번호 (1–20, 0=보너스)
    # ── ML 해석 필드 (신규) ──────────────────────────────────────────
    insight: str = ""              # ML 유도 해석 문장 (핵심 발견 1줄)
    key_metric_value: Optional[float] = None   # 핵심 수치 (63.2)
    key_metric_label: str = ""     # 수치 레이블 ("평균 CP 손실")
    key_metric_unit: str = ""      # 단위 ("cp" | "%" | "수" | "초" | "회")
    evidence_count: int = 0        # 실제 탐지된 사례 수 (패턴 발생 횟수)
    # ── 내부 필드 (직렬화 제외) ─────────────────────────────────────
    example_game: Optional[dict] = None
    representative_games: Optional[List[Tuple[Any, float]]] = None
    example_hint: Optional[str] = None
    # ── streak 추이 차트 데이터 ──────────────────────────────────────
    chart_data: Optional[dict] = None
    # ── 데이터 부족 플래그 (분석 임계치 미달) ────────────────────────
    insufficient_data: bool = False


def _to_dict(p: PatternResult) -> dict:
    d = {k: getattr(p, k) for k in
            ("label", "description", "icon", "score",
             "is_strength", "games_analyzed", "detail", "category",
             "situation_id", "example_game",
             "insight", "key_metric_value", "key_metric_label", "key_metric_unit",
             "evidence_count", "chart_data", "insufficient_data")}
    # example_hint를 example_game 내부에 삽입
    if d["example_game"] and p.example_hint:
        d["example_game"] = {**d["example_game"], "hint": p.example_hint}
    # 대표 게임 상위 8개 직렬화 (패턴 모달 표시용)
    # representative_games 항목은 2-튜플 (game, weight) 또는
    # 3-튜플 (game, weight, extra_dict) 두 형식 모두 지원
    if p.representative_games:
        top_limit = 16 if p.situation_id == 3 else 8
        top = sorted(p.representative_games, key=lambda x: x[1], reverse=True)[:top_limit]
        games_out = []
        for item in top:
            g = item[0]
            extra: dict = item[2] if len(item) > 2 and item[2] else {}
            if not g.url:
                continue
            games_out.append({
                "url":          g.url,
                "result":       g.result.value,
                "is_success":   extra.get("is_success", g.result.value == "win"),
                "advantage_outcome": extra.get("advantage_outcome"),
                "metric_value": extra.get("metric_value"),
                "metric_label": extra.get("metric_label"),
                "context":      extra.get("context"),
                "sac_tier":     extra.get("sac_tier"),
                "opening_eco":  g.opening_eco,
                "opening_name": g.opening_name,
                "played_at":    g.played_at,
                "white":        g.white,
                "black":        g.black,
                "pgn":                extra.get("pgn"),
                "sacrifice_move_no":  extra.get("sacrifice_move_no"),
                "sacrifice_color":    extra.get("sacrifice_color"),
            })
        d["top_games"] = games_out
    else:
        d["top_games"] = []
    return d


def _win_rate(games: List[GameSummary], username: str) -> float:
    if not games:
        return 0.0
    w = sum(1 for g in games if g.result.value == "win")
    return round(w / len(games) * 100, 1)


def _binary_classification_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """이진 분류 핵심 지표를 % 단위로 계산한다."""
    if len(y_true) == 0:
        return {
            "accuracy": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "f1": 0.0,
            "baseline_accuracy": 0.0,
            "support_pos": 0,
            "support_neg": 0,
            "positive_rate": 0.0,
        }

    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))

    precision = (tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = (tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    accuracy = (tp + tn) / len(y_true)

    support_pos = int(np.sum(y_true == 1))
    support_neg = int(np.sum(y_true == 0))
    positive_rate = support_pos / len(y_true)
    baseline = max(positive_rate, 1.0 - positive_rate)

    return {
        "accuracy": round(accuracy * 100, 1),
        "precision": round(precision * 100, 1),
        "recall": round(recall * 100, 1),
        "f1": round(f1 * 100, 1),
        "baseline_accuracy": round(baseline * 100, 1),
        "support_pos": support_pos,
        "support_neg": support_neg,
        "positive_rate": round(positive_rate * 100, 1),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stockfish 헬퍼
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class StockfishHelper:
    def __init__(self, path: str = STOCKFISH_PATH):
        self.path = path
        self._available = os.path.exists(path)
        self._eval_cache: Dict[Tuple[str, str, int, int], Tuple[float, List[Dict]]] = {}
        self._cache_lock = threading.Lock()

    @property
    def available(self) -> bool:
        return self._available

    def _eval_one(
        self,
        engine: chess.engine.SimpleEngine,
        pgn_str: str,
        username: str,
        max_moves: int = SF_BUDGET_MOVES,
        depth: int = SF_DEPTH,
    ) -> List[Dict]:
        """이미 열린 엔진으로 게임 1개 분석 (내부용)."""
        game = _parse_game(pgn_str)
        if not game:
            return []
        white_name = game.headers.get("White", "").lower()
        black_name = game.headers.get("Black", "").lower()
        uname = username.lower()
        results = []
        board = game.board()
        prev_cp: Optional[float] = None
        try:
            for node in list(game.mainline())[: max_moves * 2]:
                if board.is_game_over():
                    break
                info = engine.analyse(
                    board,
                    chess.engine.Limit(depth=depth),
                    info=chess.engine.INFO_SCORE,
                )
                score = info.get("score")
                if score is None:
                    prev_cp = None
                    try:
                        board.push(node.move)
                    except Exception:
                        break
                    continue
                rel = score.relative
                if rel.is_mate():
                    cp_now = 2000.0 if (rel.mate() > 0) else -2000.0
                else:
                    cp_now = float(rel.cp or 0)
                move_side = board.turn
                is_my_move = (
                    (move_side == chess.WHITE and white_name == uname)
                    or (move_side == chess.BLACK and black_name == uname)
                )
                cp_loss = 0.0
                is_blunder = False
                if prev_cp is not None and is_my_move:
                    cp_loss = prev_cp - cp_now
                    is_blunder = cp_loss >= BLUNDER_CP
                results.append({
                    "move_no": board.fullmove_number,
                    "color": "white" if move_side == chess.WHITE else "black",
                    "is_my_move": is_my_move,
                    "cp_before": prev_cp,
                    "cp_after": cp_now,
                    "cp_loss": cp_loss,
                    "is_blunder": is_blunder,
                    "clk": _parse_clock(node.comment or ""),
                })
                prev_cp = -cp_now
                try:
                    board.push(node.move)
                except Exception:
                    break
        except Exception:
            pass
        return results

    def eval_batch(
        self,
        games: List,
        username: str,
        max_moves: int = SF_BUDGET_MOVES,
        depth: int = SF_DEPTH,
    ) -> Dict[str, List[Dict]]:
        """N개 Stockfish 인스턴스를 병렬로 열어 게임 배치 분석. {game_id: [moves]}."""
        if not self._available:
            return {}

        games_with_pgn = [g for g in games if g.pgn]
        if not games_with_pgn:
            return {}

        now = time.monotonic()
        uname = username.lower()
        combined: Dict[str, List[Dict]] = {}
        misses: List = []
        with self._cache_lock:
            for g in games_with_pgn:
                key = (g.game_id, uname, max_moves, depth)
                cached = self._eval_cache.get(key)
                if cached and (now - cached[0]) <= SF_CACHE_TTL_SEC:
                    combined[g.game_id] = cached[1]
                else:
                    misses.append(g)

        if not misses:
            return combined

        n_workers = min(SF_PARALLEL_WORKERS, len(misses))
        # 라운드-로빈으로 게임을 n_workers 청크로 균등 분배
        chunks: List[List] = [[] for _ in range(n_workers)]
        for i, g in enumerate(misses):
            chunks[i % n_workers].append(g)

        sf_path = self.path

        def _eval_chunk(chunk: List) -> Dict[str, List[Dict]]:
            chunk_result: Dict[str, List[Dict]] = {}
            try:
                with chess.engine.SimpleEngine.popen_uci(sf_path) as engine:
                    engine.configure({"Threads": 1, "Hash": 32})
                    for g in chunk:
                        chunk_result[g.game_id] = self._eval_one(
                            engine, g.pgn, username, max_moves, depth
                        )
            except Exception:
                pass
            return chunk_result

        non_empty = [c for c in chunks if c]
        with ThreadPoolExecutor(max_workers=len(non_empty)) as executor:
            for partial in executor.map(_eval_chunk, non_empty):
                combined.update(partial)

        now = time.monotonic()
        with self._cache_lock:
            for gid, moves in combined.items():
                key = (gid, uname, max_moves, depth)
                self._eval_cache[key] = (now, moves)

            # 간단한 만료 정리 (요청 시점 청소)
            expired_keys = [
                k for k, (ts, _) in self._eval_cache.items()
                if (now - ts) > SF_CACHE_TTL_SEC
            ]
            for k in expired_keys:
                self._eval_cache.pop(k, None)

        return combined

    # 하위 호환용 단일 게임 분석 (eval_batch 사용 권장)
    def eval_moves(
        self,
        pgn_str: str,
        username: str,
        max_moves: int = SF_BUDGET_MOVES,
        depth: int = SF_DEPTH,
    ) -> List[Dict]:
        """각 수의 centipawn 평가 변화 목록 반환 (단일 게임용)."""
        if not self._available:
            return []
        try:
            with chess.engine.SimpleEngine.popen_uci(self.path) as engine:
                engine.configure({"Threads": 1, "Hash": 32})
                return self._eval_one(engine, pgn_str, username, max_moves, depth)
        except Exception:
            return []


_sf = StockfishHelper()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 메인 서비스
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class TacticalAnalysisService:
    def __init__(self):
        self._analysis_cache: Dict[Tuple[str, Tuple[str, ...], int], Tuple[float, Dict[str, Any]]] = {}
        self._analysis_cache_lock = threading.Lock()

    def _engine_plan(self, n_games: int) -> Tuple[int, int]:
        """게임 수 기반 동적 엔진 계획. 전수 분석을 유지하면서 응답 시간을 제한."""
        if n_games <= 120:
            return (SF_DEPTH, SF_BUDGET_MOVES)  # 8, 30
        if n_games <= 300:
            return (6, 24)
        if n_games <= 500:
            return (5, 20)
        return (4, 16)

    def _analysis_cache_key(self, games: List[GameSummary], username: str, max_board_games: int) -> Tuple[str, Tuple[str, ...], int]:
        game_ids = tuple(g.game_id for g in games)
        return (username.lower(), game_ids, max_board_games)

    def _classify_castling_direction(self, game: GameSummary, username: str) -> Optional[str]:
        """캐슬링 방향 분류: opposite | same | None(양측 캐슬링 미완료/파싱 실패)."""
        if not game.pgn:
            return None
        parsed = _parse_game(game.pgn)
        if not parsed:
            return None

        is_white = game.white.lower() == username.lower()
        my_color = chess.WHITE if is_white else chess.BLACK
        board = parsed.board()
        my_cs: Optional[str] = None
        opp_cs: Optional[str] = None

        for node in parsed.mainline():
            uci = node.move.uci()
            mover_is_me = board.turn == my_color
            if uci in ("e1g1", "e8g8"):
                if mover_is_me:
                    my_cs = "king"
                else:
                    opp_cs = "king"
            elif uci in ("e1c1", "e8c8"):
                if mover_is_me:
                    my_cs = "queen"
                else:
                    opp_cs = "queen"

            if my_cs is not None and opp_cs is not None:
                break

            try:
                board.push(node.move)
            except Exception:
                break

        if my_cs is None or opp_cs is None:
            return None
        return "opposite" if my_cs != opp_cs else "same"

    def _p_opposite_castling_all_games(self, games: List[GameSummary], username: str) -> Optional[PatternResult]:
        """상황 7: 선택 기간 전체 게임 기준 반대/같은 방향 캐슬링 승률 비교."""
        opp_games: List[GameSummary] = []
        same_games: List[GameSummary] = []
        opp_rep: List[Tuple[GameSummary, float]] = []

        for g in games:
            direction = self._classify_castling_direction(g, username)
            if direction is None:
                continue
            if direction == "opposite":
                opp_games.append(g)
                opp_rep.append((g, float(_estimate_total_moves(g.pgn or "")), {
                    "is_success": g.result.value == "win",
                    "context": "반대 방향 캐슬링",
                }))
            else:
                same_games.append(g)

        if len(opp_games) < 5:
            return None

        oc_wr = _win_rate(opp_games, username)
        sc_wr = _win_rate(same_games, username) if same_games else 50.0
        diff = oc_wr - sc_wr
        score = max(0, min(100, int(oc_wr)))

        def _ser(g: GameSummary) -> dict:
            return {
                "url": g.url,
                "result": g.result.value,
                "is_success": g.result.value == "win",
                "opening_name": g.opening_name,
                "opening_eco": g.opening_eco,
                "played_at": str(g.played_at) if g.played_at else None,
                "white": g.white,
                "black": g.black,
            }

        opp_sorted = sorted(opp_games, key=lambda g: _estimate_total_moves(g.pgn or ""), reverse=True)
        same_sorted = sorted(same_games, key=lambda g: _estimate_total_moves(g.pgn or ""), reverse=True)
        castle_chart: dict = {
            "type": "castling_comparison",
            "opposite_games": [_ser(g) for g in opp_sorted[:20]],
            "same_games": [_ser(g) for g in same_sorted[:20]],
        }

        return PatternResult(
            label="반대 방향 캐슬링 난전", icon="🏹",
            description="선택 기간 전체 게임에서 반대/같은 방향 캐슬링 승률 비교",
            score=score, is_strength=oc_wr >= 50, games_analyzed=len(opp_games) + len(same_games),
            detail=(f"반대 {len(opp_games)}게임 {oc_wr:.0f}% | 같은 방향 {len(same_games)}게임 "
                    f"{sc_wr:.0f}% ({diff:+.0f}%p)"),
            category="position", situation_id=7,
            insight=(f"반대 방향 캐슬링 {len(opp_games)}게임 승률 {oc_wr:.0f}% · "
                     f"같은 방향 {len(same_games)}게임 {sc_wr:.0f}% ({diff:+.0f}%p). "
                     f"{'난전에서 우위' if diff > 5 else ('난전 리스크 주의' if diff < -5 else '난전 성과는 평균 범위')}"),
            key_metric_value=oc_wr, key_metric_label="반대 캐슬 승률", key_metric_unit="%",
            evidence_count=len(opp_games),
            representative_games=opp_rep,
            chart_data=castle_chart,
        )

    def analyze(
        self,
        games: List[GameSummary],
        username: str,
        max_board_games: int = BOARD_BUDGET_GAMES,
    ) -> Dict[str, Any]:
        if not games:
            return {"total_games": 0, "patterns": [], "strengths": [],
                    "weaknesses": [], "cluster_analysis": None, "xgboost_profile": None}

        if max_board_games <= 0:
            max_board_games = len(games)

        cache_key = self._analysis_cache_key(games, username, max_board_games)
        now = time.monotonic()
        with self._analysis_cache_lock:
            cached = self._analysis_cache.get(cache_key)
            if cached and (now - cached[0]) <= ANALYSIS_CACHE_TTL_SEC:
                return deepcopy(cached[1])

        board_games = games[:max_board_games]

        sf_cache: Dict[str, List[Dict]] = {}
        adv_sf_cache: Dict[str, List[Dict]] = {}
        if _sf.available:
            depth, max_moves = self._engine_plan(len(games))
            sf_cache = _sf.eval_batch(games, username, max_moves=max_moves, depth=depth)
            adv_sf_cache = sf_cache

        patterns: List[PatternResult] = []

        # ── §2 시간 관리 & 심리 (상황 4) ────────────────
        try:
            p = self._p_advantage_throw(games, username, adv_sf_cache)   # 상황 4 → 우위 유지
            if p:
                patterns.append(p)
        except Exception:
            logger.exception("[analyze] _p_advantage_throw 실패")

        # ── §1 전술 모티프 (상황 1, 3) + §4 방어 능력(상황 13) ───
        try:
            patterns.extend(self._p_tactical_motifs(board_games, username, sf_cache))
        except Exception:
            logger.exception("[analyze] _p_tactical_motifs 실패")

        # ── §3 오프닝/엔드게임 + §5 복잡성 (상황 7, 10, 11, 14–17) ─
        try:
            patterns.extend(self._p_positional(board_games, username, adv_sf_cache))
        except Exception:
            logger.exception("[analyze] _p_positional 실패")
        try:
            full_castle_pattern = self._p_opposite_castling_all_games(games, username)
            if full_castle_pattern:
                replaced = False
                for i, pattern in enumerate(patterns):
                    if pattern.situation_id == 7:
                        patterns[i] = full_castle_pattern
                        replaced = True
                        break
                if not replaced:
                    patterns.append(full_castle_pattern)
        except Exception:
            logger.exception("[analyze] _p_opposite_castling_all_games 실패")

        # ── §6 오프닝 친숙도 (상황 18) ──────────────────────────
        try:
            p = self._p_opening_familiarity(games, username)         # 상황 18
            if p:
                patterns.append(p)
        except Exception:
            logger.exception("[analyze] _p_opening_familiarity 실패")

        # ── §5,6 복잡성·전환 + 보너스 ──────────────────────────
        try:
            patterns.extend(self._p_complexity(board_games, username, sf_cache, games))
        except Exception:
            logger.exception("[analyze] _p_complexity 실패")

        # 요청된 패턴은 응답에서 완전히 제외
        patterns = [p for p in patterns if p.label not in REMOVED_PATTERN_LABELS]

        # ── 누락 패턴을 데이터 부족 stub 으로 채우기 ─────────────
        # 항상 12개 패턴이 나타나도록 고정. 데이터가 부족한 패턴은
        # insufficient_data=True 로 표시되어 프론트에서 블러 처리됨.
        _PATTERN_REGISTRY = [
            dict(label="우위 유지력",           icon="📈",  description="오프닝(5~20수) 연속 +0.75폰↑ 우위게임에서 Smooth/Shaky/Blown 3단계 전환율 분석", category="time",     situation_id=4),
            dict(label="기물 희생 정확도",       icon="💥",  description="희생 수 자체의 Stockfish 정확도 기반 유효성 분석",                  category="position", situation_id=3),
            dict(label="반대 방향 캐슬링 난전",  icon="🏹",  description="서로 반대쪽으로 캐슬링한 폰 스톰 상황 승률 분석",                   category="position", situation_id=7),
            dict(label="IQP 구조 이해",         icon="♟️",  description="고립 퀸 폰(IQP) 구조일 때의 공수 밸런스 승률 분석",                 category="position", situation_id=10),
            dict(label="비숍 쌍 활용",           icon="🔷",  description="비숍 쌍을 20수까지 유지한 게임의 승률 분석",                       category="position", situation_id=11),
            dict(label="주력 오프닝 우세도",     icon="📚",  description="자주 플레이한 오프닝(3회+)과 생소한 오프닝의 승률 차이 분석",        category="position", situation_id=18),
        ]
        found_labels = {p.label for p in patterns}
        for stub in _PATTERN_REGISTRY:
            if stub["label"] not in found_labels:
                patterns.append(PatternResult(
                    label=stub["label"],
                    icon=stub["icon"],
                    description=stub["description"],
                    category=stub["category"],
                    situation_id=stub["situation_id"],
                    score=0,
                    is_strength=False,
                    games_analyzed=0,
                    detail="분석에 필요한 게임 수가 부족합니다.",
                    insight="이 패턴은 더 많은 게임 데이터가 필요합니다. 게임을 더 플레이하면 분석이 활성화됩니다.",
                    insufficient_data=True,
                ))

        # ── 예시 게임 첨부 ────────────────────────────────────────
        # representative_games = List[(GameSummary, relevance_score)] 관련도 높은 순으로 정렬
        games_with_url = [g for g in games if g.url]

        # 패턴 레이블 → 예시 게임 선택 이유 설명
        _HINT_MAP: Dict[str, Tuple[str, str]] = {
            # label: (강점일 때 hint, 약점일 때 hint)
            "우위 유지력":            ("오프닝 종료 후 우위를 끝까지 유지하며 이긴 게임",
                                        "오프닝 종료 후 우위를 역전당한 게임 (역전 수 표시)"),
            "기물 희생 정확도":       ("가장 큰 기물(퀸·룩)을 희생하고 성공한 게임",
                                        "가장 큰 기물(퀸·룩)을 희생했다가 실패한 게임"),
            "반대 방향 캐슬링 난전":  ("가장 긴 난전이 펼쳐진 반대 캐슬링 게임",
                                        "가장 긴 난전이었지만 패배한 반대 캐슬링 게임"),
            "IQP 구조 이해":          ("IQP 구조에서 공격력으로 이긴 게임",
                                        "IQP 구조에서 처리 미흡으로 진 게임"),
            "비숍 쌍 활용":           ("비숍 쌍을 끝까지 유지하며 이긴 게임",
                                        "비숍 쌍을 유지했음에도 진 게임"),
            "주력 오프닝 우세도":      ("주력 오프닝에서 결정적으로 이긴 게임",
                                        "주력 오프닝임에도 실수로 패한 게임"),
        }

        def _eg_dict(g) -> dict:
            return {
                "url":          g.url,
                "result":       g.result.value,
                "opening_eco":  g.opening_eco,
                "opening_name": g.opening_name,
                "played_at":    g.played_at,
            }

        def _pick_best(scored: List[Tuple[Any, float]], prefer_result: str) -> Optional[dict]:
            """관련도 내림차순 정렬, URL 있는 것 중 prefer_result 우선 선택."""
            with_url = [(g, s) for g, s, *_ in scored if g.url]
            if not with_url:
                return None
            # 관련도 높은 순
            with_url.sort(key=lambda x: x[1], reverse=True)
            # prefer_result 먼저
            preferred = [(g, s) for g, s in with_url if g.result.value == prefer_result]
            pick = (preferred or with_url)[0][0]
            return _eg_dict(pick)

        for pattern in patterns:
            # 데이터 부족 stub은 예시 게임/힌트 불필요
            if pattern.insufficient_data:
                continue
            rep: List[Tuple[Any, float]] = pattern.representative_games or []
            prefer = "win" if pattern.is_strength else "loss"
            if rep:
                pattern.example_game = _pick_best(rep, prefer)
            else:
                # 패턴 전용 풀 없는 경우(이동 레벨 집계) → 전역 폴백
                fallback_pool: List[Tuple[Any, float]] = [
                    (g, 1.0) for g in games_with_url
                    if g.result.value == prefer
                ]
                if not fallback_pool:
                    fallback_pool = [(g, 1.0) for g in games_with_url]
                pattern.example_game = _pick_best(fallback_pool, prefer)
                # top_games 모달용으로도 폴백 풀 저장 (최대 20개)
                # prefer_result 순으로 정렬: 원하는 결과 먼저, 나머지 뒤
                preferred_fb = [(g, s) for g, s in fallback_pool if g.result.value == prefer]
                others_fb    = [(g, s) for g, s in fallback_pool if g.result.value != prefer]
                pattern.representative_games = (preferred_fb + others_fb)[:20]
            # 힌트 설정
            hints = _HINT_MAP.get(pattern.label)
            if hints:
                pattern.example_hint = hints[0] if pattern.is_strength else hints[1]

        strengths = sorted(
            [p for p in patterns if p.is_strength and not p.insufficient_data], key=lambda x: x.score, reverse=True
        )[:3]
        weaknesses = sorted(
            [p for p in patterns if not p.is_strength and not p.insufficient_data], key=lambda x: x.score
        )[:3]

        cluster = None
        try:
            if len(games) >= 30:
                cluster = self._kmeans(games, username)
        except Exception:
            logger.exception("[analyze] _kmeans 실패")

        # Blunder 게임 집합 계산 (XGBoost 레이블용, data-leakage 방지)
        blunder_game_ids: set = {
            gid for gid, moves in sf_cache.items()
            if sum(1 for m in moves if m.get("is_blunder") and m["is_my_move"]) >= 2
        }
        # Stockfish 없거나 부족하면 프록시: 20수 이하 패배
        if len(blunder_game_ids) < 5:
            blunder_game_ids |= {
                g.game_id for g in games
                if g.result.value == "loss" and _estimate_total_moves(g.pgn or "") <= 20
            }
        xgb_profile = None
        try:
            if len(games) >= 40:
                xgb_profile = self._xgboost_profile(games, username, blunder_game_ids)
        except Exception:
            logger.exception("[analyze] _xgboost_profile 실패")

        result = {
            "total_games": len(games),
            "patterns": [_to_dict(p) for p in patterns],
            "strengths": [_to_dict(p) for p in strengths],
            "weaknesses": [_to_dict(p) for p in weaknesses],
            "cluster_analysis": cluster,
            "xgboost_profile": xgb_profile,
        }

        now = time.monotonic()
        with self._analysis_cache_lock:
            self._analysis_cache[cache_key] = (now, deepcopy(result))
            expired_keys = [
                k for k, (ts, _) in self._analysis_cache.items()
                if (now - ts) > ANALYSIS_CACHE_TTL_SEC
            ]
            for k in expired_keys:
                self._analysis_cache.pop(k, None)

        return result

    # ────────────────────────────────────────────────────────
    # 상황 19. Insta-move — 3s 이내 즉각 응수 비율 vs 실수율
    # (MVP.md §6 상황 19)
    # ────────────────────────────────────────────────────────
    def _p_insta_move(self, games: List[GameSummary], username: str, sf_cache: Dict = None) -> Optional[PatternResult]:
        """상황 19: 즉각 응수 빈도와 CP 손실 상관 분석."""
        sf_cache = sf_cache or {}
        quick_games: List[Tuple[GameSummary, float]] = []
        slow_games: List[GameSummary] = []
        quick_losses: List[float] = []
        slow_losses:  List[float] = []
        for g in games:
            if not g.pgn:
                continue
            parsed = _parse_game(g.pgn)
            if not parsed:
                continue
            is_white = g.white.lower() == username.lower()
            qc = tot = 0
            board = parsed.board()
            sf_lookup = {(m["move_no"], m["color"]): m for m in sf_cache.get(g.game_id, [])}
            for node in parsed.mainline():
                my_turn = (board.turn == chess.WHITE) == is_white
                emt = _parse_emt(node.comment or "")
                mv_clr = "white" if board.turn == chess.WHITE else "black"
                sf_m = sf_lookup.get((board.fullmove_number, mv_clr))
                if my_turn and emt is not None:
                    tot += 1
                    if emt <= 3.0:
                        qc += 1
                    # SF 기반 CP 손실 분리
                    if sf_m and sf_m.get("cp_loss") is not None:
                        loss = max(0.0, float(sf_m["cp_loss"]))
                        if emt <= 3.0:
                            quick_losses.append(loss)
                        else:
                            slow_losses.append(loss)
                try:
                    board.push(node.move)
                except Exception:
                    break
            if tot >= 10:
                ratio = qc / tot
                if ratio >= 0.3:
                    quick_games.append((g, ratio, {
                        "metric_value": round(ratio * 100, 1),
                        "metric_label": "직관 수 비율",
                        "context":      f"직관 수 {ratio * 100:.0f}%",
                    }))
                else:
                    slow_games.append(g)
        if len(quick_games) < 5:
            return None
        qg_list = [g for g, *_ in quick_games]
        qr = _win_rate(qg_list, username)
        sr = _win_rate(slow_games, username) if slow_games else 50.0
        diff = qr - sr
        score = max(0, min(100, int(qr)))
        if quick_losses and slow_losses:
            q_avg = sum(quick_losses) / len(quick_losses)
            s_avg = sum(slow_losses) / len(slow_losses)
            diff_cp = q_avg - s_avg
            insight = (f"즉각 응수(≤3초) 평균 CP 손실 {q_avg:.0f}cp "
                       f"— 신중한 수({s_avg:.0f}cp)보다 {diff_cp:+.0f}cp. "
                       f"{len(quick_losses)}개 즉각 수 분석")
            key_val  = q_avg
            key_lbl  = "즉각 수 평균 CP 손실"
            key_unit = "cp"
            evidence = len(quick_losses)
        else:
            insight = (f"즉각 응수 게임({len(quick_games)}개) 승률 {qr:.0f}% "
                       f"— 신중 게임 대비 {diff:+.0f}%p. "
                       f"{'직관 강점' if diff > 5 else '충동적 수 주의'}")
            key_val  = qr
            key_lbl  = "즉각 응수 게임 승률"
            key_unit = "%"
            evidence = len(quick_games)
        return PatternResult(
            label="즉각 응수 패턴", icon="⚡",
            description="3초 이내 직관으로 두는 게임(30%+)의 승률 (상황 19: 충동적 플레이 습관)",
            score=score, is_strength=score >= STRENGTH_THRESHOLD,
            games_analyzed=len(quick_games),
            detail=f"직관 게임 {len(quick_games)}개 → {qr:.0f}% | 신중 {sr:.0f}% ({diff:+.0f}%p)",
            category="time", situation_id=19,
            insight=insight, key_metric_value=key_val,
            key_metric_label=key_lbl, key_metric_unit=key_unit,
            evidence_count=evidence,
            representative_games=quick_games,
        )

    # ────────────────────────────────────────────────────────
    # 상황 5. Tilt — 역전패 후 다음 게임 승률
    # (MVP.md §2 시간 관리, 상황 5)
    # ────────────────────────────────────────────────────────
    def _p_tilt(self, games: List[GameSummary], username: str, sf_cache: Dict = None) -> Optional[PatternResult]:
        """연승/연패 구간별 수 정확도 추이 분석 (2-pass 방식).

        Pass 1: 전체 게임 결과로 streak 구간 탐지 (Stockfish 불필요)
        Pass 2: streak 게임 + 일반 샘플을 대상으로 전용 Stockfish 분석 실행
             → SF_BUDGET_GAMES 제한과 무관하게 streak 게임의 실제 수 품질 측정
        Pass 3: 수 품질 집계 → streak 깊이별 평균(2/3/4/5+연속) + 일반 기준선
        """
        # ── 분석 예산 상수 ──────────────────────────────────────
        TILT_HISTORY   = 100   # streak 탐지 대상 최근 게임 수
        TILT_SF_BUDGET = 30    # streak 전용 sf 분석 상한 (streak 게임 우선)
        NORMAL_SF_CAP  = 15    # 기준선용 일반 게임 sf 분석 상한

        sf_cache = sf_cache or {}

        # 충분히 진행된(≥15수) 게임만, 최근 TILT_HISTORY개 대상
        sorted_g = sorted(
            [g for g in games if g.played_at and _estimate_total_moves(g.pgn or "") >= 15],
            key=lambda g: g.played_at or "",
        )[-TILT_HISTORY:]

        if len(sorted_g) < 10:
            return None

        # ── PASS 1: streak 탐지 (결과 기반) ─────────────────────
        streak_games_all: List[Tuple[GameSummary, int, str]] = []  # (game, streak_len, 'win'|'loss')
        normal_game_objs: List[GameSummary] = []                   # streak 아닌 win/loss 게임
        streak_count = 0

        streak = 0
        last_result: Optional[str] = None

        for g in sorted_g:
            r = g.result.value
            if r in ("win", "loss"):
                if r == last_result:
                    streak += 1
                else:
                    streak = 1
                    last_result = r

                if streak >= 2:
                    streak_count += 1
                    streak_games_all.append((g, streak, r))
                else:
                    normal_game_objs.append(g)
            else:
                streak = 0
                last_result = None

        if streak_count < 5:
            return None

        streak_wins   = sum(1 for _, _, r in streak_games_all if r == "win")
        streak_losses = sum(1 for _, _, r in streak_games_all if r == "loss")

        # ── PASS 2: streak 게임 전용 Stockfish 분석 ─────────────
        # sf_cache에 없는 streak 게임 → 전용 분석 (기준선 normalも一部포함)
        # streak 게임 전체(최대 TILT_SF_BUDGET개) + 기준선 일반 게임 일부
        streak_objs  = [g for g, _, _ in streak_games_all]
        normal_for_sf = normal_game_objs[:NORMAL_SF_CAP]
        tilt_targets  = (streak_objs[:TILT_SF_BUDGET] + normal_for_sf)

        missing = [g for g in tilt_targets if g.game_id not in sf_cache and g.pgn]
        local_sf: Dict = dict(sf_cache)
        if missing and _sf.available:
            try:
                fresh = _sf.eval_batch(missing, username)
                local_sf.update(fresh)
            except Exception:
                pass   # sf 분석 실패 시 기존 캐시로 계속 진행

        # ── PASS 3: 품질 집계 ────────────────────────────────────
        win_streak_data:  List[Tuple[GameSummary, int, float]] = []
        loss_streak_data: List[Tuple[GameSummary, int, float]] = []
        normal_q: List[float] = []

        def _calc_q(game_id: str) -> Optional[float]:
            sf_moves = local_sf.get(game_id, [])
            my_moves = [m for m in sf_moves if m.get("is_my_move")]
            if not my_moves:
                return None
            return sum(_move_weight(float(m.get("cp_loss", 0))) for m in my_moves) / len(my_moves)

        for g, sl, r in streak_games_all:
            q = _calc_q(g.game_id)
            if q is None:
                continue
            if r == "win":
                win_streak_data.append((g, sl, q))
            else:
                loss_streak_data.append((g, sl, q))

        for g in normal_for_sf:
            q = _calc_q(g.game_id)
            if q is not None:
                normal_q.append(q)

        normal_avg = sum(normal_q) / len(normal_q) if normal_q else 0.0

        # sf 데이터 확보 실패 시 폴백 (sf 미설치 등)
        if len(win_streak_data) + len(loss_streak_data) < 2:
            loss_rate   = streak_losses / streak_count if streak_count else 0.5
            score       = max(0, min(100, int((1 - loss_rate) * 100)))
            is_strength = loss_rate < 0.5
            detail  = f"연승 {streak_wins}회 | 연패 {streak_losses}회 (총 {streak_count}게임, Stockfish 미설치)"
            insight = (
                f"연속 대국 {streak_count}게임: 연승 {streak_wins}회 / 연패 {streak_losses}회. "
                f"{'streak 흐름 관리 양호' if is_strength else '연패 비율 높음 — 멘탈 관리 필요'}."
            )
            rep_fb: List[Tuple[GameSummary, float, dict]] = []
            for g_fb, sl_fb, r_fb in sorted(streak_games_all, key=lambda x: -x[1])[:12]:
                rep_fb.append((g_fb, float(sl_fb), {
                    "is_success":   r_fb == "win",
                    "metric_value": None, "metric_label": None,
                    "context":      f"{'연승' if r_fb == 'win' else '연패'} {sl_fb}연속 중",
                }))
            return PatternResult(
                label="틸트(Tilt) 저항력", icon="🧠",
                description="연승/연패 구간 심리적 흐름 분석 (상황 5)",
                score=score, is_strength=is_strength,
                games_analyzed=streak_count,
                detail=detail, category="time", situation_id=5,
                insight=insight,
                key_metric_value=round(loss_rate * 100, 1),
                key_metric_label="연패 비율", key_metric_unit="%",
                evidence_count=streak_count,
                representative_games=rep_fb, chart_data=None,
            )

        # ── streak 깊이별 수 품질 버킷 집계 ────────────────────
        def _bucket_avg(data: List[Tuple[GameSummary, int, float]]) -> Dict[str, Optional[float]]:
            buckets: Dict[str, List[float]] = {"2연속": [], "3연속": [], "4연속": [], "5+연속": []}
            for _, sl, qv in data:
                if sl == 2:   buckets["2연속"].append(qv)
                elif sl == 3: buckets["3연속"].append(qv)
                elif sl == 4: buckets["4연속"].append(qv)
                else:         buckets["5+연속"].append(qv)
            return {k: (sum(v) / len(v) if v else None) for k, v in buckets.items()}

        win_trend  = _bucket_avg(win_streak_data)
        loss_trend = _bucket_avg(loss_streak_data)

        win_q_avg  = sum(q for _, _, q in win_streak_data)  / len(win_streak_data)  if win_streak_data  else None
        loss_q_avg = sum(q for _, _, q in loss_streak_data) / len(loss_streak_data) if loss_streak_data else None

        win_diff  = (win_q_avg  - normal_avg) if win_q_avg  is not None else 0.0
        loss_diff = (loss_q_avg - normal_avg) if loss_q_avg is not None else 0.0

        # ── 종합 점수 & 강점 판별 ────────────────────────────────
        if win_q_avg is not None and loss_q_avg is not None:
            combined_diff = win_diff * 0.4 + loss_diff * 0.6   # 연패 가중치 높게
            key_val, key_lbl = round(loss_q_avg, 2), "연패 중 수 품질"
        elif loss_q_avg is not None:
            combined_diff = loss_diff
            key_val, key_lbl = round(loss_q_avg, 2), "연패 중 수 품질"
        else:
            combined_diff = win_diff
            key_val, key_lbl = (round(win_q_avg, 2) if win_q_avg is not None else 0.0), "연승 중 수 품질"

        score = max(0, min(100, int(50 + combined_diff * 20)))
        is_strength = combined_diff >= -0.2

        # ── detail 문자열 ─────────────────────────────────────────
        parts = []
        if win_q_avg  is not None: parts.append(f"연승 {len(win_streak_data)}게임: {win_q_avg:+.2f} ({win_diff:+.2f})")
        if loss_q_avg is not None: parts.append(f"연패 {len(loss_streak_data)}게임: {loss_q_avg:+.2f} ({loss_diff:+.2f})")
        parts.append(f"일반기준: {normal_avg:+.2f}")
        detail = " | ".join(parts)

        # ── insight ───────────────────────────────────────────────
        trend_notes = []
        for kind, trend in (("연패", loss_trend), ("연승", win_trend)):
            vals = [(k, v) for k, v in trend.items() if v is not None]
            if len(vals) >= 2:
                dv = vals[-1][1] - vals[0][1]
                if kind == "연패" and dv < -0.3:
                    trend_notes.append(f"연패 깊을수록 정확도 악화({vals[0][1]:+.2f}→{vals[-1][1]:+.2f})")
                elif kind == "연패" and dv > 0.2:
                    trend_notes.append(f"연패 중 오히려 집중력 상승({vals[0][1]:+.2f}→{vals[-1][1]:+.2f})")
                elif kind == "연승" and dv > 0.3:
                    trend_notes.append(f"연승 깊을수록 정확도 향상({vals[0][1]:+.2f}→{vals[-1][1]:+.2f})")
                elif kind == "연승" and dv < -0.2:
                    trend_notes.append(f"연승 중에도 집중력 저하({vals[0][1]:+.2f}→{vals[-1][1]:+.2f})")

        max_ws = max((sl for _, sl, _ in win_streak_data),  default=0)
        max_ls = max((sl for _, sl, _ in loss_streak_data), default=0)
        if win_q_avg is not None and loss_q_avg is not None:
            base = f"연승 수품질 {win_q_avg:+.2f} / 연패 {loss_q_avg:+.2f} (일반 {normal_avg:+.2f}). "
        elif loss_q_avg is not None:
            base = f"연패 수품질 {loss_q_avg:+.2f} (일반 {normal_avg:+.2f}). "
        else:
            base = f"연승 수품질 {win_q_avg:+.2f} (일반 {normal_avg:+.2f}). "  # type: ignore[str-format]
        insight = (base
                   + (f"최대 연승 {max_ws}회 / 연패 {max_ls}회. " if max_ws or max_ls else "")
                   + (". ".join(trend_notes) + ". " if trend_notes else "")
                   + ("흐름 속 집중력 우수" if is_strength else "연속 대국 시 멘탈 관리 필요"))

        # ── representative_games ──────────────────────────────────
        loss_rep = sorted(loss_streak_data, key=lambda x: x[2])        # 품질 낮은 순
        win_rep  = sorted(win_streak_data,  key=lambda x: -x[2])       # 품질 높은 순

        rep_games: List[Tuple[GameSummary, float, dict]] = []
        for g, sl, q in loss_rep[:6]:
            rep_games.append((g, float(sl), {
                "is_success":   False,
                "metric_value": round(q, 2),
                "metric_label": "수 품질 점수",
                "context":      f"연패 {sl}연속 중 — 수 품질 {q:+.2f} (일반 대비 {q - normal_avg:+.2f})",
            }))
        for g, sl, q in win_rep[:6]:
            rep_games.append((g, float(sl), {
                "is_success":   True,
                "metric_value": round(q, 2),
                "metric_label": "수 품질 점수",
                "context":      f"연승 {sl}연속 중 — 수 품질 {q:+.2f} (일반 대비 {q - normal_avg:+.2f})",
            }))

        # ── chart_data ────────────────────────────────────────────
        chart_data = {
            "normal_avg":  round(normal_avg, 3),
            "win_trend":   [{"depth": k, "avg_q": round(v, 3)} for k, v in win_trend.items()  if v is not None],
            "loss_trend":  [{"depth": k, "avg_q": round(v, 3)} for k, v in loss_trend.items() if v is not None],
            "win_count":   len(win_streak_data),
            "loss_count":  len(loss_streak_data),
            "normal_count": len(normal_q),
        }

        return PatternResult(
            label="틸트(Tilt) 저항력", icon="🧠",
            description="연승/연패 구간 수 정확도 추이 — 심리적 흐름이 플레이 품질에 미치는 영향 (상황 5)",
            score=score, is_strength=is_strength,
            games_analyzed=streak_count,
            detail=detail, category="time", situation_id=5,
            insight=insight,
            key_metric_value=key_val, key_metric_label=key_lbl, key_metric_unit="pts",
            evidence_count=streak_count,
            representative_games=rep_games,
            chart_data=chart_data,
        )

    # ────────────────────────────────────────────────────────
    # 상황 4. 우위 유지력 — 오프닝 종료 후 우위게임 분석
    # ────────────────────────────────────────────────────────
    def _p_advantage_throw(self, games, username, sf_cache) -> Optional[PatternResult]:
        """오프닝~초반 미들게임 구간(5~20수)에서 Stockfish +0.75폰 이상을 연속 3수 이상 유지한 게임(우위게임)에서
        우위를 실제 승리로 전환했는지 3단계로 분류.

        분류 체계:
          - Smooth Conversion: 피크 이후 cp_after 가 한 번도 0 아래로 떨어지지 않고 승리→ 최상 전환
          - Shaky Conversion: 피크 이후 음수로 떨어졌지만 승리 달성→ 실전 대처력 우수
          - Blown Advantage: 피크 이후 무승부 또는 패전→ 우위 유지력 약점

        조건 정의:
          - 우위게임 진입 기준: 탐색 구간(5~20수) 내 연속 3수 이상 cp_after >= +0.75폰(75cp)
          - 역전 판정 기준: 피크 이후 cp_after < 0 (마이너스 진입 = 게임 주도권 이전)
          - 점수: (smooth + shaky) / total × 100 = 우위를 실제 승리로 전환한 비율
          - 최소 5게임 우위게임 달성 시 패턴 표시
        """
        if not sf_cache:
            return None

        SCAN_MIN  = 5    # 오프닝 우위 탐색 시작 수
        SCAN_MAX  = 20   # 오프닝 우위 탐색 종료 수
        ADV_CP    = 75   # +0.75폰(75cp) 이상 = 우위게임 기준
        SUSTAINED = 3    # 연속 몰수 최소 유지 회수 (1회성 스파이크 필터링)

        # ── 우위게임 탐색 ─────────────────────────────────────────
        # (g, cp_peak, first_neg_no, phase, sf_detected, peak_move_no, conv_type)
        adv_games_data: list = []
        scan_pool = 0

        for g in games:
            moves = sf_cache.get(g.game_id, [])
            if not moves:
                continue
            scan_pool += 1
            my_mvs = [m for m in moves if m["is_my_move"]]
            if not my_mvs:
                continue

            # ── 오프닝 구간 피크 우위 탐색 ───────────────────────
            scan_mvs = [m for m in my_mvs if SCAN_MIN <= m["move_no"] <= SCAN_MAX]
            if not scan_mvs:
                fallback = [m for m in my_mvs if m["move_no"] >= SCAN_MIN - 2]
                if not fallback:
                    continue
                scan_mvs = fallback[:5]

            # ── 연속 SUSTAINED수 이상 ADV_CP 유지 여부 확인 (순간 스파이크 필터링) ──
            scan_sorted    = sorted(scan_mvs, key=lambda m: m["move_no"])
            max_streak     = 0
            cur_streak     = 0
            for sm in scan_sorted:
                if sm["cp_after"] >= ADV_CP:
                    cur_streak += 1
                    max_streak  = max(max_streak, cur_streak)
                else:
                    cur_streak  = 0
            if max_streak < SUSTAINED:
                continue  # 순간적 스파이크 또는 진짜 우위 미달라

            # 피크 수 탐색
            peak_mv      = max(scan_sorted, key=lambda m: m["cp_after"])
            cp_opn       = peak_mv["cp_after"]
            peak_move_no = peak_mv["move_no"]

            # ── 피크 이후 음수 진입 여부 확인 ────────────────────────────
            post_mvs      = [m for m in my_mvs if m["move_no"] > peak_move_no]
            first_neg_no: Optional[int] = None
            sf_detected   = False

            for m in post_mvs:
                if m["cp_after"] < 0:
                    first_neg_no = m["move_no"]
                    sf_detected  = True
                    break

            # SF 범위 밖 역전은 게임 결과로 보완 (패전이면 역전 추정)
            if not sf_detected and g.result.value == "loss":
                total_hm     = _estimate_total_moves(g.pgn or "")
                total_full   = max(total_hm // 2, peak_move_no + 1)
                last_sf      = post_mvs[-1]["move_no"] if post_mvs else peak_move_no
                first_neg_no = max(last_sf + 3, total_full // 2)
                sf_detected  = False  # 추정값 표시용

            # ── 3단계 분류 ─────────────────────────────────────────
            result_val = g.result.value  # "win" | "draw" | "loss"
            ever_negative = (first_neg_no is not None)

            if result_val == "win" and not ever_negative:
                conv_type = "smooth"   # 피크 이후 한번도 음수 안 됨 + 승리
            elif result_val == "win" and ever_negative:
                conv_type = "shaky"    # 음수로 떨어졌지만 승리
            else:
                conv_type = "blown"    # 무승부/패전

            # 파트 분류 (역전/Blown 기준)
            if first_neg_no is not None:
                phase: Optional[str] = "미들게임" if first_neg_no <= 30 else "엔드게임"
            else:
                phase = None

            adv_games_data.append((g, cp_opn, first_neg_no, phase, sf_detected, peak_move_no, conv_type))

        total = len(adv_games_data)
        if total < 5:
            return None

        # ── 집계 ─────────────────────────────────────────────────
        smooth_g = [(g, cp, fn, rp, sf, pm, ct) for g, cp, fn, rp, sf, pm, ct in adv_games_data if ct == "smooth"]
        shaky_g  = [(g, cp, fn, rp, sf, pm, ct) for g, cp, fn, rp, sf, pm, ct in adv_games_data if ct == "shaky"]
        blown_g  = [(g, cp, fn, rp, sf, pm, ct) for g, cp, fn, rp, sf, pm, ct in adv_games_data if ct == "blown"]

        converted   = len(smooth_g) + len(shaky_g)   # 승리로 전환
        conv_rate   = converted / total * 100
        smooth_rate = len(smooth_g) / total * 100
        score       = max(0, min(100, int(conv_rate)))

        # 마이너스 진입 평균 수 (lown 및 shaky 중 첫 마이너스 수 기준)
        neg_g   = [(g, cp, fn, rp, sf, pm, ct) for g, cp, fn, rp, sf, pm, ct in adv_games_data
                   if fn is not None]
        neg_avg = round(sum(x[2] for x in neg_g) / len(neg_g)) if neg_g else None

        mid_blown = [(g, cp, fn, rp, sf, pm, ct) for g, cp, fn, rp, sf, pm, ct in blown_g if rp == "미들게임"]
        end_blown = [(g, cp, fn, rp, sf, pm, ct) for g, cp, fn, rp, sf, pm, ct in blown_g if rp == "엔드게임"]
        mid_avg   = round(sum(x[2] for x in mid_blown) / len(mid_blown)) if mid_blown else None
        end_avg   = round(sum(x[2] for x in end_blown) / len(end_blown)) if end_blown else None

        # ── 대표 게임 리스트 ─────────────────────────────────────
        smooth_rep: List[Tuple] = [
            (g, cp, {
                "is_success":   True,
                "advantage_outcome": "smooth",
                "metric_value": round(cp),
                "metric_label": f"피크 우위 ({pm}수)",
                "context":      f"{pm}수 +{cp:.0f}cp 우위 후 끝까지 역전 없이 승리",
            }) for g, cp, fn, rp, sf, pm, ct in smooth_g
        ]
        shaky_rep: List[Tuple] = [
            (g, cp, {
                "is_success":   True,
                "advantage_outcome": "shaky",
                "metric_value": round(cp),
                "metric_label": f"피크 우위 ({pm}수)",
                "context":      f"{pm}수 +{cp:.0f}cp 우위 → {fn}수에 한때 역전됐지만 재역전 승리",
            }) for g, cp, fn, rp, sf, pm, ct in shaky_g
        ]
        blown_rep: List[Tuple] = [
            (g, cp, {
                "is_success":   False,
                "advantage_outcome": "blown",
                "metric_value": float(fn) if fn else 0,
                "metric_label": f"{'역전 감지' if sf else '역전 추정'} 수",
                "context":      (f"{pm}수 +{cp:.0f}cp 우위 → {rp or ''} {fn or '?'}수 부근에서 우위를 놓쳐 {'무승부' if g.result.value == 'draw' else '패배'}"),
            }) for g, cp, fn, rp, sf, pm, ct in blown_g
        ]

        # ── 차트 데이터 ───────────────────────────────────────────
        chart_data = {
            "type":          "advantage_breakdown",
            "scan_pool":     scan_pool,
            "scan_cap":      len(games),
            "total":         total,
            # 프론트 호환 필드 (기존 maintained/reversed_* 스키마 유지)
            "maintained":    converted,
            "reversed_mid":  len(mid_blown),
            "reversed_end":  len(end_blown),
            "maintain_rate": round(conv_rate, 1),
            "smooth":        len(smooth_g),
            "shaky":         len(shaky_g),
            "blown":         len(blown_g),
            "converted":     converted,
            "conv_rate":     round(conv_rate, 1),
            "smooth_rate":   round(smooth_rate, 1),
            "neg_avg_move":  neg_avg,
            "mid_avg_move":  mid_avg,
            "end_avg_move":  end_avg,
        }

        # ── 인사이트 ─────────────────────────────────────────────
        parts = [f"오프닝 구간(5~20수)에서 +0.75폰 연속 우위 달성 {total}게임 분석."]
        parts.append(f"전환 성공 {converted}게임({conv_rate:.0f}%): "
                     f"Smooth {len(smooth_g)}게임 + Shaky {len(shaky_g)}게임, Blown {len(blown_g)}게임.")
        if mid_blown:
            parts.append(f"미들게임에서 전환 실패 {len(mid_blown)}건 (평균 {mid_avg}수 음수 진입).")
        if end_blown:
            parts.append(f"엔드게임에서 전환 실패 {len(end_blown)}건 (평균 {end_avg}수 음수 진입).")
        if not blown_g:
            parts.append("우위 게임을 모두 승리로 마무리했습니다!")

        return PatternResult(
            label="우위 유지력", icon="📈",
                description="오프닝 구간(5~20수) 연속 +0.75폰↑ 우위게임을 끝까지 지켰는지 분석",
            score=score, is_strength=conv_rate >= 65,
            games_analyzed=total,
                detail=(f"탐색 {scan_pool}게임 중 우위게임 {total}개: 완벽 유지 {len(smooth_g)} / 흔들렸지만 승리 {len(shaky_g)} / 역전 {len(blown_g)} "
                    f"(전환율 {conv_rate:.0f}%)"),
            category="time", situation_id=4,
            insight=" ".join(parts),
            key_metric_value=conv_rate, key_metric_label="우위 전환율", key_metric_unit="%",
            evidence_count=total,
            representative_games=smooth_rep + shaky_rep + blown_rep,
            chart_data=chart_data,
        )

    # ────────────────────────────────────────────────────────
    # 상황 20. Mutual Blunder — Stockfish 업데이트 기반 상대 블런더 응징
    # (MVP.md §6 상황 20)
    # ────────────────────────────────────────────────────────
    def _p_mutual_blunder(self, games, username, sf_cache) -> Optional[PatternResult]:
        ok = fail = 0
        for g in games:
            moves = sf_cache.get(g.game_id, [])
            for i, m in enumerate(moves):
                if m["is_my_move"] or not m.get("is_blunder"):
                    continue
                if i + 1 < len(moves):
                    nxt = moves[i + 1]
                    # Good 이상(가중치≥0)이면 응징 성공
                    if nxt["is_my_move"] and _move_weight(float(nxt.get("cp_loss", 0))) >= 0:
                        ok += 1
                    else:
                        fail += 1
        total = ok + fail
        if total < 3:
            return None
        rate = ok / total * 100
        score = max(0, min(100, int(rate)))
        return PatternResult(
            label="상대 블런더 응징", icon="⚔️",
            description="상대 블런더(cp_loss≥150) 직후 Stockfish 기준 cp_loss≤50 내 응징 성공률 (상황 20)",
            score=score, is_strength=rate >= 60,
            games_analyzed=len(sf_cache),
            detail=f"응징 기회 {total}회: 성공 {ok} / 실패 {fail} ({rate:.0f}%)",
            category="time", situation_id=20,
            insight=(f"상대 블런더 {total}회 탐지 — {ok}회({rate:.0f}%) 즉각 응징, "
                     f"{fail}회 기회 미활용. "
                     f"{'포지션 읽기 능력 우수' if rate >= 60 else '블런더 탐지력 개선 필요'}"),
            key_metric_value=rate, key_metric_label="블런더 응징률", key_metric_unit="%",
            evidence_count=total,
        )

    # ────────────────────────────────────────────────────────
    # 상황 18. 주력 오프닝 우세도 — 주력 vs 생소 오프닝 승률 비교
    # ────────────────────────────────────────────────────────
    def _p_opening_familiarity(self, games: List[GameSummary], username: str) -> Optional[PatternResult]:
        """주력 오프닝(3회 이상 플레이)과 생소한 오프닝의 승률 차이.

        주력 오프닝에서 승률이 높으면 레퍼토리 숙련도 강점,
        생소 오프닝에서 더 높으면 즉흥적 스타일 지표.
        """
        from collections import Counter
        opening_counts: Counter = Counter(g.opening_name or "Unknown" for g in games)

        FAMILIARITY_MIN = 3  # 주력 오프닝 최소 플레이 횟수
        main_openings = {op for op, cnt in opening_counts.items() if cnt >= FAMILIARITY_MIN}

        main_games      = [g for g in games if (g.opening_name or "Unknown") in main_openings]
        unfamiliar_games = [g for g in games if (g.opening_name or "Unknown") not in main_openings]

        if len(main_games) < 5 or len(unfamiliar_games) < 3:
            return None

        main_wr  = _win_rate(main_games,      username)
        unfam_wr = _win_rate(unfamiliar_games, username)
        diff     = main_wr - unfam_wr
        score    = max(0, min(100, int(main_wr)))

        top_op   = opening_counts.most_common(1)[0][0] if main_openings else "없음"
        top_short = (top_op[:22] + "…") if len(top_op) > 22 else top_op

        if diff > 5:
            insight_tail = "오프닝 레퍼토리 숙련도 높음 — 주력 오프닝 집중 권장"
        elif diff < -5:
            insight_tail = "생소 오프닝에서 더 강한 즉흥 스타일 — 레퍼토리 다양화 고려"
        else:
            insight_tail = "주력/생소 오프닝 간 승률 차이 미미"

        main_wins   = [(g, 2.0) for g in main_games       if g.result.value == "win"]
        main_losses = [(g, 1.5) for g in main_games       if g.result.value == "loss"]
        uf_losses   = [(g, 1.0) for g in unfamiliar_games if g.result.value == "loss"]
        uf_wins     = [(g, 0.5) for g in unfamiliar_games if g.result.value == "win"]

        def _ser(g: GameSummary) -> dict:
            return {
                "url": g.url,
                "result": g.result.value,
                "is_success": g.result.value == "win",
                "opening_name": g.opening_name,
                "opening_eco": g.opening_eco,
                "played_at": str(g.played_at) if g.played_at else None,
                "white": g.white,
                "black": g.black,
            }

        main_sorted = sorted(main_games, key=lambda g: _estimate_total_moves(g.pgn or ""), reverse=True)
        unfamiliar_sorted = sorted(unfamiliar_games, key=lambda g: _estimate_total_moves(g.pgn or ""), reverse=True)
        opening_chart: dict = {
            "type": "opening_comparison",
            "main_games": [_ser(g) for g in main_sorted[:20]],
            "unfamiliar_games": [_ser(g) for g in unfamiliar_sorted[:20]],
            "main_rate": main_wr,
            "unfamiliar_rate": unfam_wr,
            "diff": diff,
            "main_count": len(main_games),
            "unfamiliar_count": len(unfamiliar_games),
        }

        return PatternResult(
            label="주력 오프닝 우세도", icon="📚",
            description="자주 플레이한 오프닝(3회+)과 생소한 오프닝의 승률 차이 (상황 18: 오프닝 친숙도)",
            score=score, is_strength=diff > 5,
            games_analyzed=len(main_games) + len(unfamiliar_games),
            detail=(f"주력 {len(main_games)}게임 → {main_wr:.0f}% | "
                    f"생소 {len(unfamiliar_games)}게임 → {unfam_wr:.0f}% ({diff:+.0f}%p)"),
            category="position", situation_id=18,
            insight=(f"주력 오프닝({len(main_openings)}종, 대표: {top_short}) {len(main_games)}게임 — "
                     f"승률 {main_wr:.0f}% vs 생소 {unfam_wr:.0f}% ({diff:+.0f}%p). "
                     f"{insight_tail}"),
            key_metric_value=main_wr,
            key_metric_label="주력 오프닝 승률",
            key_metric_unit="%",
            evidence_count=len(main_games),
            representative_games=main_wins + uf_losses + main_losses + uf_wins,
            chart_data=opening_chart,
        )

    # ────────────────────────────────────────────────────────
    # 상황 1(Pin) · 3(Sacrifice) · 8(오프닝 이탈) · 13(Defense) 전술 모티프 분석
    # ────────────────────────────────────────────────────────
    def _p_tactical_motifs(self, games: List[GameSummary], username: str, sf_cache: Dict) -> List[PatternResult]:
        pin_bad = pin_total = 0
        back_rank = 0
        zw_miss = 0
        analyzed = 0

        # 패턴별 게임 추적 — 해당 패턴이 실제 발생한 게임만 수집
        pin_bad_games:  List[Tuple[GameSummary, float]] = []
        pin_ok_games:   List[Tuple[GameSummary, float]] = []
        backrank_games: List[Tuple[GameSummary, float]] = []
        zw_games:       List[Tuple[GameSummary, float]] = []

        for g in games:
            if not g.pgn:
                continue
            parsed = _parse_game(g.pgn)
            if not parsed:
                continue
            is_white = g.white.lower() == username.lower()
            my_color = chess.WHITE if is_white else chess.BLACK
            opp_color = not my_color
            board = parsed.board()
            analyzed += 1

            # sf_cache O(1) 조회 — 게임당 1회 빌드
            _sf_lookup: Dict[Tuple[int, str], Dict] = {
                (m["move_no"], m["color"]): m
                for m in sf_cache.get(g.game_id, [])
            }

            # 게임 내 패턴 발생 횟수
            g_pin_bad = g_pin_total = 0
            g_back = 0
            g_zw = 0

            for node in parsed.mainline():
                is_my = board.turn == my_color
                move = node.move
                try:
                    # 상황 1. Pin — 가중 품질 점수 기반 핀 대응 정확도
                    if is_my and board.is_pinned(my_color, move.from_square):
                        pin_total += 1
                        g_pin_total += 1
                        mv_clr = "white" if board.turn == chess.WHITE else "black"
                        sf_m = _sf_lookup.get((board.fullmove_number, mv_clr))
                        if sf_m:
                            # Inaccuracy 이상(cp_loss≥50, 가중치<0)은 핀 대응 실패
                            if _move_weight(float(sf_m.get("cp_loss", 0))) < 0:
                                pin_bad += 1
                                g_pin_bad += 1

                    # 10. Back-Rank
                    if not is_my:
                        board.push(move)
                        if board.is_check():
                            ksq = board.king(my_color)
                            if ksq is not None:
                                back = chess.BB_RANK_1 if my_color == chess.WHITE else chess.BB_RANK_8
                                if chess.BB_SQUARES[ksq] & back:
                                    for ch_sq in chess.scan_forward(board.checkers()):
                                        cp = board.piece_at(ch_sq)
                                        if cp and cp.piece_type in (chess.ROOK, chess.QUEEN):
                                            back_rank += 1
                                            g_back += 1
                                            break
                        board.pop()

                    # 11. Zwischenzug
                    if is_my and board.is_capture(move):
                        check_moves = [m for m in board.legal_moves
                                       if board.gives_check(m) and not board.is_capture(m)]
                        if check_moves:
                            zw_miss += 1
                            g_zw += 1

                    board.push(move)
                except Exception:
                    try:
                        board.push(move)
                    except Exception:
                        break

            # 게임별 결과 → 대표 게임 리스트에 추가
            # 점수 = 발생 횟수 (높을수록 해당 패턴이 더 두드러진 게임)
            if g_pin_total > 0:
                severity = g_pin_bad / g_pin_total * 100
                if g_pin_bad > 0:
                    pin_bad_games.append((g, severity + g_pin_bad, {
                        "is_success":   False,
                        "metric_value": g_pin_bad,
                        "metric_label": "핀 블런더 횟수",
                        "context":      f"핀 블런더 {g_pin_bad}회",
                    }))
                else:
                    pin_ok_games.append((g, float(g_pin_total), {
                        "is_success":   True,
                        "metric_value": g_pin_total,
                        "metric_label": "핀 정확 대응 횟수",
                        "context":      f"핀 정확 대응 {g_pin_total}회",
                    }))

            if g_back > 0:
                backrank_games.append((g, float(g_back)))

            if g_zw > 0:
                zw_games.append((g, float(g_zw)))

        results: List[PatternResult] = []

        # 백랭크 수비(p10), 사이수(p11) 제거: 성공 기준 불명확으로 비활성화

        # ── 상황 8. 오프닝 이탈(Out of Book) 후 5수 품질 ──────────────
        # Stockfish 기반: 11~16수 구간(오프닝 이론 이탈 직후)의 블런더 유무
        ob_good = ob_bad = 0
        ob_good_games: List[Tuple[GameSummary, float]] = []
        ob_bad_games:  List[Tuple[GameSummary, float]] = []
        for g in games:
            sf_raw = sf_cache.get(g.game_id, [])
            post_book = [m for m in sf_raw if m.get("is_my_move") and 11 <= m["move_no"] <= 16]
            if len(post_book) < 3:
                continue
            avg_loss  = sum(max(0.0, m.get("cp_loss", 0.0)) for m in post_book) / len(post_book)
            quality   = _game_quality_score(post_book)
            bad_moves = sum(1 for m in post_book if _move_weight(float(m.get("cp_loss", 0))) < 0)
            if quality >= 0:
                ob_good += 1
                ob_good_games.append((g, max(0.1, quality + 2.0), {
                    "is_success":   True,
                    "metric_value": round(quality, 2),
                    "metric_label": "수 품질 점수",
                    "context":      f"이탈 대응 우수 (avg {avg_loss:.0f}cp · 품질점수 {quality:+.1f})",
                }))
            else:
                ob_bad += 1
                ob_bad_games.append((g, max(0.1, abs(quality) * 10), {
                    "is_success":   False,
                    "metric_value": bad_moves,
                    "metric_label": "부정적 수 횟수",
                    "context":      f"이탈 후 부정적 수 {bad_moves}회 (품질점수 {quality:+.1f})",
                }))
        ob_total = ob_good + ob_bad

        # ── 상황 13. 방어 능력(Defensive Resilience) ──────────────────
        # Stockfish ≤-2.0 불리 상황에서 블런더 없이 버텨내는 비율
        def_ok = def_blunder = 0
        def_ok_games:  List[Tuple[GameSummary, float]] = []
        def_bad_games: List[Tuple[GameSummary, float]] = []
        for g in games:
            sf_raw = sf_cache.get(g.game_id, [])
            disadv_moves = [
                m for m in sf_raw
                if m.get("is_my_move") and m.get("cp_before") is not None and m["cp_before"] <= -100
            ]
            if not disadv_moves:
                continue
            quality    = _game_quality_score(disadv_moves)
            bad_moves  = sum(1 for m in disadv_moves if _move_weight(float(m.get("cp_loss", 0))) < 0)
            good_moves = len(disadv_moves) - bad_moves
            survived   = g.result.value in ("win", "draw")
            if quality >= 0:    # 순 양수 = 불리에서도 전반적으로 좋은 수 선택
                def_ok += 1
                def_ok_games.append((g, float(len(disadv_moves)) * (2.0 if survived else 1.0), {
                    "is_success":   True,
                    "metric_value": round(quality, 2),
                    "metric_label": "방어 품질 점수",
                    "context":      f"불리 {len(disadv_moves)}회 · 좋은 수 {good_moves}회 (품질점수 {quality:+.1f})" + (" · 역전" if survived else ""),
                }))
            else:               # 순 음수 = 불리 중 포지션 더 나빠진 회수 많음
                def_blunder += 1
                def_bad_games.append((g, abs(quality) * len(disadv_moves), {
                    "is_success":   False,
                    "metric_value": bad_moves,
                    "metric_label": "부정적 수 횟수",
                    "context":      f"불리 중 부정적 수 {bad_moves}회 (품질점수 {quality:+.1f})",
                }))
        def_total = def_ok + def_blunder
        if def_total >= 3:
            rate = def_ok / def_total * 100
            s = max(0, min(100, int(rate)))
            results.append(PatternResult(
                label="불리 포지션 방어력", icon="🛡️",
                description="Stockfish -1.0 이상 불리한 상황(cp ≤ -100)에서의 수 정확도 (상황 13: 방어 능력)",
                score=s, is_strength=rate >= 50, games_analyzed=def_total,
                detail=f"불리 {def_total}게임: 수비 성공 {def_ok} / 블런더 {def_blunder} ({rate:.0f}%)",
                category="position", situation_id=13,
                representative_games=def_ok_games + def_bad_games,
            ))

        return results

    # ────────────────────────────────────────────────────────
    # 상황 3(희생) · 7(반대 캐슬링) · 10(IQP) · 11(비숍 쌍) + 포지셔널 구조
    # ────────────────────────────────────────────────────────
    def _p_positional(self, games, username, sf_cache) -> List[PatternResult]:
        # 희생 4등급 집계
        # 1) 유일/급상승(100) 2) 전술/소폭상승(75) 3) 대등/선택형(50) 4) 실패/하락(0)
        sac_t1 = sac_t2 = sac_t3 = sac_t4 = 0
        sac_declined = 0          # 상대가 캡처 가능한 희생을 실제로 거절한 경우
        sac_unnecessary = 0       # 더 좋은 대안이 있는데 굳이 희생한 경우
        sac_score_sum = 0.0
        closed_bad = closed_total = 0
        iqp_my_g: List[Tuple[GameSummary, float, dict]] = []
        iqp_opp_g: List[Tuple[GameSummary, float, dict]] = []
        iqp_none_g: List[GameSummary] = []
        bp_g: List[Tuple[GameSummary, float]] = []         # (game, game_length)
        no_bp_g: List[GameSummary] = []
        # (game, sacrifice_piece_value) — 더 비싼 기물 희생일수록 관련도 높음
        sac_games: List[Tuple[GameSummary, float]] = []
        # 닫힌 포지션 게임 추적
        closed_games: List[Tuple[GameSummary, float]] = []
        analyzed = 0

        # 기물 가치표 (chess.py piece_type → centipawn 근사)
        _PIECE_VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
                      chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}

        for g in games:
            if not g.pgn:
                continue
            parsed = _parse_game(g.pgn)
            if not parsed:
                continue
            is_white = g.white.lower() == username.lower()
            my_color = chess.WHITE if is_white else chess.BLACK
            opp_color = not my_color
            board = parsed.board()
            analyzed += 1

            had_bp = False
            lost_bp = False
            had_my_iqp = False
            had_opp_iqp = False
            max_sac_val = 0.0   # 게임 내 가장 값비싼 희생의 기물 가치
            sac_move_no: Optional[int] = None   # 희생이 발생한 fullmove 번호
            sac_move_clr: Optional[str] = None  # 희생 수를 둔 색
            g_closed_bad = g_closed_total = 0

            for node in parsed.mainline():
                is_my = board.turn == my_color
                move = node.move
                try:
# 12. Sacrifice — Strict "Brilliant" (탁월) 및 희생 판별 로직
                    if is_my:
                        sac_src = board.piece_at(move.from_square)
                        _SAC_TYPES = (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)

                        if sac_src is not None and sac_src.piece_type in _SAC_TYPES:
                            def _get_val(pc_type):
                                if pc_type == chess.KING: return 99
                                return _PIECE_VAL.get(pc_type, 0)
                                
                            src_val = _get_val(sac_src.piece_type)
                            sac_tgt = board.piece_at(move.to_square)
                            
                            _is_real_capture = (
                                sac_tgt is not None
                                and sac_tgt.color == opp_color
                                and not board.is_en_passant(move)
                            )
                            tgt_val = _get_val(sac_tgt.piece_type) if _is_real_capture else 0
                            
                            _tb = board.copy()
                            _tb.push(move)
                            
                            # ── 1. 합법 캡처 + SEE 기반 '실질 물질 손해' 증명 ──
                            # pinned piece처럼 "공격은 하지만 실제로는 못 잡는" 경우를 제거하기 위해
                            # attackers() 대신 generate_legal_moves() 기반으로 캡처 가능성을 계산한다.
                            opp_legal_moves = list(_tb.generate_legal_moves())
                            legal_opp_caps = [m for m in opp_legal_moves if m.to_square == move.to_square]
                            my_defenders = list(_tb.attackers(my_color, move.to_square))

                            valid_opp_caps = []
                            for cap_mv in legal_opp_caps:
                                cap_piece = _tb.piece_at(cap_mv.from_square)
                                if cap_piece is None:
                                    continue
                                if cap_piece.piece_type == chess.KING and my_defenders:
                                    continue
                                valid_opp_caps.append(cap_mv)

                            # 실제 게임에서 상대가 희생 캡처를 했는지/거절했는지 추적
                            next_reply_move = node.variations[0].move if node.variations else None
                            declined_capture = (
                                bool(valid_opp_caps)
                                and next_reply_move is not None
                                and all(next_reply_move != cap for cap in valid_opp_caps)
                            )

                            # 강제수 필터: 상대가 사실상 캡처/수비를 강제당한 전술 시퀀스면 희생으로 보지 않는다.
                            # (예: 디스커버드 체크 성격의 강제 전개)
                            non_capture_replies = [m for m in opp_legal_moves if m.to_square != move.to_square]
                            forced_tactical_sequence = bool(valid_opp_caps) and len(non_capture_replies) == 0

                            if not forced_tactical_sequence and valid_opp_caps and non_capture_replies:
                                sample_replies = non_capture_replies[:6]

                                def _has_forcing_check_after(reply_move: chess.Move) -> bool:
                                    rb = _tb.copy()
                                    rb.push(reply_move)
                                    # 내 즉시 수에서 체크가 나는 라인이 있으면 강제 전개 성격으로 본다.
                                    for my_mv in list(rb.generate_legal_moves())[:30]:
                                        rb2 = rb.copy()
                                        rb2.push(my_mv)
                                        if rb2.is_check():
                                            return True
                                    return False

                                if sample_replies and all(_has_forcing_check_after(rm) for rm in sample_replies):
                                    forced_tactical_sequence = True

                            real_loss = 0
                            if valid_opp_caps and not forced_tactical_sequence:
                                min_atk_val = min([
                                    _get_val((_tb.piece_at(cap_mv.from_square)).piece_type)  # type: ignore[union-attr]
                                    for cap_mv in valid_opp_caps
                                ])
                                
                                if min_atk_val < src_val:
                                    raw_loss = max(0, src_val - tgt_val)
                                    if my_defenders and raw_loss > 0:
                                        # 반격 재포획이 가능한 경우 손해를 추가 보정
                                        real_loss = max(0, raw_loss - min_atk_val)
                                    else:
                                        real_loss = raw_loss
                                # min_atk_val >= src_val 이면 상대가 잡을 유인이 없으므로 real_loss=0 유지

                            # 1점 이상의 물리적 손해(폰 1개 분량 이상)가 확정된 경우에만 분석 진행
                            is_sacrifice_attempt = real_loss >= 1

                            # ── 2. 엔진 데이터 기반 검증 ──
                            is_valid_sac = False
                            sac_tier: Optional[int] = None
                            sac_tier_score = 0.0
                            sac_context = ""
                            sac_reason = ""

                            if is_sacrifice_attempt:
                                val_diff = abs(float(real_loss))
                                if val_diff > max_sac_val:
                                    max_sac_val = val_diff
                                    sac_move_no  = board.fullmove_number
                                    sac_move_clr = "white" if board.turn == chess.WHITE else "black"

                                sf_data = sf_cache.get(g.game_id, [])
                                mv_clr  = "white" if board.turn == chess.WHITE else "black"

                                sf_m = None
                                curr_move = str(board.fullmove_number)
                                for m in sf_data:
                                    if (str(m.get("move_no")).strip() == curr_move
                                            and str(m.get("color")).strip().lower() == mv_clr):
                                        sf_m = m
                                        break

                                if sf_m and sf_m.get("cp_after") is not None:
                                    eval_pre_sac = float(sf_m["cp_after"])  # 희생 전, 내 관점
                                    # NOTE: `or 999.0` 대신 None 검사 사용 — cp_loss=0.0 (최선수)이 999로 뒤바뀌는 버그 방지
                                    _cp_loss_raw = sf_m.get("cp_loss")
                                    cp_loss_played = float(_cp_loss_raw) if _cp_loss_raw is not None else 999.0
                                    has_better_alternative = cp_loss_played > 70

                                    # 상대방 응수(다음 턴) entry 검색
                                    if mv_clr == "white":
                                        post_clr, post_move_no = "black", curr_move
                                    else:
                                        post_clr, post_move_no = "white", str(board.fullmove_number + 1)

                                    sf_post = None
                                    for _m in sf_data:
                                        if (str(_m.get("move_no")).strip() == post_move_no
                                                and str(_m.get("color")).strip().lower() == post_clr
                                                and _m.get("cp_after") is not None):
                                            sf_post = _m
                                            break

                                    if sf_post is not None:
                                        # 희생 직후 내 관점 eval
                                        eval_post_sac = -float(sf_post["cp_after"])
                                        sac_delta = eval_post_sac - eval_pre_sac

                                        # [ScarificeAlgorithm.md 기준]
                                        # 1) 희생 기물 가치 대비 eval 하락폭 허용 (기물가치 + 150cp)
                                        material_cost_cp = real_loss * 100
                                        max_allowed_drop = material_cost_cp + 150
                                        has_compensation = sac_delta >= -max_allowed_drop

                                        # 2) 포지션 붕괴 방지 (절대 하한)
                                        is_not_catastrophic = eval_post_sac >= -(material_cost_cp + 300)

                                        # 3) 기존 우위 상태(+3.0)에서 eval 하락 시 단순 정리로 간주
                                        is_not_simplification = not (eval_pre_sac > 300 and sac_delta < 0)

                                        forced_mate = eval_post_sac >= 1900

                                        is_valid_sac = (
                                            (has_compensation and is_not_catastrophic and is_not_simplification)
                                            or forced_mate
                                        )

                                        # ── 3. 4단계 희생 등급 분류 (개선판) ──
                                        # T1: 탁월/유일(최선)수
                                        # T2: cp가 올라가는 긍정적 수
                                        # T3: 거절형/불필요하지만 나쁘지 않은 수
                                        # T4: 해서는 안 되는 놓침/블런더
                                        severe_drop = sac_delta <= -120
                                        hard_blunder = cp_loss_played >= 120
                                        # cp_loss_played <= 20: 엔진 최선수와 거의 차이 없는 최선/탁월 희생
                                        # (기존 <= 8은 너무 엄격 — 0.0 bug fix 이후에도 거의 안 잡힘)
                                        is_best_like = cp_loss_played <= 20
                                        # sac_delta >= -30: 엔진 분석 편차(노이즈) 허용
                                        # (T2에서 P2/P3 평가 일관성 차이 때문에 약간 음수일 수 있음)
                                        is_brilliant_like = forced_mate or (is_best_like and sac_delta >= -30)

                                        # 최선/탁월 후보는 최우선으로 보호한다.
                                        if is_brilliant_like and not has_better_alternative:
                                            sac_tier = 1
                                            sac_tier_score = 100.0
                                            sac_reason = "탁월/유일형"
                                        # T2: cp_loss가 60 이하이고 포지션이 급락하지 않은 경우
                                        # sac_delta >= 10 → -60: P2 평가가 이미 희생수의 결과를 반영하므로
                                        # sub-optimal 희생은 항상 sac_delta < 0. 급락(-60cp 이상 하락)만 배제.
                                        elif cp_loss_played <= 60 and sac_delta >= -60:
                                            sac_tier = 2
                                            sac_tier_score = 75.0
                                            sac_reason = "긍정상승형"
                                        elif is_valid_sac and cp_loss_played <= 90 and sac_delta >= -60:
                                            sac_tier = 3
                                            sac_tier_score = 60.0
                                            sac_reason = "중립/선택형"
                                        elif hard_blunder or severe_drop or (not is_valid_sac and cp_loss_played > 80 and sac_delta < -40):
                                            sac_tier = 4
                                            sac_tier_score = 0.0
                                            sac_reason = "놓침/블런더"
                                        else:
                                            sac_tier = 3
                                            sac_tier_score = 60.0
                                            sac_reason = "중립/선택형"

                                        # 거절형은 무조건 강등하지 않는다.
                                        # 실익이 거의 없는 경우에만 T3로 조정한다.
                                        if declined_capture and sac_tier < 3:
                                            if sac_delta >= 60 or cp_loss_played <= 12:
                                                sac_tier = 2
                                                sac_tier_score = 75.0
                                                sac_reason = "상대 거절형(압박 성공)"
                                            else:
                                                sac_tier = 3
                                                sac_tier_score = 60.0
                                                sac_reason = "상대 거절형"
                                        elif declined_capture and sac_tier == 3:
                                            sac_reason = "상대 거절형"

                                        # 대안 우위형도 강등 조건을 완화:
                                        # "정말 다른 수가 훨씬 좋고" "희생 이득도 약한" 경우에만 T3 하향.
                                        if has_better_alternative and sac_tier in (1, 2) and sac_delta < 20 and cp_loss_played > 80:
                                            sac_tier = 3
                                            sac_tier_score = 60.0
                                            sac_reason = "대안 우위형"
                                        elif has_better_alternative and sac_tier == 3:
                                            sac_reason = "대안 우위형"

                                        tier_label = {
                                            1: "T1 유일/급상승",
                                            2: "T2 전술/소폭상승",
                                            3: "T3 대등/선택형",
                                            4: "T4 실패/하락",
                                        }.get(sac_tier, "T4 실패/하락")
                                        sac_context = (
                                            f"{tier_label}({sac_reason}) · Δeval {sac_delta:+.0f}cp · cp_loss {cp_loss_played:.0f}"
                                        )

                                    else:
                                        # [버그 픽스] sf_post가 없는 경우 (이 희생수가 게임의 마지막 수였음)
                                        # 기물을 물리적으로 희생했는데, 이 수 직후에 상대가 기권했거나 게임이 끝났고
                                        # 그 결과가 나의 승리(win)라면 이는 결정적인 탁월수/메이트 유도수입니다.
                                        if g.result.value == "win":
                                            is_valid_sac = True
                                            sac_tier = 2
                                            sac_tier_score = 75.0
                                            sac_context = "T2 전술/소폭상승 · 종국 직후 승리"

                                if sac_tier is None:
                                    sac_tier = 4
                                    sac_tier_score = 0.0
                                    if not sac_context:
                                        sac_context = "T4 실패/하락 · 보상 불충분"

                                # 등급 집계 (희생 시도 단위)
                                if sac_tier == 1:
                                    sac_t1 += 1
                                elif sac_tier == 2:
                                    sac_t2 += 1
                                elif sac_tier == 3:
                                    sac_t3 += 1
                                else:
                                    sac_t4 += 1

                                if "거절" in sac_reason:
                                    sac_declined += 1
                                if "대안 우위" in sac_reason:
                                    sac_unnecessary += 1

                                sac_score_sum += sac_tier_score

                                sac_val = max(val_diff, 1.0)
                                sac_games.append((g, sac_val, {
                                    "is_success":      sac_tier in (1, 2),
                                    "sac_tier":        sac_tier,
                                    "metric_value":    sac_tier_score,
                                    "metric_label":    "희생 등급 점수",
                                    "context":         sac_context,
                                    "pgn":             g.pgn,
                                    "sacrifice_move_no":  board.fullmove_number,
                                    "sacrifice_color":    mv_clr,
                                }))
                                            
                    # 13. Closed Position
                    if is_my and board.fullmove_number >= 10:
                        my_pawns = board.pieces(chess.PAWN, my_color)
                        blocked = sum(
                            1 for sq in my_pawns
                            if board.piece_at(sq + (8 if my_color == chess.WHITE else -8)) is not None
                        )
                        if blocked >= 3:
                            closed_total += 1
                            g_closed_total += 1
                            src_pc = board.piece_at(move.from_square)
                            if src_pc and src_pc.piece_type == chess.PAWN:
                                dest = move.to_square
                                supported = bool(
                                    board.attackers(my_color, dest)
                                    & board.pieces(chess.PAWN, my_color)
                                )
                                if not supported:
                                    closed_bad += 1
                                    g_closed_bad += 1

                    # 15. IQP (20수 시점, d/e파일 고립 폰)
                    if board.fullmove_number == 20:
                        def _has_iqp(color: chess.Color) -> bool:
                            pawns_sq = list(board.pieces(chess.PAWN, color))
                            for file_idx in (3, 4):  # d/e file
                                target = [sq for sq in pawns_sq if sq % 8 == file_idx]
                                if not target:
                                    continue
                                has_neighbor = any((sq % 8) in (file_idx - 1, file_idx + 1) for sq in pawns_sq)
                                if not has_neighbor:
                                    return True
                            return False

                        if _has_iqp(my_color):
                            had_my_iqp = True
                        if _has_iqp(opp_color):
                            had_opp_iqp = True

                    # 16. Bishop Pair
                    if board.fullmove_number == 1 and is_my:
                        had_bp = len(list(board.pieces(chess.BISHOP, my_color))) == 2
                    if had_bp and is_my and board.fullmove_number <= 20:
                        if len(list(board.pieces(chess.BISHOP, my_color))) < 2:
                            lost_bp = True

                    board.push(move)
                except Exception:
                    try:
                        board.push(move)
                    except Exception:
                        break

            # 닫힌 포지션 - 무리한 폰 전진이 있었던 게임일수록 관련도 높음
            if g_closed_total > 0:
                bad_ratio = g_closed_bad / g_closed_total
                closed_games.append((g, bad_ratio * 100 + g_closed_bad))

            game_len = float(_estimate_total_moves(g.pgn or ""))
            _sf_pos = sf_cache.get(g.game_id, [])
            _q_pos = _game_quality_score(_sf_pos)
            if had_my_iqp:
                iqp_my_g.append((g, game_len, {
                    "is_success":   _q_pos > 0 or g.result.value == "win",
                    "metric_value": round(_q_pos, 2),
                    "metric_label": "수 품질 점수",
                    "context":      f"내 IQP 보유 — 수 품질 {'우수' if _q_pos > 0 else '미흡'} ({_q_pos:+.1f})",
                }))
            elif had_opp_iqp:
                iqp_opp_g.append((g, game_len, {
                    "is_success":   _q_pos > 0 or g.result.value == "win",
                    "metric_value": round(_q_pos, 2),
                    "metric_label": "수 품질 점수",
                    "context":      f"상대 IQP 보유 — 압박 {'성공' if _q_pos > 0 else '미흡'} ({_q_pos:+.1f})",
                }))
            else:
                iqp_none_g.append(g)
            if had_bp and not lost_bp:
                bp_g.append((g, game_len, {
                    "is_success":   _q_pos > 0 or g.result.value == "win",
                    "metric_value": round(_q_pos, 2),
                    "metric_label": "수 품질 점수",
                    "context":      f"비숍 페어 보유 — 수 품질 {'우수' if _q_pos > 0 else '미흡'} ({_q_pos:+.1f})",
                }))
            else:
                no_bp_g.append(g)

        results: List[PatternResult] = []

        sac_total = sac_t1 + sac_t2 + sac_t3 + sac_t4
        if sac_total >= 3:
            avg_score = sac_score_sum / sac_total
            s = max(0, min(100, int(round(avg_score))))
            results.append(PatternResult(
                label="기물 희생 정확도", icon="💥",
                description="희생 4등급 분류(T1~T4) 기반 평균 정확도: 유일강수/전술상승/선택형/실패",
                score=s, is_strength=avg_score >= 60, games_analyzed=analyzed,
                detail=(f"희생 {sac_total}회: T1 {sac_t1} · T2 {sac_t2} · T3 {sac_t3} · T4 {sac_t4} "
                    f"· 거절형 {sac_declined} · 대안우위형 {sac_unnecessary} (평균 {avg_score:.1f}점)"),
                category="position", situation_id=3,
                insight=(f"기물 희생 {sac_total}회 분류 결과: T1 {sac_t1}, T2 {sac_t2}, T3 {sac_t3}, T4 {sac_t4}. "
                     f"상대 거절형 {sac_declined}회, 대안 우위형 {sac_unnecessary}회. "
                         f"평균 정확도 {avg_score:.1f}점 — "
                         f"{'고난도 전술 희생 품질 우수' if avg_score >= 70 else ('희생 품질 보통' if avg_score >= 50 else '무리한 희생 비중 높음')}"),
                key_metric_value=round(avg_score, 1), key_metric_label="희생 평균 정확도", key_metric_unit="점",
                evidence_count=sac_total,
                chart_data={
                    "type": "sacrifice_tiers",
                    "total": sac_total,
                    "t1": sac_t1,
                    "t2": sac_t2,
                    "t3": sac_t3,
                    "t4": sac_t4,
                    "declined": sac_declined,
                    "unnecessary": sac_unnecessary,
                    "avg_score": round(avg_score, 1),
                },
                representative_games=sac_games,
            ))

        iqp_total = len(iqp_my_g) + len(iqp_opp_g)
        if iqp_total >= 5:
            my_games = [g for g, *_ in iqp_my_g]
            opp_games = [g for g, *_ in iqp_opp_g]

            my_wr = _win_rate(my_games, username) if my_games else 50.0
            opp_wr = _win_rate(opp_games, username) if opp_games else 50.0
            none_wr = _win_rate(iqp_none_g, username) if iqp_none_g else 50.0

            my_vs_none = my_wr - none_wr
            my_vs_opp = my_wr - opp_wr
            score = max(0, min(100, int(my_wr)))

            my_q = np.mean([float(extra.get("metric_value", 0.0)) for _, _, extra in iqp_my_g]) if iqp_my_g else 0.0
            opp_q = np.mean([float(extra.get("metric_value", 0.0)) for _, _, extra in iqp_opp_g]) if iqp_opp_g else 0.0

            def _ser(g: GameSummary, side: str, q: float) -> dict:
                return {
                    "url": g.url,
                    "result": g.result.value,
                    "is_success": g.result.value == "win",
                    "opening_name": g.opening_name,
                    "opening_eco": g.opening_eco,
                    "played_at": str(g.played_at) if g.played_at else None,
                    "white": g.white,
                    "black": g.black,
                    "iqp_side": side,
                    "quality_score": round(q, 2),
                }

            my_sorted = sorted(iqp_my_g, key=lambda x: x[1], reverse=True)
            opp_sorted = sorted(iqp_opp_g, key=lambda x: x[1], reverse=True)
            none_sorted = sorted(iqp_none_g, key=lambda g: _estimate_total_moves(g.pgn or ""), reverse=True)

            chart_data = {
                "type": "iqp_comparison",
                "my_iqp_games": [_ser(g, "my", float(extra.get("metric_value", 0.0))) for g, _, extra in my_sorted[:20]],
                "opp_iqp_games": [_ser(g, "opp", float(extra.get("metric_value", 0.0))) for g, _, extra in opp_sorted[:20]],
                "none_iqp_games": [_ser(g, "none", 0.0) for g in none_sorted[:20]],
                "my_iqp_rate": my_wr,
                "opp_iqp_rate": opp_wr,
                "none_iqp_rate": none_wr,
                "my_iqp_count": len(iqp_my_g),
                "opp_iqp_count": len(iqp_opp_g),
                "none_iqp_count": len(iqp_none_g),
                "my_vs_none_diff": my_vs_none,
                "my_vs_opp_diff": my_vs_opp,
                "my_quality_avg": round(float(my_q), 2),
                "opp_quality_avg": round(float(opp_q), 2),
            }

            is_strength = my_wr >= 50 and my_vs_none >= 0
            style_hint = (
                "IQP 운용 숙련도가 높아 능동적 전개에 강함"
                if my_vs_none > 5 and my_vs_opp > -3
                else ("상대 IQP 압박은 되지만 내 IQP 운용 품질 보강 필요" if my_vs_none < -5 else "IQP 이해도는 평균 범위")
            )

            results.append(PatternResult(
                label="IQP 구조 이해", icon="♟️",
                description="20수 시점 IQP(내/상대/무) 구조별 승률·수품질 비교",
                score=score, is_strength=is_strength, games_analyzed=iqp_total,
                detail=(f"내 IQP {len(iqp_my_g)}게임 {my_wr:.0f}% | 상대 IQP {len(iqp_opp_g)}게임 {opp_wr:.0f}% | "
                        f"무IQP {len(iqp_none_g)}게임 {none_wr:.0f}%"),
                category="position", situation_id=10,
                insight=(f"내 IQP 승률 {my_wr:.0f}% (무IQP 대비 {my_vs_none:+.0f}%p), "
                         f"상대 IQP 상대 승률 {opp_wr:.0f}% (내 IQP 대비 {my_vs_opp:+.0f}%p). {style_hint}"),
                key_metric_value=my_wr, key_metric_label="내 IQP 승률", key_metric_unit="%",
                evidence_count=iqp_total,
                representative_games=iqp_my_g + iqp_opp_g,
                chart_data=chart_data,
            ))

        if len(bp_g) >= 5:
            bp_games = [g for g, *_ in bp_g]
            bp_wr = _win_rate(bp_games, username)
            nb_wr = _win_rate(no_bp_g, username) if no_bp_g else 50.0
            diff = bp_wr - nb_wr
            s = max(0, min(100, int(bp_wr)))
            results.append(PatternResult(
                label="비숍 쌍 활용", icon="🔷",
                description="비숍 쌍을 20수까지 유지한 게임의 승률",
                score=s, is_strength=bp_wr >= 55 and diff >= 0,
                games_analyzed=len(bp_g),
                detail=f"비숍 쌍 유지 {len(bp_g)}게임 → {bp_wr:.0f}% | 비보유 {nb_wr:.0f}% ({diff:+.0f}%p)",
                category="position", situation_id=11,
                insight=(f"비숍 쌍 20수 유지 {len(bp_g)}게임 — 승률 {bp_wr:.0f}% vs 비보유 {nb_wr:.0f}% ({diff:+.0f}%p). "
                         f"{'비숍 쌍 장기 활용 능력 우수' if diff > 5 else ('비숍 조기 교환되는 경향' if diff < 0 else '비숍 쌍 기여도 없음')}"),
                key_metric_value=bp_wr, key_metric_label="비숍 쌍 유지 승률", key_metric_unit="%",
                evidence_count=len(bp_g),
                representative_games=bp_g,
            ))

        return results

    # ────────────────────────────────────────────────────────
    # 17–20 + 보너스 패턴
    # ────────────────────────────────────────────────────────
    def _p_complexity(self, games, username, sf_cache, all_games) -> List[PatternResult]:
        ht_ok = ht_bad = 0
        qe_games: List[Tuple[GameSummary, float]] = []
        nonqe_games: List[GameSummary] = []
        promo_ok = promo_miss = 0
        hunt_ok = hunt_miss = 0
        analyzed = 0
        # 상황 16: 킹 안전도 — 폰 쉬일드 파괴 시에 Stockfish 블런더 유무
        ks_blunder_moves = ks_safe_moves = 0
        ks_blunder_games: List[Tuple[GameSummary, float]] = []
        ks_safe_games:    List[Tuple[GameSummary, float]] = []
        # 상황 17: 공간 우위 — 20수 시점 진출 폰 수 비교
        space_adv_games: List[Tuple[GameSummary, float]] = []
        space_dis_games: List[GameSummary] = []

        # 패턴별 게임 추적
        ht_ok_games:      List[Tuple[GameSummary, float]] = []
        ht_bad_games:     List[Tuple[GameSummary, float]] = []
        promo_ok_games:   List[Tuple[GameSummary, float]] = []
        promo_miss_games: List[Tuple[GameSummary, float]] = []
        hunt_ok_games:    List[Tuple[GameSummary, float]] = []
        hunt_miss_games:  List[Tuple[GameSummary, float]] = []

        for g in games:
            if not g.pgn:
                continue
            parsed = _parse_game(g.pgn)
            if not parsed:
                continue
            is_white = g.white.lower() == username.lower()
            my_color = chess.WHITE if is_white else chess.BLACK
            opp_color = not my_color
            board = parsed.board()
            analyzed += 1
            had_qe = False
            qe_move_no = 0
            hunt_result: Optional[bool] = None
            g_ht_ok = g_ht_bad = 0
            g_promo_ok = g_promo_miss = 0
            g_ks_blunder = g_ks_safe = 0
            g_space_score: Optional[int] = None
            # sf_cache O(1) 동인 조회
            _sf_cx: Dict[Tuple[int, str], Dict] = {
                (m["move_no"], m["color"]): m
                for m in sf_cache.get(g.game_id, [])
            }

            for node in parsed.mainline():
                is_my = board.turn == my_color
                move = node.move
                try:
                    # 17. High Tension
                    if is_my:
                        attacked = sum(
                            1 for sq in chess.SQUARES
                            if board.piece_at(sq)
                            and board.piece_at(sq).color == my_color
                            and board.is_attacked_by(opp_color, sq)
                        )
                        if attacked >= 3:
                            test = board.copy()
                            test.push(move)
                            after = sum(
                                1 for sq in chess.SQUARES
                                if test.piece_at(sq)
                                and test.piece_at(sq).color == my_color
                                and test.is_attacked_by(opp_color, sq)
                            )
                            if after < attacked:
                                ht_ok += 1
                                g_ht_ok += 1
                            else:
                                ht_bad += 1
                                g_ht_bad += 1

                    # 18. Queen Exchange
                    if (board.is_capture(move)
                            and board.piece_at(move.from_square)
                            and board.piece_at(move.from_square).piece_type == chess.QUEEN
                            and board.piece_at(move.to_square)
                            and board.piece_at(move.to_square).piece_type == chess.QUEEN):
                        if not had_qe:
                            had_qe = True
                            qe_move_no = board.fullmove_number

                    # 19. Pawn Promotion Race
                    my_pw = list(board.pieces(chess.PAWN, my_color))
                    op_pw = list(board.pieces(chess.PAWN, opp_color))
                    near = (
                        any(sq // 8 >= 6 if my_color == chess.WHITE else sq // 8 <= 1 for sq in my_pw)
                        and any(sq // 8 <= 1 if opp_color == chess.WHITE else sq // 8 >= 6 for sq in op_pw)
                    )
                    if near and board.fullmove_number >= 30 and is_my:
                        src_pc = board.piece_at(move.from_square)
                        if src_pc and src_pc.piece_type == chess.PAWN:
                            promo_ok += 1
                            g_promo_ok += 1
                        else:
                            promo_miss += 1
                            g_promo_miss += 1

                    # 20. King Hunt
                    if is_my:
                        opp_king = board.king(opp_color)
                        if opp_king is not None and (opp_king // 8) in range(2, 6):
                            if board.gives_check(move) or board.is_capture(move):
                                hunt_result = True
                            elif hunt_result is None:
                                hunt_result = False

                    # 상황 16. King Safety — 캐슬 후 폰 쉬일드 파괴 시 Stockfish 블런더
                    if is_my:
                        ksq2 = board.king(my_color)
                        if ksq2 is not None:
                            kf = chess.square_file(ksq2)
                            if kf <= 1 or kf >= 6:  # 캐슬링된 위치
                                shield_rank = 1 if my_color == chess.WHITE else 6
                                shield = sum(
                                    1 for f in range(max(0, kf - 1), min(8, kf + 2))
                                    if (pp := board.piece_at(chess.square(f, shield_rank)))
                                    and pp.piece_type == chess.PAWN and pp.color == my_color
                                )
                                if shield <= 1:  # 쉬일드 2개 이상 파괴
                                    mv_clr = "white" if board.turn == chess.WHITE else "black"
                                    sf_m = _sf_cx.get((board.fullmove_number, mv_clr))
                                    if sf_m:
                                        w = _move_weight(float(sf_m.get("cp_loss", 0)))
                                        if w < 0:   # Inaccuracy 이하: 파얌 후 실수
                                            ks_blunder_moves += 1
                                            g_ks_blunder += 1
                                        elif w > 0:  # Good 이상: 안정적 대응
                                            ks_safe_moves += 1
                                            g_ks_safe += 1

                    # 상황 17. Space Advantage — 20수 시점 진출 폰 대비
                    if board.fullmove_number == 20 and is_my and g_space_score is None:
                        adv_min = 4 if my_color == chess.WHITE else 0
                        adv_max = 7 if my_color == chess.WHITE else 3
                        opp_adv_min = 4 if opp_color == chess.WHITE else 0
                        opp_adv_max = 7 if opp_color == chess.WHITE else 3
                        my_adv = sum(
                            1 for sq in board.pieces(chess.PAWN, my_color)
                            if adv_min <= chess.square_rank(sq) <= adv_max
                        )
                        op_adv = sum(
                            1 for sq in board.pieces(chess.PAWN, opp_color)
                            if opp_adv_min <= chess.square_rank(sq) <= opp_adv_max
                        )
                        g_space_score = my_adv - op_adv

                    board.push(move)
                except Exception:
                    try:
                        board.push(move)
                    except Exception:
                        break

            if had_qe:
                total_moves = float(_estimate_total_moves(g.pgn or ""))
                moves_after = max(total_moves - qe_move_no, 1.0)  # 퀸 교환 후 플레이 수
                _sf_after_qe = [m for m in sf_cache.get(g.game_id, []) if m.get("is_my_move") and m.get("move_no", 0) >= qe_move_no]
                _q_qe = _game_quality_score(_sf_after_qe) if _sf_after_qe else 0.0
                qe_games.append((g, moves_after, {
                    "is_success":   g.result.value in ("win", "draw"),
                    "metric_value": round(_q_qe, 2),
                    "metric_label": "엔드게임 수 품질",
                    "context":      f"퀸 교환({qe_move_no}수) 후 엔드게임 — 수 품질 {_q_qe:+.1f}",
                }))
            else:
                nonqe_games.append(g)

            if hunt_result is True:
                hunt_ok += 1
                hunt_ok_games.append((g, 1.0))
            elif hunt_result is False:
                hunt_miss += 1
                hunt_miss_games.append((g, 1.0))

            g_ht_total = g_ht_ok + g_ht_bad
            if g_ht_total > 0:
                if g_ht_bad > 0:
                    ht_bad_games.append((g, float(g_ht_bad)))
                else:
                    ht_ok_games.append((g, float(g_ht_ok)))

            g_promo_total = g_promo_ok + g_promo_miss
            if g_promo_total > 0:
                if g_promo_miss > 0:
                    promo_miss_games.append((g, float(g_promo_miss)))
                else:
                    promo_ok_games.append((g, float(g_promo_ok)))

            # 킹 안전 / 공간 우위 게임상 집계
            if g_ks_blunder + g_ks_safe > 0:
                if g_ks_blunder > 0:
                    ks_blunder_games.append((g, float(g_ks_blunder)))
                else:
                    ks_safe_games.append((g, float(g_ks_safe)))
            if g_space_score is not None:
                if g_space_score > 0:
                    space_adv_games.append((g, float(g_space_score)))
                else:
                    space_dis_games.append(g)

        results: List[PatternResult] = []

        ht_total = ht_ok + ht_bad
        if ht_total >= 5:
            rate = ht_ok / ht_total * 100
            s = max(0, min(100, int(rate)))
            results.append(PatternResult(
                label="높은 긴장도 대처", icon="🌪️",
                description="3개+ 기물이 동시 공격받는 복잡한 상황에서 수를 개선한 비율",
                score=s, is_strength=rate >= 55, games_analyzed=analyzed,
                detail=f"고긴장 {ht_total}회: 개선 {ht_ok} / 악화 {ht_bad} ({rate:.0f}%)",
                category="endgame", situation_id=14,
                insight=(f"3기물+ 동시 공격 고긴장 {ht_total}회 — {ht_ok}회 위협 개선, {ht_bad}회 악화. "
                         f"긴장도 대처율 {rate:.0f}% — {'복잡한 전술 계산 우수' if rate >= 55 else '긴장 상황 판단력 개선 필요'}"),
                key_metric_value=rate, key_metric_label="긴장 상황 개선율", key_metric_unit="%",
                evidence_count=ht_total,
                representative_games=ht_bad_games + ht_ok_games,
            ))

        if len(qe_games) >= 5:
            qe_list = [g for g, *_ in qe_games]
            qe_wr = _win_rate(qe_list, username)
            nq_wr = _win_rate(nonqe_games, username) if nonqe_games else 50.0
            diff = qe_wr - nq_wr
            s = max(0, min(100, int(qe_wr)))
            results.append(PatternResult(
                label="퀸 교환 후 이해도", icon="👸",
                description="퀸이 교환된 엔드게임 전환 시점의 승률",
                score=s, is_strength=qe_wr >= 50, games_analyzed=len(qe_games),
                detail=f"퀸 교환 {len(qe_games)}게임 → {qe_wr:.0f}% | 퀸 유지 {nq_wr:.0f}% ({diff:+.0f}%p)",
                category="endgame", situation_id=15,
                insight=(f"퀸 교환 후 {len(qe_games)}게임 — 승률 {qe_wr:.0f}% vs 퀸 유지 {nq_wr:.0f}% ({diff:+.0f}%p). "
                         f"{'엔드게임 전환 강세' if diff > 5 else ('엔드게임 약점' if diff < -5 else '퀸 교환 전후 승률 유사')}"),
                key_metric_value=qe_wr, key_metric_label="퀸 교환 후 승률", key_metric_unit="%",
                evidence_count=len(qe_games),
                representative_games=qe_games,
            ))

        pr_total = promo_ok + promo_miss
        if pr_total >= 3:
            rate = promo_ok / pr_total * 100
            s = max(0, min(100, int(rate)))
            results.append(PatternResult(
                label="폰 승급 레이스", icon="🏃",
                description="양측이 승급 경쟁할 때 폰을 정확히 전진한 비율",
                score=s, is_strength=rate >= 60, games_analyzed=analyzed,
                detail=f"승급 레이스 {pr_total}회: 정확 {promo_ok} / 미흡 {promo_miss} ({rate:.0f}%)",
                category="endgame",
                insight=(f"폰 승급 레이스 {pr_total}회 — {promo_ok}회 정확한 전진, {promo_miss}회 박자 실수. "
                         f"승급 정확도 {rate:.0f}% — {'엔드게임 폰 운영 우수' if rate >= 60 else '폰 승급 타이밍 교정 필요'}"),
                key_metric_value=rate, key_metric_label="승급 정확도", key_metric_unit="%",
                evidence_count=pr_total,
                representative_games=promo_miss_games + promo_ok_games,
            ))

        hunt_total = hunt_ok + hunt_miss
        if hunt_total >= 3:
            rate = hunt_ok / hunt_total * 100
            s = max(0, min(100, int(rate)))
            results.append(PatternResult(
                label="킹 헌트 마무리", icon="🎯",
                description="상대 킹이 중앙으로 나왔을 때 체크/공격으로 마무리한 비율",
                score=s, is_strength=rate >= 55, games_analyzed=analyzed,
                detail=f"킹 헌트 기회 {hunt_total}회: 마무리 {hunt_ok} / 놓침 {hunt_miss} ({rate:.0f}%)",
                category="endgame",
                insight=(f"상대 킹 노출 기회 {hunt_total}회 — {hunt_ok}회 결정적 마무리, {hunt_miss}회 놓침. "
                         f"마무리 성공률 {rate:.0f}% — {'공격적 마무리 능력 우수' if rate >= 55 else '킹 사냥 결정타 부족'}"),
                key_metric_value=rate, key_metric_label="킹 헌트 성공률", key_metric_unit="%",
                evidence_count=hunt_total,
                representative_games=hunt_ok_games + hunt_miss_games,
            ))

        # 상황 16. 킹 안전도 관리
        ks_total = ks_blunder_moves + ks_safe_moves
        if ks_total >= 3:
            safe_rate = ks_safe_moves / ks_total * 100
            s = max(0, min(100, int(safe_rate)))
            results.append(PatternResult(
                label="킹 안전도 관리", icon="👑",
                description="캐슬링 후 폰 쉬일드 파괴(≤1개) 상황에서 Stockfish 블런더 없는 비율 (상황 16: 킹 안전도)",
                score=s, is_strength=safe_rate >= 65, games_analyzed=analyzed,
                detail=f"쉬일드 파괴 {ks_total}회: 안전 수 {ks_safe_moves} / 블런더 {ks_blunder_moves} ({safe_rate:.0f}%)",
                category="position", situation_id=16,
                insight=(f"폰 쉬일드 파괴 후 {ks_total}회 — {ks_safe_moves}회 안전 대응, {ks_blunder_moves}회 Stockfish 블런더. "
                         f"킹 안전 유지율 {safe_rate:.0f}% — {'쉬일드 파괴 후 안정적 플레이' if safe_rate >= 65 else '킹 노출 시 취약한 수 선택'}"),
                key_metric_value=safe_rate, key_metric_label="킹 안전 유지율", key_metric_unit="%",
                evidence_count=ks_total,
                representative_games=ks_blunder_games + ks_safe_games,
            ))

        return results

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # K-Means 군집화
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _extract_game_features(self, games, username):
        """게임 행동 피처 추출 — 결과(won/lost) 제외하여 K-Means leakage 방지."""
        opening_counts = Counter(g.opening_name or "Unknown" for g in games)
        rows = []
        for g in games:
            res = g.result.value if g.result else "loss"
            # result_val은 클러스터링에 사용하지 않고 사후 win_rate 계산에만 사용
            result_val = 1.0 if res == "win" else (0.5 if res == "draw" else 0.0)
            is_white = 1.0 if g.white.lower() == username.lower() else 0.0
            is_fam = 1.0 if opening_counts.get(g.opening_name or "Unknown", 0) >= 4 else 0.0
            gl = float(_estimate_total_moves(g.pgn or ""))
            tp = 0.0; qc = tot = 0; clks: List[float] = []; emt_sum = 0.0; emt_cnt = 0
            if g.pgn:
                try:
                    parsed = chess.pgn.read_game(io.StringIO(g.pgn))
                    if parsed:
                        mn = 0
                        for node in parsed.mainline():
                            mn += 1
                            my_turn = (mn % 2 == 1) if bool(is_white) else (mn % 2 == 0)
                            clk = _parse_clock(node.comment or "")
                            emt = _parse_emt(node.comment or "")
                            if clk is not None:
                                clks.append(clk)
                            if my_turn:
                                if clk is not None and clk < 30.0:
                                    tp = 1.0
                                if emt is not None:
                                    tot += 1; emt_cnt += 1; emt_sum += emt
                                    if emt <= 3.0:
                                        qc += 1
                except Exception:
                    pass
            qr = qc / tot if tot >= 5 else 0.5
            avg_emt = emt_sum / emt_cnt if emt_cnt > 0 else 10.0
            clk_var = float(np.std(clks)) if len(clks) >= 4 else 15.0
            # features: 결과 제외한 행동 피처만
            rows.append({
                "game":       g,
                "result_val": result_val,
                "features":   [gl, is_white, is_fam, tp, qr, avg_emt, clk_var],
            })
        return rows

    def _kmeans(self, games, username, n_clusters=3):
        # 피처: 행동 피처만 (결과 제외 → leakage 방지)
        FEAT = ["게임 길이", "백 플레이", "친숙 오프닝", "시간 압박", "빠른 응수", "평균 사고 시간", "시계 변동성"]
        rows = self._extract_game_features(games, username)
        if len(rows) < 10:
            return None
        X = np.nan_to_num(
            np.array([r["features"] for r in rows], dtype=float),
            nan=0.5, posinf=100.0, neginf=0.0,
        )
        # 클러스터링에서 결과를 사용하지 않음 — 사후 집계용 별도 배열
        results_arr = np.array([r["result_val"] for r in rows])
        scaler = StandardScaler()
        X_s = scaler.fit_transform(X)
        km = KMeans(n_clusters=n_clusters, n_init=20, random_state=42, max_iter=300)
        labels = km.fit_predict(X_s)
        centers = scaler.inverse_transform(km.cluster_centers_)
        overall_wr = float(np.mean(results_arr) * 100)  # 피처 행렬이 아닌 결과 배열로 계산

        # idx: feature index (결과 제거 후 0-based)
        # 0=게임길이, 1=백플레이, 2=친숙오프닝, 3=시간압박, 4=빠른응수, 5=평균사고시간, 6=시계변동성
        RULES = [
            (0, "장기전 위주",      "단기전 위주",     40),
            (3, "시간 압박 빈번",   "여유로운 시간",   0.5),
            (4, "직관적 빠른 응수", "신중한 수 선택", 0.5),
            (1, "백 게임 위주",     "흑 게임 위주",    0.6),
            (2, "익숙한 오프닝",    "새로운 오프닝",   0.5),
            (5, "긴 사고 시간",     "매우 빠른 응수", 15.0),
        ]
        NAMES = {
            ("시간 압박 빈번", "직관적 빠른 응수"): ("⏱️ 시간 압박 게임",  "시간 부족 + 빠른 응수 패턴"),
            ("시간 압박 빈번",):                   ("⏱️ 시간 압박 게임",  "클록 30초 이하 빈발"),
            ("직관적 빠른 응수",):                 ("⚡ 직관 플레이",      "3초 이내 응수가 많은 게임"),
            ("긴 사고 시간",   "장기전 위주"):      ("🧠 신중한 포지션플레이", "충분한 사고 + 장기전 패턴"),
            ("장기전 위주",):                       ("👑 엔드게임 전투",    "40수+ 장기전"),
            ("단기전 위주",):                       ("♟️ 오프닝 결전",      "25수 이하 단기전"),
            ("익숙한 오프닝",):                     ("📚 단골 오프닝",      "익숙한 오프닝 레퍼토리"),
            ("새로운 오프닝",):                     ("🎲 낯선 오프닝",      "처음 접하는 오프닝"),
            ("매우 빠른 응수",):                    ("⚡ 초고속 직관",      "평균 3초 미만 응수"),
        }
        stats = []
        for cid in range(n_clusters):
            mask = labels == cid
            n = int(mask.sum())
            if n == 0:
                continue
            # win_rate: 결과 배열로 사후 집계 (클러스터링과 무관)
            wr = float(np.mean(results_arr[mask]) * 100)
            ctr = centers[cid]
            traits = []
            for idx, hi, lo, thr in RULES:
                v = ctr[idx]
                if idx == 0:   # 게임 길이
                    if v >= thr:  traits.append(hi)
                    elif v <= 25: traits.append(lo)
                elif idx == 5: # avg_emt
                    if v >= thr + 5:  traits.append(hi)
                    elif v <= thr - 8: traits.append(lo)
                else:
                    if v >= thr + 0.15:  traits.append(hi)
                    elif v <= thr - 0.15: traits.append(lo)
            name = desc = None
            for key, (nm, ds) in NAMES.items():
                if all(t in traits for t in key):
                    if name is None or len(key) > len(name):
                        name = nm; desc = ds
            if name is None:
                name = f"🎯 패턴 그룹 {cid+1}"; desc = "혼합 게임 패턴"
            stats.append({
                "id": cid, "n_games": n, "win_rate": round(wr, 1),
                "label": name, "description": desc, "key_traits": traits[:3],
                "is_weakness": wr < max(35, overall_wr - 8),
                "is_strength": wr > min(65, overall_wr + 8),
                "center": {FEAT[i]: round(float(ctr[i]), 3) for i in range(len(FEAT))},
            })
        stats.sort(key=lambda c: c["win_rate"], reverse=True)
        wk = [c for c in stats if c["is_weakness"]]
        st = [c for c in stats if c["is_strength"]]
        top_w = wk[0]["label"] if wk else None
        top_s = st[0]["label"] if st else None
        parts = []
        if top_s: parts.append(f"{top_s} 유형에서 강세")
        if top_w: parts.append(f"{top_w} 유형에서 약세")
        return {
            "n_clusters": n_clusters, "feature_names": FEAT,
            "clusters": stats, "overall_win_rate": round(overall_wr, 1),
            "summary": " · ".join(parts) or "게임 패턴이 고르게 분포됨",
            "top_weakness": top_w, "top_strength": top_s,
        }

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # XGBoost — 블런더 유발 게임 패턴 분류 (data-leakage 제거)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _xgboost_profile(self, games, username, blunder_game_ids: set = None):
        # `lost` 피처 제거 — 이전 버전의 data-leakage 원인
        # 레이블: analyze()에서 미리 계산된 blunder_game_ids 사용
        FEAT = ["백 플레이", "게임 길이", "친숙 오프닝",
                "시간 압박", "빠른 응수", "클록 변동성", "게임 단계"]

        opening_counts = Counter(g.opening_name or "Unknown" for g in games)

        def featurize(g):
            is_white = 1.0 if g.white.lower() == username.lower() else 0.0
            gl = float(_estimate_total_moves(g.pgn or ""))
            is_fam = 1.0 if opening_counts.get(g.opening_name or "Unknown", 0) >= 4 else 0.0
            tp = 0.0; qc = tot = 0; clks = []
            if g.pgn:
                try:
                    parsed = chess.pgn.read_game(io.StringIO(g.pgn))
                    if parsed:
                        mn = 0
                        for node in parsed.mainline():
                            mn += 1
                            my_turn = (mn % 2 == 1) if bool(is_white) else (mn % 2 == 0)
                            clk = _parse_clock(node.comment or "")
                            emt = _parse_emt(node.comment or "")
                            if clk is not None:
                                clks.append(clk)
                            if my_turn:
                                if clk is not None and clk < 30.0:
                                    tp = 1.0
                                if emt is not None:
                                    tot += 1
                                    if emt <= 3.0:
                                        qc += 1
                except Exception:
                    pass
            qr = qc / tot if tot >= 5 else 0.5
            clk_var = float(np.std(clks)) if len(clks) >= 4 else 15.0
            phase = 0.0 if gl < 20 else (1.0 if gl < 40 else 2.0)
            # lost 피처 제거 — data-leakage 방지
            return [is_white, gl, is_fam, tp, qr, clk_var, phase]

        blunder_ids = blunder_game_ids or set()
        game_id_list = [g.game_id for g in games]
        rows_raw = [featurize(g) for g in games]
        valid_pairs = [(gid, r) for gid, r in zip(game_id_list, rows_raw) if r]
        if len(valid_pairs) < 40:
            return None
        valid_gids = [gid for gid, _ in valid_pairs]
        rows = [r for _, r in valid_pairs]

        X = np.nan_to_num(np.array(rows, dtype=float))
        # 레이블: Stockfish 블런더 게임 또는 프록시 (결과 피처 없음)
        y = np.array([1 if gid in blunder_ids else 0 for gid in valid_gids])
        if y.sum() < 5 or (len(y) - y.sum()) < 5:
            return None

        split = int(len(X) * 0.8)
        X_tr, X_v = X[:split], X[split:]
        y_tr, y_v = y[:split], y[split:]

        scale_pw = float((len(y_tr) - y_tr.sum()) / max(y_tr.sum(), 1))
        model = xgb.XGBClassifier(
            n_estimators=80, max_depth=4, learning_rate=0.1,
            scale_pos_weight=scale_pw, eval_metric="logloss",
            random_state=42, verbosity=0,
        )
        model.fit(X_tr, y_tr, eval_set=[(X_v, y_v)], verbose=False)

        importances = model.feature_importances_
        ranked = sorted(zip(FEAT, importances.tolist()), key=lambda x: x[1], reverse=True)
        proba = model.predict_proba(X)[:, 1]
        blunder_rate = float(np.mean(proba >= 0.5) * 100)
        y_v_pred = model.predict(X_v) if len(X_v) > 0 else np.array([], dtype=int)
        metrics = _binary_classification_metrics(y_v, y_v_pred)

        lift = round(metrics["accuracy"] - metrics["baseline_accuracy"], 1)
        is_meaningful = (
            metrics["support_pos"] >= 3
            and metrics["support_neg"] >= 3
            and lift >= 5.0
            and metrics["f1"] >= 35.0
        )
        if is_meaningful:
            quality_note = "검증 구간에서 베이스라인 대비 개선이 확인되어 해석 가능한 모델입니다."
        else:
            quality_note = "데이터 불균형 또는 표본 부족으로 모델 신뢰도가 낮을 수 있습니다."

        DESC = {
            "시간 압박":   "시간이 30초 이하로 떨어지면 블런더 확률 급증",
            "빠른 응수":   "직관적 빠른 응수가 많을수록 블런더성 패배 증가",
            "클록 변동성": "남은 시간이 불규칙할수록 집중력 저하",
            "게임 단계":   "오프닝/미들게임 초반에 승부가 나는 패턴",
            "게임 길이":   "단기로 끝나는 게임에서 블런더 집중 경향",
            "친숙 오프닝": "낯선 오프닝에서 실수가 집중",
            "백 플레이":   "특정 색 플레이 시 취약점",
        }
        return {
            "blunder_game_rate": round(blunder_rate, 1),
            "top_risk_factors": [
                {"feature": n, "importance": round(v * 100, 1), "description": DESC.get(n, "")}
                for n, v in ranked[:3]
            ],
            "feature_importances": [
                {"feature": n, "importance": round(v * 100, 1)} for n, v in ranked
            ],
            "model_accuracy": metrics["accuracy"],
            "precision": metrics["precision"],
            "recall": metrics["recall"],
            "f1": metrics["f1"],
            "baseline_accuracy": metrics["baseline_accuracy"],
            "lift_over_baseline": lift,
            "positive_rate": metrics["positive_rate"],
            "validation_support": {
                "positive": metrics["support_pos"],
                "negative": metrics["support_neg"],
            },
            "is_meaningful": is_meaningful,
            "quality_note": quality_note,
            "games_analyzed": len(rows),
            "description": (
                f"XGBoost — 블런더 유발 게임 예측 "
                f"(leakage-free, {len(blunder_ids)}개 레이블, lift {lift:+.1f}pp)"
            ),
        }
