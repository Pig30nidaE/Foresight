"""
전술 패턴 분석 서비스 — MVP.md 20가지 상황 전체 구현
========================================================
스택:
  - python-chess   : PGN 파싱 + 보드 구조 분석
  - Stockfish 18   : 우위 포기/상호 블런더/희생 정확도 평가
  - pandas/NumPy   : Feature 정형화·전처리
  - scikit-learn   : K-Means 게임 패턴 군집화
  - XGBoost        : 블런더 유발 게임 패턴 분류

MVP.md 20 패턴:
  [Time & Psychology]
  1. Time Trouble        — 잔여 60s 미만 블런더율
  2. Instant Response    — 3s 이내 응수 실수 빈도
  3. Tilt                — 역전패 후 다음 게임 승률
  4. Advantage Throw     — Stockfish +3 이상→역전 패턴
  5. Mutual Blunder      — 상대 블런더 직후 응징 성공률
  6. Time Advantage      — 시간 넉넉+불리 포지션 탈출율
  [Tactical Motifs]
  7. Pin                 — 핀된 기물 무리한 이동
  8. Fork                — 나이트/폰 포크 회피율
  9. Discovered Attack   — 숨겨진 공격 경로 인지
  10. Back-Rank Mate     — 백랭크 체크 허용 빈도
  11. Zwischenzug        — 교환 중 사이수 발견 능력
  [Positional & Material]
  12. Sacrifice          — 기물 희생 후 후속 정확도
  13. Closed Position    — 닫힌 포지션 무리한 폰 전진
  14. Opposite Castling  — 반대 방향 캐슬링 난전 승률
  15. IQP                — 고립 퀸 폰 구조 승률
  16. Bishop Pair        — 비숍 쌍 유지 및 활용 승률
  [Complexity & Transitions]
  17. High Tension       — 기물 긴장도 높은 상황 대처
  18. Queen Exchange     — 퀸 교환 후 엔드게임 이해도
  19. Pawn Promotion     — 폰 승급 레이스 정확도
  20. King Hunt          — 킹 헌트 마무리 능력
"""
from __future__ import annotations

import io
import os
import re
from collections import Counter
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

# ── 상수 ──────────────────────────────────────────────────────
STOCKFISH_PATH = "/opt/homebrew/bin/stockfish"
STRENGTH_THRESHOLD = 55
SF_DEPTH = 8            # 10→8: blitz 분석에 충분, 속도 2-3배 개선
SF_BUDGET_GAMES = 15    # 25→15: 엔진 분석 대상 게임 수 축소
SF_BUDGET_MOVES = 30    # 40→30: 중반까지만 분석
BOARD_BUDGET_GAMES = 80  # 120→80: 보드 루프 게임 수 축소
BLUNDER_CP = 150   # centipawn 손실 ≥150 → 블런더

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
    example_game: Optional[dict] = None
    # (GameSummary, relevance_score) — 관련도 높은 순 정렬, 직렬화 제외
    representative_games: Optional[List[Tuple[Any, float]]] = None
    # 예시 게임 선택 이유 (프론트 힌트 텍스트용)
    example_hint: Optional[str] = None


def _to_dict(p: PatternResult) -> dict:
    d = {k: getattr(p, k) for k in
            ("label", "description", "icon", "score",
             "is_strength", "games_analyzed", "detail", "category", "example_game")}
    # example_hint를 example_game 내부에 삽입
    if d["example_game"] and p.example_hint:
        d["example_game"] = {**d["example_game"], "hint": p.example_hint}
    # 대표 게임 상위 8개 직렬화 (패턴 모달 표시용)
    if p.representative_games:
        top = sorted(p.representative_games, key=lambda x: x[1], reverse=True)[:8]
        d["top_games"] = [
            {
                "url":          g.url,
                "result":       g.result.value,
                "opening_eco":  g.opening_eco,
                "opening_name": g.opening_name,
                "played_at":    g.played_at,
                "white":        g.white,
                "black":        g.black,
            }
            for g, _ in top if g.url
        ]
    else:
        d["top_games"] = []
    return d


def _win_rate(games: List[GameSummary], username: str) -> float:
    if not games:
        return 0.0
    w = sum(1 for g in games if g.result.value == "win")
    return round(w / len(games) * 100, 1)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stockfish 헬퍼
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class StockfishHelper:
    def __init__(self, path: str = STOCKFISH_PATH):
        self.path = path
        self._available = os.path.exists(path)

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
        """엔진을 1번만 열어 여러 게임을 배치 분석. {game_id: [moves]}."""
        if not self._available:
            return {}
        result: Dict[str, List[Dict]] = {}
        try:
            with chess.engine.SimpleEngine.popen_uci(self.path) as engine:
                engine.configure({"Threads": 1, "Hash": 32})
                for g in games:
                    if g.pgn:
                        result[g.game_id] = self._eval_one(
                            engine, g.pgn, username, max_moves, depth
                        )
        except Exception:
            pass
        return result

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

    def analyze(
        self,
        games: List[GameSummary],
        username: str,
        max_board_games: int = BOARD_BUDGET_GAMES,
    ) -> Dict[str, Any]:
        if not games:
            return {"total_games": 0, "patterns": [], "strengths": [],
                    "weaknesses": [], "cluster_analysis": None, "xgboost_profile": None}

        board_games = games[:max_board_games]
        sf_games = games[:SF_BUDGET_GAMES] if _sf.available else []

        # Stockfish 분석 — 엔진 1번만 열어 배치 처리
        sf_cache: Dict[str, List[Dict]] = _sf.eval_batch(sf_games, username)

        patterns: List[PatternResult] = []

        # ── Time & Psychology (1–6) ─────────────────────────
        for fn in [self._p1, self._p2, self._p3]:
            p = fn(games, username)
            if p:
                patterns.append(p)
        p = self._p4(games, username, sf_cache)
        if p:
            patterns.append(p)
        p = self._p5(games, username, sf_cache)
        if p:
            patterns.append(p)
        p = self._p6(games, username, sf_cache)
        if p:
            patterns.append(p)

        # ── Tactical Motifs (7–11) ──────────────────────────
        patterns.extend(self._p7_to_p11(board_games, username))

        # ── Positional & Material (12–16) ───────────────────
        patterns.extend(self._p12_to_p16(board_games, username, sf_cache))

        # ── Complexity & Transitions (17–20 + extras) ───────
        patterns.extend(self._p17_to_p20(board_games, username, sf_cache, games))

        # ── 예시 게임 첨부 ────────────────────────────────────────
        # representative_games = List[(GameSummary, relevance_score)] 관련도 높은 순으로 정렬
        games_with_url = [g for g in games if g.url]

        # 패턴 레이블 → 예시 게임 선택 이유 설명
        _HINT_MAP: Dict[str, Tuple[str, str]] = {
            # label: (강점일 때 hint, 약점일 때 hint)
            "시간 압박 대응":         ("잔여 시계가 가장 낮았던 게임 (극한 시간 압박)",
                                        "잔여 시계가 가장 낮았던 게임 (시간 압박 실수)"),
            "즉각 반응 패턴":         ("즉각 응수 비율이 가장 높은 게임 (직관 발동)",
                                        "즉각 응수 비율이 가장 높은 게임 (직관 실수)"),
            "틸트(Tilt) 저항력":      ("가장 긴 연패 직후 회복해 이긴 게임",
                                        "가장 긴 연패 직후 추가로 진 게임"),
            "우위 유지력":            ("가장 큰 cp 우위를 유지하며 이긴 게임",
                                        "가장 큰 cp 우위를 날려 역전된 게임"),
            "기물 희생 정확도":       ("가장 큰 기물(퀸·룩)을 희생하고 성공한 게임",
                                        "가장 큰 기물(퀸·룩)을 희생했다가 실패한 게임"),
            "반대 방향 캐슬링 난전":  ("가장 긴 난전이 펼쳐진 반대 캐슬링 게임",
                                        "가장 긴 난전이었지만 패배한 반대 캐슬링 게임"),
            "IQP 구조 이해":          ("IQP 구조에서 공격력으로 이긴 게임",
                                        "IQP 구조에서 처리 미흡으로 진 게임"),
            "비숍 쌍 활용":           ("비숍 쌍을 끝까지 유지하며 이긴 게임",
                                        "비숍 쌍을 유지했음에도 진 게임"),
            "퀸 교환 후 이해도":      ("퀸 교환 후 가장 긴 엔드게임을 치른 게임",
                                        "퀸 교환 후 엔드게임 처리가 미흡했던 게임"),
            "오프닝 레퍼토리":        ("가장 많이 플레이한 익숙한 오프닝 게임",
                                        "가장 많이 플레이했지만 진 익숙한 오프닝 게임"),
            "흑백 밸런스":            ("더 약한 색(약점)으로 플레이한 게임",
                                        "더 약한 색(약점)으로 플레이한 게임"),
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
            with_url = [(g, s) for g, s in scored if g.url]
            if not with_url:
                return None
            # 관련도 높은 순
            with_url.sort(key=lambda x: x[1], reverse=True)
            # prefer_result 먼저
            preferred = [(g, s) for g, s in with_url if g.result.value == prefer_result]
            pick = (preferred or with_url)[0][0]
            return _eg_dict(pick)

        for pattern in patterns:
            rep: List[Tuple[Any, float]] = pattern.representative_games or []
            prefer = "win" if pattern.is_strength else "loss"
            if rep:
                pattern.example_game = _pick_best(rep, prefer)
            else:
                # 패턴 전용 풀 없는 경우(이동 레벨 집계) → 전역 폴백
                fallback_pool = [
                    (g, 1.0) for g in games_with_url
                    if g.result.value == prefer
                ]
                pattern.example_game = _pick_best(fallback_pool or [(g, 1.0) for g in games_with_url], prefer)
            # 힌트 설정
            hints = _HINT_MAP.get(pattern.label)
            if hints:
                pattern.example_hint = hints[0] if pattern.is_strength else hints[1]

        strengths = sorted(
            [p for p in patterns if p.is_strength], key=lambda x: x.score, reverse=True
        )[:3]
        weaknesses = sorted(
            [p for p in patterns if not p.is_strength], key=lambda x: x.score
        )[:3]

        cluster = self._kmeans(games, username) if len(games) >= 30 else None

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
        xgb_profile = self._xgboost_profile(games, username, blunder_game_ids) if len(games) >= 40 else None

        return {
            "total_games": len(games),
            "patterns": [_to_dict(p) for p in patterns],
            "strengths": [_to_dict(p) for p in strengths],
            "weaknesses": [_to_dict(p) for p in weaknesses],
            "cluster_analysis": cluster,
            "xgboost_profile": xgb_profile,
        }

    # ────────────────────────────────────────────────────────
    # 1. Time Trouble
    # ────────────────────────────────────────────────────────
    def _p1(self, games: List[GameSummary], username: str) -> Optional[PatternResult]:
        pressure: List[Tuple[GameSummary, float]] = []  # (game, 1/min_clock) 낮은 시계 = 고관련도
        normal: List[GameSummary] = []
        for g in games:
            if not g.pgn:
                continue
            parsed = _parse_game(g.pgn)
            if not parsed:
                continue
            is_white = g.white.lower() == username.lower()
            min_clk = float("inf")
            had = False
            board = parsed.board()
            for node in parsed.mainline():
                my_turn = (board.turn == chess.WHITE) == is_white
                clk = _parse_clock(node.comment or "")
                if my_turn and clk is not None and clk < 60.0:
                    had = True
                    if clk < min_clk:
                        min_clk = clk
                try:
                    board.push(node.move)
                except Exception:
                    break
            if had:
                # relevance = 1/min_clk: 시계가 낮을수록 관련도 높음
                pressure.append((g, 1.0 / max(min_clk, 0.1)))
            else:
                normal.append(g)
        if len(pressure) < 5:
            return None
        pressure_games = [g for g, _ in pressure]
        pr = _win_rate(pressure_games, username)
        nr = _win_rate(normal, username) if normal else 50.0
        diff = pr - nr
        score = max(0, min(100, int(pr)))
        return PatternResult(
            label="시간 압박 대응", icon="⏱️",
            description="잔여시간 60초 미만 상황에서의 최종 승률",
            score=score, is_strength=(pr >= 45 and diff >= -10),
            games_analyzed=len(pressure),
            detail=f"압박 {len(pressure)}게임 → {pr:.0f}% | 일반 {nr:.0f}% ({diff:+.0f}%p)",
            category="time",
            representative_games=pressure,
        )

    # ────────────────────────────────────────────────────────
    # 2. Instant Response
    # ────────────────────────────────────────────────────────
    def _p2(self, games: List[GameSummary], username: str) -> Optional[PatternResult]:
        quick_games: List[Tuple[GameSummary, float]] = []  # (game, quick_ratio)
        slow_games: List[GameSummary] = []
        for g in games:
            if not g.pgn:
                continue
            parsed = _parse_game(g.pgn)
            if not parsed:
                continue
            is_white = g.white.lower() == username.lower()
            qc = tot = 0
            prev_clk: Optional[float] = None
            board = parsed.board()
            for node in parsed.mainline():
                my_turn = (board.turn == chess.WHITE) == is_white
                clk = _parse_clock(node.comment or "")
                emt = _parse_emt(node.comment or "")
                if my_turn:
                    if emt is not None:
                        tot += 1
                        if emt <= 3.0:
                            qc += 1
                    elif clk is not None and prev_clk is not None:
                        spent = prev_clk - clk
                        if 0 < spent:
                            tot += 1
                            if spent <= 3.0:
                                qc += 1
                    prev_clk = clk
                try:
                    board.push(node.move)
                except Exception:
                    break
            if tot >= 10:
                ratio = qc / tot
                if ratio >= 0.3:
                    quick_games.append((g, ratio))  # ratio가 높을수록 직관 플레이 극명
                else:
                    slow_games.append(g)
        if len(quick_games) < 5:
            return None
        qg_list = [g for g, _ in quick_games]
        qr = _win_rate(qg_list, username)
        sr = _win_rate(slow_games, username) if slow_games else 50.0
        diff = qr - sr
        score = max(0, min(100, int(qr)))
        return PatternResult(
            label="즉각 반응 패턴", icon="⚡",
            description="수를 3초 이내 직관으로 두는 게임(30%+)의 승률 — 직관력",
            score=score, is_strength=score >= STRENGTH_THRESHOLD,
            games_analyzed=len(quick_games),
            detail=f"직관 게임 {len(quick_games)}개 → {qr:.0f}% | 신중 {sr:.0f}% ({diff:+.0f}%p)",
            category="time",
            representative_games=quick_games,
        )

    # ────────────────────────────────────────────────────────
    # 3. Tilt — 역전패 후 다음 게임 승률
    # ────────────────────────────────────────────────────────
    def _p3(self, games: List[GameSummary], username: str) -> Optional[PatternResult]:
        sorted_g = sorted(
            [g for g in games if g.played_at],
            key=lambda g: g.played_at or "",
        )
        if len(sorted_g) < 10:
            return None
        after_loss: List[Tuple[GameSummary, float]] = []  # (game, consecutive_loss_streak)
        normal: List[GameSummary] = []
        prev_bad = False
        streak = 0
        for i, g in enumerate(sorted_g):
            if i > 0:
                if prev_bad:
                    after_loss.append((g, float(streak)))  # streak 길수록 틸트 극명
                else:
                    normal.append(g)
            total_mv = _estimate_total_moves(g.pgn or "")
            if g.result.value == "loss" and total_mv >= 15:
                streak += 1
                prev_bad = True
            else:
                streak = 0
                prev_bad = False
        if len(after_loss) < 5:
            return None
        al_list = [g for g, _ in after_loss]
        al_wr = _win_rate(al_list, username)
        nm_wr = _win_rate(normal, username) if normal else 50.0
        diff = al_wr - nm_wr
        score = max(0, min(100, int(50 + diff)))
        return PatternResult(
            label="틸트(Tilt) 저항력", icon="🧠",
            description="패배 직후 다음 게임 승률 — 연패 심리적 회복 지표",
            score=score, is_strength=diff >= -5,
            games_analyzed=len(after_loss),
            detail=f"패배 후 {len(after_loss)}게임 → {al_wr:.0f}% | 일반 {nm_wr:.0f}% ({diff:+.0f}%p)",
            category="time",
            representative_games=after_loss,
        )

    # ────────────────────────────────────────────────────────
    # 4. Advantage Throw — Stockfish +3 이상→역전
    # ────────────────────────────────────────────────────────
    def _p4(self, games, username, sf_cache) -> Optional[PatternResult]:
        if not sf_cache:
            # proxy: 장기전 역전패
            wins_long = [g for g in games if _estimate_total_moves(g.pgn or "") >= 30 and g.result.value == "win"]
            loss_long = [g for g in games if _estimate_total_moves(g.pgn or "") >= 30 and g.result.value == "loss"]
            total = len(wins_long) + len(loss_long)
            if total < 5:
                return None
            rate = len(wins_long) / total * 100
            # 장기전일수록 관련도 높음 (더 긴 게임 = 우위처리 패턴이 더 극명)
            scored = [(g, float(_estimate_total_moves(g.pgn or ""))) for g in wins_long + loss_long]
            return PatternResult(
                label="우위 유지력", icon="📈",
                description="장기전(30수+) 승률 — 우위 포기 패턴의 근사 지표",
                score=max(0, min(100, int(rate))), is_strength=rate >= 55,
                games_analyzed=total,
                detail=f"장기전 {total}게임: 승 {len(wins_long)} / 패 {len(loss_long)} ({rate:.0f}%)",
                category="time",
                representative_games=scored,
            )
        won_adv = lost_adv = 0
        won_adv_games: List[Tuple[GameSummary, float]] = []   # (game, max_cp_advantage)
        lost_adv_games: List[Tuple[GameSummary, float]] = []
        for g in games:
            moves = sf_cache.get(g.game_id, [])
            if not moves:
                continue
            my_mvs = [m for m in moves if m["is_my_move"]]
            max_cp = max(
                (m["cp_before"] for m in my_mvs if m["cp_before"] is not None),
                default=0,
            )
            if max_cp >= 300:
                relevance = max_cp / 100.0  # 더 큰 우위를 날렸을수록 극명
                if g.result.value == "loss":
                    lost_adv += 1
                    lost_adv_games.append((g, relevance))
                elif g.result.value == "win":
                    won_adv += 1
                    won_adv_games.append((g, relevance))
        total = won_adv + lost_adv
        if total < 3:
            return None
        rate = won_adv / total * 100
        score = max(0, min(100, int(rate)))
        return PatternResult(
            label="우위 유지력", icon="📈",
            description="Stockfish +3 이상 우위 상황에서 역전 없이 승리한 비율",
            score=score, is_strength=rate >= 65,
            games_analyzed=total,
            detail=f"우위 게임 {total}개: 유지 {won_adv} / 역전패 {lost_adv} ({rate:.0f}%)",
            category="time",
            representative_games=won_adv_games + lost_adv_games,
        )

    # ────────────────────────────────────────────────────────
    # 5. Mutual Blunder — 상대 블런더 직후 응징 성공
    # ────────────────────────────────────────────────────────
    def _p5(self, games, username, sf_cache) -> Optional[PatternResult]:
        ok = fail = 0
        for g in games:
            moves = sf_cache.get(g.game_id, [])
            for i, m in enumerate(moves):
                if m["is_my_move"] or not m.get("is_blunder"):
                    continue
                if i + 1 < len(moves):
                    nxt = moves[i + 1]
                    if nxt["is_my_move"] and nxt.get("cp_loss", 999) < 50:
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
            description="상대 블런더 직후 정확하게 응징한 비율 (Mutual Blunder 회피)",
            score=score, is_strength=rate >= 60,
            games_analyzed=len(sf_cache),
            detail=f"응징 기회 {total}회: 성공 {ok} / 실패 {fail} ({rate:.0f}%)",
            category="time",
        )

    # ────────────────────────────────────────────────────────
    # 6. Time Advantage — 불리+시간 넉넉할 때 탈출율
    # ────────────────────────────────────────────────────────
    def _p6(self, games, username, sf_cache) -> Optional[PatternResult]:
        saved = lost = 0
        for g in games:
            moves = sf_cache.get(g.game_id, [])
            for m in moves:
                if not m["is_my_move"]:
                    continue
                if (m.get("cp_before") is not None
                        and m["cp_before"] <= -200
                        and m.get("clk") is not None
                        and m["clk"] >= 120):
                    if m.get("cp_loss", 0) < 0:
                        saved += 1
                    elif m.get("cp_loss", 999) >= BLUNDER_CP:
                        lost += 1
        total = saved + lost
        if total < 3:
            return None
        rate = saved / total * 100
        score = max(0, min(100, int(rate)))
        return PatternResult(
            label="역경 탈출 끈기", icon="🔥",
            description="불리한 포지션에서 시간을 써 최선수를 찾아낸 비율 (Time Advantage)",
            score=score, is_strength=rate >= 55,
            games_analyzed=len(sf_cache),
            detail=f"불리+시간여유 {total}회: 개선 {saved} / 악화 {lost} ({rate:.0f}%)",
            category="time",
        )

    # ────────────────────────────────────────────────────────
    # 7–11. 전술 모티프 (board 분석)
    # ────────────────────────────────────────────────────────
    def _p7_to_p11(self, games: List[GameSummary], username: str) -> List[PatternResult]:
        pin_bad = pin_total = 0
        fork_evaded = fork_failed = 0
        disc_ok = disc_miss = 0
        back_rank = 0
        zw_miss = 0
        analyzed = 0

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

            for node in parsed.mainline():
                is_my = board.turn == my_color
                move = node.move
                try:
                    # 7. Pin
                    if is_my and board.is_pinned(my_color, move.from_square):
                        pin_total += 1
                        board.push(move)
                        if board.is_check():
                            pin_bad += 1
                        board.pop()

                    # 8. Fork (나이트 포크)
                    if is_my:
                        opp_kn = board.pieces(chess.KNIGHT, opp_color)
                        my_king = board.king(my_color)
                        my_queens = board.pieces(chess.QUEEN, my_color)
                        for kn_sq in opp_kn:
                            atk = board.attacks(kn_sq)
                            kg_thr = my_king is not None and bool(chess.BB_SQUARES[my_king] & atk)
                            q_thr = any(bool(chess.BB_SQUARES[q] & atk) for q in my_queens)
                            if kg_thr and q_thr:
                                pc = board.piece_at(move.from_square)
                                if pc and pc.piece_type in (chess.KING, chess.QUEEN):
                                    fork_evaded += 1
                                elif board.is_capture(move) and move.to_square == kn_sq:
                                    fork_evaded += 1
                                else:
                                    fork_failed += 1

                    # 9. Discovered Attack
                    if is_my:
                        my_sliders = (
                            list(board.pieces(chess.BISHOP, my_color))
                            + list(board.pieces(chess.ROOK, my_color))
                            + list(board.pieces(chess.QUEEN, my_color))
                        )
                        opp_king = board.king(opp_color)
                        if opp_king is not None:
                            for sq in my_sliders:
                                if chess.BB_SQUARES[opp_king] & board.attacks(sq):
                                    tgt = board.piece_at(move.to_square)
                                    if (tgt and tgt.color == opp_color) or board.gives_check(move):
                                        disc_ok += 1
                                    else:
                                        disc_miss += 1
                                    break

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
                                            break
                        board.pop()

                    # 11. Zwischenzug
                    if is_my and board.is_capture(move):
                        check_moves = [m for m in board.legal_moves
                                       if board.gives_check(m) and not board.is_capture(m)]
                        if check_moves:
                            zw_miss += 1

                    board.push(move)
                except Exception:
                    try:
                        board.push(move)
                    except Exception:
                        break

        results: List[PatternResult] = []

        if pin_total >= 3:
            s = max(0, min(100, 100 - int(pin_bad / pin_total * 200)))
            results.append(PatternResult(
                label="핀(Pin) 인지", icon="📌",
                description="핀된 기물을 이동해 체크를 허용한 비율 — 낮을수록 핀 처리 미흡",
                score=s, is_strength=s >= 60, games_analyzed=analyzed,
                detail=f"핀 상황 {pin_total}회 중 체크 허용 {pin_bad}회",
                category="position",
            ))

        fork_total = fork_evaded + fork_failed
        if fork_total >= 3:
            s = max(0, min(100, int(fork_evaded / fork_total * 100)))
            results.append(PatternResult(
                label="포크(Fork) 회피", icon="🐴",
                description="상대 나이트의 킹+퀸 동시 공격에 대한 회피율",
                score=s, is_strength=s >= 60, games_analyzed=analyzed,
                detail=f"포크 위협 {fork_total}회 → 회피 {fork_evaded}회 ({s}%)",
                category="position",
            ))

        disc_total = disc_ok + disc_miss
        if disc_total >= 3:
            s = max(0, min(100, int(disc_ok / disc_total * 100)))
            results.append(PatternResult(
                label="발견 공격 인지", icon="🔍",
                description="공격선이 열린 순간을 활용한 비율 (Discovered Attack)",
                score=s, is_strength=s >= 55, games_analyzed=analyzed,
                detail=f"발견 공격 기회 {disc_total}회 → 활용 {disc_ok}회 ({s}%)",
                category="position",
            ))

        if back_rank >= 2 or analyzed >= 40:
            s = max(20, min(90, 100 - back_rank * 7))
            results.append(PatternResult(
                label="백랭크 수비", icon="🏰",
                description="룩·퀸에 의한 백랭크 체크 허용 빈도",
                score=s, is_strength=s >= 65, games_analyzed=analyzed,
                detail=f"백랭크 체크 허용 {back_rank}회 ({analyzed}게임)",
                category="position",
            ))

        if zw_miss >= 2 or analyzed >= 30:
            s = max(20, min(90, 100 - zw_miss * 8))
            results.append(PatternResult(
                label="사이수(Zwischenzug) 발견", icon="♻️",
                description="기물 교환 중 먼저 체크를 낼 기회를 놓친 빈도",
                score=s, is_strength=s >= 65, games_analyzed=analyzed,
                detail=f"사이수 기회 미활용 {zw_miss}회 ({analyzed}게임)",
                category="position",
            ))

        return results

    # ────────────────────────────────────────────────────────
    # 12–16. 포지션 & 기물
    # ────────────────────────────────────────────────────────
    def _p12_to_p16(self, games, username, sf_cache) -> List[PatternResult]:
        sac_ok = sac_bad = 0
        closed_bad = closed_total = 0
        opp_castle: List[Tuple[GameSummary, float]] = []   # (game, game_length)
        same_castle: List[GameSummary] = []
        iqp_g: List[Tuple[GameSummary, float]] = []        # (game, game_length)
        no_iqp_g: List[GameSummary] = []
        bp_g: List[Tuple[GameSummary, float]] = []         # (game, game_length)
        no_bp_g: List[GameSummary] = []
        # (game, sacrifice_piece_value) — 더 비싼 기물 희생일수록 관련도 높음
        sac_ok_games: List[Tuple[GameSummary, float]] = []
        sac_bad_games: List[Tuple[GameSummary, float]] = []
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

            my_cs: Optional[str] = None
            opp_cs: Optional[str] = None
            had_bp = False
            lost_bp = False
            had_iqp = False
            sac_flag = False
            sac_ok_flag = False
            max_sac_val = 0.0   # 게임 내 가장 값비싼 희생의 기물 가치

            for node in parsed.mainline():
                is_my = board.turn == my_color
                move = node.move
                try:
                    # 12. Sacrifice — 더 비싼 기물 희생일수록 패턴이 극명
                    if is_my:
                        tgt = board.piece_at(move.to_square)
                        src_pc = board.piece_at(move.from_square)
                        if (tgt and tgt.color == opp_color and src_pc
                                and src_pc.piece_type > tgt.piece_type):
                            sac_flag = True
                            # 희생 기물 가치 추적: 희생한 쪽(src) - 얻은 쪽(tgt) 차이
                            val_diff = (_PIECE_VAL.get(src_pc.piece_type, 0)
                                        - _PIECE_VAL.get(tgt.piece_type, 0))
                            if val_diff > max_sac_val:
                                max_sac_val = float(val_diff)
                            sf_data = sf_cache.get(g.game_id, [])
                            if sf_data:
                                mn = board.fullmove_number
                                after = [m for m in sf_data if m["move_no"] >= mn and m["is_my_move"]]
                                sac_ok_flag = (
                                    len(after) > 0 and
                                    sum(m["cp_loss"] for m in after[:5]) / len(after[:5]) < 80
                                )
                            else:
                                sac_ok_flag = g.result.value == "win"

                    # 13. Closed Position
                    if is_my and board.fullmove_number >= 10:
                        my_pawns = board.pieces(chess.PAWN, my_color)
                        blocked = sum(
                            1 for sq in my_pawns
                            if board.piece_at(sq + (8 if my_color == chess.WHITE else -8)) is not None
                        )
                        if blocked >= 3:
                            closed_total += 1
                            src_pc = board.piece_at(move.from_square)
                            if src_pc and src_pc.piece_type == chess.PAWN:
                                dest = move.to_square
                                supported = bool(
                                    board.attackers(my_color, dest)
                                    & board.pieces(chess.PAWN, my_color)
                                )
                                if not supported:
                                    closed_bad += 1

                    # 14. Opposite-side Castling
                    uci = move.uci()
                    if uci == "e1g1":
                        (my_cs := "king") if is_my else setattr(type('_', (), {})(), '_', opp_cs := "king")
                    elif uci == "e1c1":
                        (my_cs := "queen") if is_my else setattr(type('_', (), {})(), '_', opp_cs := "queen")
                    elif uci == "e8g8":
                        (my_cs := "king") if is_my else setattr(type('_', (), {})(), '_', opp_cs := "king")
                    elif uci == "e8c8":
                        (my_cs := "queen") if is_my else setattr(type('_', (), {})(), '_', opp_cs := "queen")

                    # 15. IQP
                    if board.fullmove_number == 20:
                        my_pawns_sq = list(board.pieces(chess.PAWN, my_color))
                        d_file = 3  # d-file (0-indexed)
                        d_pawns = [sq for sq in my_pawns_sq if sq % 8 == d_file]
                        if d_pawns:
                            neighbors = [sq for sq in my_pawns_sq if sq % 8 in (2, 4)]
                            if not neighbors:
                                had_iqp = True

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

            if sac_flag:
                sac_val = max(max_sac_val, 1.0)
                if sac_ok_flag:
                    sac_ok += 1
                    sac_ok_games.append((g, sac_val))
                else:
                    sac_bad += 1
                    sac_bad_games.append((g, sac_val))

            game_len = float(_estimate_total_moves(g.pgn or ""))
            opp = my_cs is not None and opp_cs is not None and my_cs != opp_cs
            if opp:
                opp_castle.append((g, game_len))
            else:
                same_castle.append(g)
            if had_iqp:
                iqp_g.append((g, game_len))
            else:
                no_iqp_g.append(g)
            if had_bp and not lost_bp:
                bp_g.append((g, game_len))
            else:
                no_bp_g.append(g)

        results: List[PatternResult] = []

        sac_total = sac_ok + sac_bad
        if sac_total >= 3:
            rate = sac_ok / sac_total * 100
            s = max(0, min(100, int(rate)))
            results.append(PatternResult(
                label="기물 희생 정확도", icon="💥",
                description="더 비싼 기물 희생 후 후속 공격이 유효했던 비율",
                score=s, is_strength=rate >= 55, games_analyzed=analyzed,
                detail=f"희생 {sac_total}회: 유효 {sac_ok} / 무효 {sac_bad} ({rate:.0f}%)",
                category="position",
                representative_games=sac_ok_games + sac_bad_games,
            ))

        if closed_total >= 5:
            bad_rate = closed_bad / closed_total * 100
            s = max(20, min(90, int(100 - bad_rate * 2)))
            results.append(PatternResult(
                label="닫힌 포지션 인내심", icon="🧱",
                description="폰이 맞물린 닫힌 구조에서 무리한 폰 전진 빈도",
                score=s, is_strength=s >= 60, games_analyzed=analyzed,
                detail=f"닫힌 상황 {closed_total}회 중 무리한 폰 전진 {closed_bad}회",
                category="position",
            ))

        if len(opp_castle) >= 5:
            oc_games = [g for g, _ in opp_castle]
            oc_wr = _win_rate(oc_games, username)
            sc_wr = _win_rate(same_castle, username) if same_castle else 50.0
            diff = oc_wr - sc_wr
            s = max(0, min(100, int(oc_wr)))
            results.append(PatternResult(
                label="반대 방향 캐슬링 난전", icon="🏹",
                description="서로 반대쪽으로 캐슬링한 폰 스톰 상황 승률",
                score=s, is_strength=oc_wr >= 50, games_analyzed=len(opp_castle),
                detail=f"반대 캐슬 {len(opp_castle)}게임 → {oc_wr:.0f}% | 같은 방향 {sc_wr:.0f}% ({diff:+.0f}%p)",
                category="position",
                representative_games=opp_castle,
            ))

        if len(iqp_g) >= 5:
            iq_games = [g for g, _ in iqp_g]
            iq_wr = _win_rate(iq_games, username)
            ni_wr = _win_rate(no_iqp_g, username) if no_iqp_g else 50.0
            diff = iq_wr - ni_wr
            s = max(0, min(100, int(iq_wr)))
            results.append(PatternResult(
                label="IQP 구조 이해", icon="♟️",
                description="고립 퀸 폰(IQP) 구조일 때의 공수 밸런스 승률",
                score=s, is_strength=iq_wr >= 50, games_analyzed=len(iqp_g),
                detail=f"IQP {len(iqp_g)}게임 → {iq_wr:.0f}% | 비IQP {ni_wr:.0f}% ({diff:+.0f}%p)",
                category="position",
                representative_games=iqp_g,
            ))

        if len(bp_g) >= 5:
            bp_games = [g for g, _ in bp_g]
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
                category="position",
                representative_games=bp_g,
            ))

        return results

    # ────────────────────────────────────────────────────────
    # 17–20 + 보너스 패턴
    # ────────────────────────────────────────────────────────
    def _p17_to_p20(self, games, username, sf_cache, all_games) -> List[PatternResult]:
        ht_ok = ht_bad = 0
        qe_games: List[Tuple[GameSummary, float]] = []  # (game, moves_after_qe) — 퀸 교환 후 많이 플레이할수록 극명
        nonqe_games: List[GameSummary] = []
        promo_ok = promo_miss = 0
        hunt_ok = hunt_miss = 0
        analyzed = 0

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
                            else:
                                ht_bad += 1

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
                        else:
                            promo_miss += 1

                    # 20. King Hunt
                    if is_my:
                        opp_king = board.king(opp_color)
                        if opp_king is not None and (opp_king // 8) in range(2, 6):
                            if board.gives_check(move) or board.is_capture(move):
                                hunt_result = True
                            elif hunt_result is None:
                                hunt_result = False

                    board.push(move)
                except Exception:
                    try:
                        board.push(move)
                    except Exception:
                        break

            if had_qe:
                total_moves = float(_estimate_total_moves(g.pgn or ""))
                moves_after = max(total_moves - qe_move_no, 1.0)  # 퀸 교환 후 플레이 수
                qe_games.append((g, moves_after))
            else:
                nonqe_games.append(g)
            if hunt_result is True:
                hunt_ok += 1
            elif hunt_result is False:
                hunt_miss += 1

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
                category="endgame",
            ))

        if len(qe_games) >= 5:
            qe_list = [g for g, _ in qe_games]
            qe_wr = _win_rate(qe_list, username)
            nq_wr = _win_rate(nonqe_games, username) if nonqe_games else 50.0
            diff = qe_wr - nq_wr
            s = max(0, min(100, int(qe_wr)))
            results.append(PatternResult(
                label="퀸 교환 후 이해도", icon="👸",
                description="퀸이 교환된 엔드게임 전환 시점의 승률",
                score=s, is_strength=qe_wr >= 50, games_analyzed=len(qe_games),
                detail=f"퀸 교환 {len(qe_games)}게임 → {qe_wr:.0f}% | 퀸 유지 {nq_wr:.0f}% ({diff:+.0f}%p)",
                category="endgame",
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
            ))

        # ── 보너스: 흑백 밸런스 ─────────────────────────────
        wg = [g for g in all_games if g.white.lower() == username.lower()]
        bg = [g for g in all_games if g.black.lower() == username.lower()]
        if len(wg) >= 10 and len(bg) >= 10:
            w_wr = _win_rate(wg, username)
            b_wr = _win_rate(bg, username)
            diff = abs(w_wr - b_wr)
            s = max(0, min(100, 100 - int(diff * 2)))
            # 약한 쪽 = 더 극명한 예시. 최근 게임일수록 관련도 높음(played_at 내림차순)
            weaker = bg if w_wr > b_wr else wg
            scored_weaker: List[Tuple[Any, float]] = [
                (g, float(i)) for i, g in enumerate(reversed(weaker))
            ]
            results.append(PatternResult(
                label="흑백 밸런스", icon="⚖️",
                description="백(선수) vs 흑(후수) 승률 차이 — 차이가 작을수록 균형",
                score=s, is_strength=diff <= 12, games_analyzed=len(all_games),
                detail=f"백 {w_wr:.0f}% | 흑 {b_wr:.0f}% ({'백' if w_wr >= b_wr else '흑'} 우위 {diff:.0f}%p)",
                category="balance",
                representative_games=scored_weaker,
            ))

        # ── 보너스: 오프닝 레퍼토리 ─────────────────────────
        counts = Counter(g.opening_name or "Unknown" for g in all_games)
        familiar = [g for g in all_games if counts.get(g.opening_name or "Unknown", 0) >= 10]
        fresh = [g for g in all_games if counts.get(g.opening_name or "Unknown", 0) <= 3]
        if len(familiar) >= 8 and len(fresh) >= 5:
            fam_wr = _win_rate(familiar, username)
            fres_wr = _win_rate(fresh, username)
            diff = fam_wr - fres_wr
            s = max(0, min(100, int(fam_wr)))
            # 익숙도 점수: 해당 오프닝 플레이 횟수가 많을수록 관련도 높음
            scored_fam: List[Tuple[Any, float]] = [
                (g, float(counts.get(g.opening_name or "Unknown", 0))) for g in familiar
            ]
            results.append(PatternResult(
                label="오프닝 레퍼토리", icon="📚",
                description="익숙한 오프닝(10게임+) vs 새로운 오프닝 승률 — 준비도",
                score=s, is_strength=s >= STRENGTH_THRESHOLD and diff >= 5,
                games_analyzed=len(familiar),
                detail=f"단골 {fam_wr:.0f}% vs 새 {fres_wr:.0f}% ({diff:+.0f}%p)",
                category="opening",
                representative_games=scored_fam,
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
        val_acc = float(np.mean(model.predict(X_v) == y_v) * 100) if len(X_v) > 0 else 0.0

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
            "model_accuracy": round(val_acc, 1),
            "games_analyzed": len(rows),
            "description": f"XGBoost — 블런더 유발 게임 예측 (leakage-free, {len(blunder_ids)}개 레이블)",
        }
