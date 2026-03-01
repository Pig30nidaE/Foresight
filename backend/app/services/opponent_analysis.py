"""
대회 준비용 상대 분석 서비스 (OpponentAnalysisService)
=======================================================

설계 원칙
---------
1. 데이터 누수(Data Leakage) 완전 제거
   - 피처에 게임 결과(승/패) 절대 포함 금지
   - 타깃 = Stockfish cp_loss (결과가 아닌 수 품질)

2. Stockfish 스냅샷 방식 (기존 대비 ~15배 빠름)
   - 게임당 3개 위치만 평가 (10수/22수/36수 이후 포지션)
   - 엔진 1회 시작 → 전체 게임 배치 처리

3. LightGBM 페이즈 약점 예측
   - 게임 문맥 피처(오프닝 패밀리, 시간 사용 패턴, 구조) → 페이즈별 cp_loss 예측
   - 특성 중요도로 "어떤 상황에서 무너지는가" 추출

4. K-Means 플레이 스타일 군집화
   - 행동 피처만 사용 (결과 제외), k=4
   - 각 군집의 평균 cp_loss로 취약 플레이 스타일 식별

5. 준비 조언 생성 (대회용)
   - 오프닝별 약점 → "무엇을 준비할 것인가"
   - 페이즈별 약점 → "어떤 종류의 포지션으로 유도할 것인가"
   - 심리/시간 패턴 → "언제 압박을 가할 것인가"

출력 구조 (OpponentReport)
--------------------------
{
  "summary": { style_tag, risk_level, games_analyzed, key_insight },
  "opening_profile": {
    "white_tree": [...ECO 그룹별 통계...],
    "black_tree": [...ECO 그룹별 통계...],
    "weakest_as_white": "...",
    "weakest_as_black": "..."
  },
  "phase_weakness": {
    "opening": { avg_cp_loss, score, percentile, description },
    "middlegame": { ... },
    "endgame": { ... },
    "weakest_phase": "endgame"
  },
  "style_profile": {
    "tactical_score": 0..100,
    "time_management_score": 0..100,
    "complexity_preference": "open|closed|semi-open",
    "game_length_tendency": "short|medium|long",
    "clock_pressure_threshold": 25   ← 몇 수 이후 시간 압박 시작하는지
  },
  "ml_insights": {
    "blunder_triggers": [{ feature, impact, description }],
    "style_clusters": [{ label, n_games, avg_cp_loss, description }],
    "lgbm_accuracy": 0.0
  },
  "preparation_advice": [
    { priority: 1, category: "opening", title: "...", detail: "...", confidence: "high" }
  ]
}
"""
from __future__ import annotations

import io
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple

import numpy as np
import chess
import chess.pgn
import chess.engine
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score
import lightgbm as lgb

from app.models.schemas import GameSummary

# ── 상수 ──────────────────────────────────────────────────────────────────────
STOCKFISH_PATH = "/opt/homebrew/bin/stockfish"

# Stockfish 스냅샷: 게임당 3개 수 위치 분석 (기존 수당 분석 대비 ~15배 빠름)
SF_SNAPSHOT_MOVES = [10, 22, 36]   # 오프닝 끝 / 미들게임 중반 / 엔드게임 진입
SF_SNAPSHOT_DEPTH = 10             # depth 10 → 스냅샷 3개이므로 감당 가능
SF_BUDGET_GAMES   = 30             # 스냅샷 분석 게임 수
MIN_GAMES_ML      = 40             # ML 모델 활성화 최소 게임 수
MIN_GAMES_ADVICE  = 20             # 준비 조언 최소 게임 수

_RE_CLK = re.compile(r"\[%clk\s+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)\]")
_RE_EMT = re.compile(r"\[%emt\s+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)\]")

ECO_GROUP = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}
ECO_NAME  = {
    "A": "비정통 / 인디언 계열",
    "B": "반개방 (1.e4)",
    "C": "개방 (1.e4 e5)",
    "D": "퀸 갬빗 / 정통 d4",
    "E": "인디언 디펜스 (1.d4 Nf6)",
}

# ── 헬퍼 ─────────────────────────────────────────────────────────────────────
def _clk_sec(h: str, m: str, s: str) -> float:
    return int(h) * 3600 + int(m) * 60 + float(s)

def _parse_clock(comment: str) -> Optional[float]:
    mt = _RE_CLK.search(comment or "")
    return _clk_sec(*mt.groups()) if mt else None

def _parse_emt(comment: str) -> Optional[float]:
    mt = _RE_EMT.search(comment or "")
    return _clk_sec(*mt.groups()) if mt else None

def _eco_group(eco: Optional[str]) -> int:
    if not eco:
        return -1
    return ECO_GROUP.get(eco[0].upper(), -1)

def _parse_game(pgn_str: str) -> Optional[chess.pgn.Game]:
    try:
        return chess.pgn.read_game(io.StringIO(pgn_str))
    except Exception:
        return None

def _result_value(g: GameSummary) -> float:
    v = g.result.value if g.result else "loss"
    return {"win": 1.0, "draw": 0.5, "loss": 0.0}.get(v, 0.0)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stockfish 스냅샷 헬퍼
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class SnapshotHelper:
    """
    게임당 3개 수(10/22/36수 직후)의 포지션만 Stockfish로 평가.
    기존 수당 분석 대비 ~15배 빠르며, 페이즈별 cp 추출에 충분.

    반환:  {game_id: {"opening_cp": float, "middle_cp": float, "end_cp": float,
                       "opening_loss": float, "middle_loss": float, "end_loss": float}}
    """
    def __init__(self, path: str = STOCKFISH_PATH):
        self.path = path
        self.available = os.path.exists(path)

    def batch(
        self,
        games: List[GameSummary],
        username: str,
        snap_moves: List[int] = SF_SNAPSHOT_MOVES,
        depth: int = SF_SNAPSHOT_DEPTH,
    ) -> Dict[str, Dict[str, float]]:
        if not self.available:
            return {}
        out: Dict[str, Dict[str, float]] = {}
        try:
            with chess.engine.SimpleEngine.popen_uci(self.path) as engine:
                engine.configure({"Threads": 1, "Hash": 32})
                for g in games:
                    if not g.pgn:
                        continue
                    snap = self._snap_one(engine, g, username, snap_moves, depth)
                    if snap:
                        out[g.game_id] = snap
        except Exception:
            pass
        return out

    def _snap_one(
        self,
        engine: chess.engine.SimpleEngine,
        g: GameSummary,
        username: str,
        snap_moves: List[int],
        depth: int,
    ) -> Optional[Dict[str, float]]:
        parsed = _parse_game(g.pgn or "")
        if not parsed:
            return None

        is_white = g.white.lower() == username.lower()
        board = parsed.board()
        mainline = list(parsed.mainline())

        cp_at: Dict[int, float] = {}  # {move_no: cp from my perspective}

        def _eval_board(bd: chess.Board) -> Optional[float]:
            try:
                info = engine.analyse(bd, chess.engine.Limit(depth=depth),
                                       info=chess.engine.INFO_SCORE)
                sc = info.get("score")
                if sc is None:
                    return None
                rel = sc.relative
                raw = 2000.0 if rel.is_mate() and rel.mate() > 0 else \
                      -2000.0 if rel.is_mate() else float(rel.cp or 0)
                # 내 시점으로 변환
                return raw if (bd.turn == chess.WHITE) == is_white else -raw
            except Exception:
                return None

        for node in mainline:
            mn = board.fullmove_number
            if mn in snap_moves:
                val = _eval_board(board)
                if val is not None:
                    cp_at[mn] = val
            if mn > max(snap_moves):
                break
            try:
                board.push(node.move)
            except Exception:
                break

        if not cp_at:
            return None

        # 페이즈별 cp_loss 계산:
        #   cp_loss = max(0, prev_cp - curr_cp)  → 내 포지션이 얼마나 나빠졌는가
        snaps = sorted(cp_at.items())  # [(move, cp), ...]
        prev = 0.0  # 시작 포지션은 0 (균형)
        phase_keys = ["opening", "middle", "end"]
        phase_cp: Dict[str, float] = {}
        phase_loss: Dict[str, float] = {}
        for i, (mn, cp) in enumerate(snaps[:3]):
            key = phase_keys[i]
            phase_cp[f"{key}_cp"] = round(cp, 1)
            phase_loss[f"{key}_loss"] = round(max(0.0, prev - cp), 1)
            prev = cp

        return {**phase_cp, **phase_loss}


_snap_helper = SnapshotHelper()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 게임 피처 추출 (결과 제외 — 데이터 누수 없음)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FEAT_NAMES = [
    "백_플레이",           # 0: 백=1, 흑=0
    "ECO_그룹",            # 1: A=0, B=1, C=2, D=3, E=4, 불명=-1→2.5
    "ECO_친숙도",          # 2: 해당 오프닝 5게임+ 플레이 = 1
    "게임_길이",           # 3: 전체 수 (정규화 아님)
    "오프닝압박_비율",     # 4: 1~12수 중 잔여클록 <90s 비율
    "미들게임압박_비율",   # 5: 13~30수 중 잔여클록 <60s 비율
    "빠른응수_비율",       # 6: emt ≤ 3s 비율
    "클록_변동성",         # 7: 내 수들의 잔여클록 std
    "오프닝_시간소모",     # 8: 1~12수에 쓴 시간 비율 (전체 사용 대비)
    "포지션_개방도",       # 9: 20수 시점 폰 수 (적을수록 열린 게임)
    "기물교환_빈도",       # 10: 캡처 수 / 게임 길이
    "반대캐슬링",          # 11: 서로 반대 방향 캐슬링 = 1
    "퀸_교환_여부",        # 12: 퀸×퀸 교환 발생 = 1
]
N_FEAT = len(FEAT_NAMES)

def extract_features(games: List[GameSummary], username: str) -> np.ndarray:
    """게임 목록 → (N, 13) 피처 행렬 (결과 변수 없음)."""
    opening_counts = Counter(g.opening_eco or "X" for g in games)
    rows = []
    for g in games:
        rows.append(_feat_one(g, username, opening_counts))
    return np.array(rows, dtype=float)


def _feat_one(
    g: GameSummary,
    username: str,
    opening_counts: Counter,
) -> List[float]:
    is_white = 1.0 if g.white.lower() == username.lower() else 0.0
    eco_g = float(_eco_group(g.opening_eco))
    if eco_g < 0:
        eco_g = 2.5  # 불명 → 중간값
    eco_fam = 1.0 if opening_counts.get(g.opening_eco or "X", 0) >= 5 else 0.0

    gl = 0.0
    op_pressure = 0.0; mid_pressure = 0.0
    quick_ratio = 0.0; clk_std = 0.0
    op_time_share = 0.0; pawn_open = 16.0
    capture_ratio = 0.0; opp_castle = 0.0; queen_ex = 0.0

    if g.pgn:
        parsed = _parse_game(g.pgn)
        if parsed:
            board = parsed.board()
            my_clks: List[float] = []
            op_clks: List[float] = []
            emt_my: List[float] = []
            total_cap = 0
            moves_total = 0
            my_castle: Optional[str] = None
            opp_castle_side: Optional[str] = None
            had_queen_ex = False

            for node in parsed.mainline():
                mn = board.fullmove_number
                is_my = (board.turn == chess.WHITE) == bool(is_white)
                move = node.move
                comment = node.comment or ""

                clk = _parse_clock(comment)
                emt = _parse_emt(comment)

                if is_my:
                    if clk is not None:
                        my_clks.append(clk)
                    if emt is not None:
                        emt_my.append(emt)
                else:
                    if clk is not None:
                        op_clks.append(clk)

                if board.is_capture(move):
                    total_cap += 1
                    # 퀸 교환
                    src = board.piece_at(move.from_square)
                    tgt = board.piece_at(move.to_square)
                    if src and tgt and \
                       src.piece_type == chess.QUEEN and \
                       tgt.piece_type == chess.QUEEN:
                        had_queen_ex = True

                # 캐슬링 추적
                uci = move.uci()
                if uci in ("e1g1", "e8g8"):
                    side = "king"
                    (my_castle if is_my else None)
                    if is_my:
                        my_castle = "king"
                    else:
                        opp_castle_side = "king"
                elif uci in ("e1c1", "e8c8"):
                    if is_my:
                        my_castle = "queen"
                    else:
                        opp_castle_side = "queen"

                # 20수 시점 폰 수 (개방도)
                if mn == 20:
                    pawn_open = float(len(list(board.pieces(chess.PAWN, chess.WHITE)))
                                      + len(list(board.pieces(chess.PAWN, chess.BLACK))))

                moves_total += 1
                try:
                    board.push(move)
                except Exception:
                    break

            gl = float(moves_total)

            # 시간 압박 비율
            if my_clks:
                # 처음 12수, 13~30수 인덱스 나누기 (약식)
                op_moves = my_clks[:12]
                mid_moves = my_clks[12:30]
                op_pressure = sum(1 for c in op_moves if c < 90) / max(len(op_moves), 1)
                mid_pressure = sum(1 for c in mid_moves if c < 60) / max(len(mid_moves), 1)
                clk_std = float(np.std(my_clks)) if len(my_clks) >= 3 else 0.0

                # 오프닝 시간 소모 비율
                if len(my_clks) >= 2:
                    total_used = my_clks[0] - my_clks[-1]
                    op_used = my_clks[0] - my_clks[min(11, len(my_clks) - 1)]
                    op_time_share = (op_used / total_used) if total_used > 0 else 0.5

            if emt_my:
                quick_ratio = sum(1 for e in emt_my if e <= 3.0) / len(emt_my)

            if gl > 0:
                capture_ratio = total_cap / gl

            if my_castle and opp_castle_side:
                opp_castle = 1.0 if my_castle != opp_castle_side else 0.0

            queen_ex = 1.0 if had_queen_ex else 0.0

    return [
        is_white, eco_g, eco_fam, gl,
        op_pressure, mid_pressure, quick_ratio, clk_std,
        op_time_share, pawn_open, capture_ratio, opp_castle, queen_ex,
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 오프닝 프로파일러
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def build_opening_profile(
    games: List[GameSummary],
    username: str,
    sf_data: Dict[str, Dict] = None,
) -> Dict[str, Any]:
    """
    오프닝별 승률 + Stockfish avg_opening_loss 통계 생성.
    준비 조언의 핵심 입력.
    """
    sf_data = sf_data or {}

    white_eco: Dict[str, List] = defaultdict(list)
    black_eco: Dict[str, List] = defaultdict(list)

    for g in games:
        eco = g.opening_eco or "?"
        eco_grp = eco[0].upper() if eco and eco[0].isalpha() else "?"
        res = _result_value(g)
        sf = sf_data.get(g.game_id, {})
        op_loss = sf.get("opening_loss", None)

        entry = {
            "eco": eco,
            "name": g.opening_name or "Unknown",
            "result": res,
            "op_loss": op_loss,
        }
        if g.white.lower() == username.lower():
            white_eco[eco_grp].append(entry)
        else:
            black_eco[eco_grp].append(entry)

    def _summarize(eco_dict: Dict[str, List]) -> List[Dict]:
        out = []
        for grp, entries in sorted(eco_dict.items()):
            wr = np.mean([e["result"] for e in entries]) * 100
            losses = [e["op_loss"] for e in entries if e["op_loss"] is not None]
            avg_loss = float(np.mean(losses)) if losses else None
            # 가장 많이 쓴 오프닝 이름
            top_name = Counter(e["name"] for e in entries).most_common(1)[0][0]
            out.append({
                "eco_group": grp,
                "eco_group_name": ECO_NAME.get(grp, "기타"),
                "games": len(entries),
                "win_rate": round(wr, 1),
                "avg_opening_cp_loss": round(avg_loss, 1) if avg_loss is not None else None,
                "top_opening": top_name,
            })
        return sorted(out, key=lambda x: x["games"], reverse=True)

    white_tree = _summarize(white_eco)
    black_tree = _summarize(black_eco)

    def _weakest(tree: List[Dict]) -> Optional[str]:
        candidates = [t for t in tree if t["games"] >= 5]
        if not candidates:
            return None
        by_loss = [c for c in candidates if c["avg_opening_cp_loss"] is not None]
        if by_loss:
            w = max(by_loss, key=lambda x: x["avg_opening_cp_loss"])
        else:
            w = min(candidates, key=lambda x: x["win_rate"])
        return f"{w['eco_group']}-group ({w['eco_group_name']}) — 승률 {w['win_rate']:.0f}%"

    return {
        "white_tree": white_tree,
        "black_tree": black_tree,
        "weakest_as_white": _weakest(white_tree),
        "weakest_as_black": _weakest(black_tree),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 페이즈 약점 집계
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def build_phase_weakness(sf_data: Dict[str, Dict]) -> Dict[str, Any]:
    """스냅샷 데이터로 페이즈별 avg_cp_loss 집계."""
    if not sf_data:
        return {}

    op_losses  = [v["opening_loss"]  for v in sf_data.values() if "opening_loss"  in v]
    mid_losses = [v["middle_loss"]   for v in sf_data.values() if "middle_loss"   in v]
    end_losses = [v["end_loss"]      for v in sf_data.values() if "end_loss"       in v]

    def _phase_stat(losses: List[float], label: str) -> Dict:
        if not losses:
            return {"avg_cp_loss": None, "score": None, "n": 0, "label": label}
        avg = float(np.mean(losses))
        # score: 낮은 cp_loss = 높은 점수 (100 = 완벽, 0 = 매우 취약)
        # cp_loss 10 이하 = 강점, 50 이상 = 약점 기준
        score = max(0, min(100, int(100 - avg * 1.5)))
        return {
            "avg_cp_loss": round(avg, 1),
            "score": score,
            "n": len(losses),
            "label": label,
        }

    phases = {
        "opening":    _phase_stat(op_losses,  "오프닝"),
        "middlegame": _phase_stat(mid_losses, "미들게임"),
        "endgame":    _phase_stat(end_losses, "엔드게임"),
    }

    # 가장 약한 페이즈
    scored = {k: v for k, v in phases.items() if v["score"] is not None}
    weakest = min(scored, key=lambda k: scored[k]["score"]) if scored else None

    return {**phases, "weakest_phase": weakest}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 스타일 프로파일러
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def build_style_profile(
    games: List[GameSummary],
    username: str,
    X: np.ndarray,
) -> Dict[str, Any]:
    """행동 피처 기반 플레이 스타일 프로파일."""
    if len(X) == 0:
        return {}

    # 전술성 점수: 짧은 게임 + 높은 캡처 빈도 + 개방형 오프닝
    tactical_raw = (
        np.clip(1 - (X[:, 3] - 15) / 50, 0, 1) * 0.3   # 게임 길이 반비례
        + np.clip(X[:, 10] * 5, 0, 1) * 0.4              # 기물교환 빈도
        + np.clip((X[:, 9] - 8) / 8, 0, 1) * 0.3         # 개방도 (폰 적을수록 개방)  
        # 위 계산에서 개방도는 폰 수이므로 적을수록 개방 → 반전
    )
    tactical_score = int(np.mean(tactical_raw) * 100)

    # 시간 관리 점수: 압박 비율 낮음 + 변동성 낮음
    time_score_raw = (
        np.clip(1 - X[:, 4], 0, 1) * 0.4       # 오프닝 압박 없음
        + np.clip(1 - X[:, 5], 0, 1) * 0.4      # 미들게임 압박 없음
        + np.clip(1 - X[:, 7] / 120, 0, 1) * 0.2  # 클록 변동 낮음
    )
    time_score = int(np.mean(time_score_raw) * 100)

    # 게임 길이 경향
    avg_gl = float(np.mean(X[:, 3]))
    if avg_gl < 25:
        length_tag = "short"
    elif avg_gl < 40:
        length_tag = "medium"
    else:
        length_tag = "long"

    # 오프닝 복잡도 경향
    eco_avg = float(np.mean([v for v in X[:, 1] if v != 2.5]))
    if eco_avg < 1.5:
        complexity = "closed"
    elif eco_avg < 3.0:
        complexity = "semi-open"
    else:
        complexity = "open"

    # 시간 압박 시작 시점 추정 (몇 번째 수부터 50% 이상이 압박 상태?)
    # quick_ratio가 높으면 일찍부터 시간 부족
    avg_quick = float(np.mean(X[:, 6]))
    if avg_quick > 0.5:
        clock_pressure_threshold = 15
    elif avg_quick > 0.25:
        clock_pressure_threshold = 25
    else:
        clock_pressure_threshold = 40

    # 오프닝 준비도
    avg_fam = float(np.mean(X[:, 2]))

    # 퀸 교환 선호도
    qe_rate = float(np.mean(X[:, 12]))

    return {
        "tactical_score": max(0, min(100, tactical_score)),
        "time_management_score": max(0, min(100, time_score)),
        "complexity_preference": complexity,
        "game_length_tendency": length_tag,
        "clock_pressure_threshold": clock_pressure_threshold,
        "opening_preparation_score": int(avg_fam * 100),
        "queen_exchange_rate": round(qe_rate * 100, 1),
        "opposite_castling_rate": round(float(np.mean(X[:, 11])) * 100, 1),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LightGBM: 페이즈별 cp_loss 예측 → 블런더 트리거 추출
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FEAT_DESCRIPTIONS: Dict[str, str] = {
    "오프닝압박_비율":   "오프닝에서 시간 압박을 많이 받을수록 수 품질 저하",
    "미들게임압박_비율": "미들게임 후반 시간 압박과 실수 상관관계",
    "빠른응수_비율":     "직관적 빠른 응수가 많을수록 수 품질 저하",
    "클록_변동성":       "남은 시간의 불규칙한 변동 → 집중력 저하",
    "ECO_친숙도":        "낯선 오프닝에서 실수 집중",
    "ECO_그룹":          "특정 오프닝 계열에서 수 품질 취약",
    "게임_길이":         "게임 길이와 실수 발생 페이즈 상관관계",
    "포지션_개방도":     "개방/폐쇄 포지션 타입 선호/취약도",
    "기물교환_빈도":     "기물 교환이 많은 전술적 게임 처리",
    "반대캐슬링":        "서로 반대 캐슬링 후 난전 상황 처리",
    "퀸_교환_여부":      "퀸 교환 후 엔드게임 전환 능력",
    "오프닝_시간소모":   "오프닝에 시간을 많이 쓸수록 미들게임 시간 부족",
    "백_플레이":         "백/흑 색상과 실수 패턴",
}

def build_lgbm_insights(
    X: np.ndarray,
    sf_data: Dict[str, Dict],
    game_ids: List[str],
) -> Dict[str, Any]:
    """
    LightGBM으로 페이즈별 cp_loss 예측 → 어떤 피처가 실수를 유발하는지 추출.
    타깃: opening_loss + middle_loss + end_loss (각각 회귀)
    피처: 게임 문맥 13개 (결과 없음)
    """
    if len(X) < MIN_GAMES_ML or not sf_data:
        return {"available": False, "reason": "데이터 부족 (SF 분석 게임 필요)"}

    # 타깃 벡터 생성 (Stockfish 데이터가 있는 게임만)
    idx_map = {gid: i for i, gid in enumerate(game_ids)}
    valid_idx, y_op, y_mid, y_end = [], [], [], []
    for gid, snap in sf_data.items():
        i = idx_map.get(gid)
        if i is None:
            continue
        valid_idx.append(i)
        y_op.append(snap.get("opening_loss", 0.0))
        y_mid.append(snap.get("middle_loss", 0.0))
        y_end.append(snap.get("end_loss", 0.0))

    if len(valid_idx) < 15:
        return {"available": False, "reason": f"Stockfish 분석 게임 부족 ({len(valid_idx)}개)"}

    X_sf = X[valid_idx]
    y_total = np.array(y_op) + np.array(y_mid) + np.array(y_end)

    # LightGBM 회귀: 총 cp_loss 예측
    params = {
        "objective": "regression",
        "num_leaves": 15,
        "learning_rate": 0.05,
        "n_estimators": 150,
        "min_child_samples": 5,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "verbose": -1,
        "random_state": 42,
    }

    model = lgb.LGBMRegressor(**params)

    # 교차 검증 (소규모 데이터에 적합)
    cv_scores = None
    if len(X_sf) >= 20:
        try:
            cv = cross_val_score(model, X_sf, y_total, cv=3, scoring="neg_mean_absolute_error")
            cv_scores = float(-np.mean(cv))
        except Exception:
            pass

    model.fit(X_sf, y_total)
    importances = model.feature_importances_

    # 피처 중요도 순위
    ranked = sorted(
        zip(FEAT_NAMES, importances.tolist()),
        key=lambda x: x[1], reverse=True
    )

    blunder_triggers = [
        {
            "feature": name,
            "impact": round(float(imp / max(importances) * 100), 1),
            "description": FEAT_DESCRIPTIONS.get(name, ""),
        }
        for name, imp in ranked[:5]
        if imp > 0
    ]

    # 페이즈별 개별 모델 (중요도 비교)
    phase_models = {}
    for phase_name, y_p in [("opening", y_op), ("middlegame", y_mid), ("endgame", y_end)]:
        m = lgb.LGBMRegressor(**params)
        try:
            m.fit(X_sf, np.array(y_p))
            top_feat = FEAT_NAMES[int(np.argmax(m.feature_importances_))]
            phase_models[phase_name] = {"top_trigger": top_feat}
        except Exception:
            phase_models[phase_name] = {"top_trigger": None}

    return {
        "available": True,
        "blunder_triggers": blunder_triggers,
        "phase_top_triggers": phase_models,
        "cv_mae": round(cv_scores, 1) if cv_scores else None,
        "games_used": len(valid_idx),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# K-Means: 행동 피처 기반 플레이 스타일 군집화 (결과 제외)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def build_style_clusters(
    X: np.ndarray,
    games: List[GameSummary],
    sf_data: Dict[str, Dict],
    game_ids: List[str],
    username: str,
    n_clusters: int = 4,
) -> Optional[Dict[str, Any]]:
    """
    피처: 시간 사용 패턴 + 오프닝 선택 + 게임 구조 (결과 제외)
    각 클러스터의 avg_cp_loss로 취약 스타일 식별.
    """
    if len(X) < 30:
        return None

    # 행동 피처만 사용 (결과 없음)
    # [ECO_그룹, ECO_친숙도, 게임_길이, 오프닝압박, 미들게임압박, 빠른응수, 클록변동, 포지션개방도, 기물교환]
    behavior_idx = [1, 2, 3, 4, 5, 6, 7, 9, 10]
    Xb = X[:, behavior_idx]
    Xb_clean = np.nan_to_num(Xb, nan=0.0)

    scaler = StandardScaler()
    Xb_s = scaler.fit_transform(Xb_clean)

    km = KMeans(n_clusters=n_clusters, n_init=20, random_state=42)
    labels = km.fit_predict(Xb_s)
    centers_orig = scaler.inverse_transform(km.cluster_centers_)

    # 게임 id → sf cp_loss
    gid_to_loss: Dict[str, float] = {
        gid: sum([
            snap.get("opening_loss", 0), snap.get("middle_loss", 0), snap.get("end_loss", 0)
        ])
        for gid, snap in sf_data.items()
    }
    gid_list = game_ids  # len = len(X)

    # 클러스터별 통계
    cluster_stats = []
    for cid in range(n_clusters):
        mask = labels == cid
        n = int(mask.sum())
        if n == 0:
            continue

        # 승률
        game_mask_games = [games[i] for i in range(len(games)) if mask[i]]
        wins = sum(1 for g in game_mask_games if g.result.value == "win")
        wr = wins / n * 100

        # 평균 cp_loss (SF 데이터 있는 게임만)
        cp_losses = [gid_to_loss[gid_list[i]] for i in range(len(gid_list))
                     if mask[i] and gid_list[i] in gid_to_loss]
        avg_cp_loss = float(np.mean(cp_losses)) if cp_losses else None

        # 클러스터 특성 레이블
        ctr = centers_orig[cid]
        eco_grp = ctr[0]  # behavior_idx[0] = ECO_그룹
        gl = ctr[2]       # behavior_idx[2] = 게임_길이
        mid_p = ctr[4]    # behavior_idx[4] = 미들게임압박
        quick = ctr[5]    # behavior_idx[5] = 빠른응수

        style_label = _cluster_label(eco_grp, gl, mid_p, quick)

        cluster_stats.append({
            "id": cid,
            "n_games": n,
            "win_rate": round(wr, 1),
            "avg_cp_loss": round(avg_cp_loss, 1) if avg_cp_loss is not None else None,
            "label": style_label,
            "is_weakness": avg_cp_loss is not None and avg_cp_loss >= 40,
        })

    cluster_stats.sort(key=lambda c: (c["avg_cp_loss"] or 0), reverse=True)
    worst = cluster_stats[0] if cluster_stats else None

    return {
        "clusters": cluster_stats,
        "worst_cluster": worst["label"] if worst else None,
        "n_clusters": n_clusters,
    }


def _cluster_label(eco_grp: float, gl: float, mid_pressure: float, quick: float) -> str:
    parts = []
    if eco_grp < 2:
        parts.append("클로즈드 오프닝")
    elif eco_grp > 3:
        parts.append("오픈 게임")
    else:
        parts.append("반개방")

    if gl < 25:
        parts.append("단기전")
    elif gl > 45:
        parts.append("장기전")

    if mid_pressure > 0.4:
        parts.append("시간 압박")
    if quick > 0.4:
        parts.append("직관 플레이")

    return " + ".join(parts) if parts else "균형잡힌 게임"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 준비 조언 생성기
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def generate_prep_advice(
    opening_profile: Dict,
    phase_weakness: Dict,
    style_profile: Dict,
    lgbm_insights: Dict,
    style_clusters: Optional[Dict],
    games: List[GameSummary],
    username: str,
) -> List[Dict]:
    """
    분석 결과를 종합하여 대회 준비 조언 생성.
    각 조언: { priority, category, title, detail, confidence, evidence }
    """
    advice = []

    # ── 1. 약한 오프닝 라인 공략 ─────────────────────────────────────────
    weakest_w = opening_profile.get("weakest_as_white")
    weakest_b = opening_profile.get("weakest_as_black")

    if weakest_b:
        # 상대가 흑으로 약한 오프닝 → 내가 백으로 그 방향 유도
        eco_grp = weakest_b[0].upper()
        advice.append({
            "priority": 1,
            "category": "opening",
            "title": f"백으로 {weakest_b[:6]} 방향 유도",
            "detail": f"상대가 흑으로 {weakest_b} 라인에서 취약합니다. "
                      f"해당 오프닝 계열에서 승률이 낮으므로, 이 방향 유도를 준비하세요. "
                      f"오프닝 레퍼토리의 메인 라인보다 덜 알려진 변형을 학습하면 더 유리합니다.",
            "confidence": "high" if weakest_b else "medium",
            "evidence": f"오프닝 통계 기반",
        })

    if weakest_w:
        eco_grp = weakest_w[0].upper()
        advice.append({
            "priority": 2,
            "category": "opening",
            "title": f"흑으로 {weakest_w[:6]} 계열 유도",
            "detail": f"상대가 백으로 {weakest_w} 계열에서 취약합니다. "
                      f"흑으로 해당 구조를 적극 유도하세요.",
            "confidence": "high",
            "evidence": "오프닝 통계 기반",
        })

    # ── 2. 가장 약한 페이즈 유도 ────────────────────────────────────────
    weakest_phase = phase_weakness.get("weakest_phase")
    if weakest_phase:
        phase_data = phase_weakness.get(weakest_phase, {})
        avg_loss = phase_data.get("avg_cp_loss")
        best_phase = max(
            [k for k in ["opening", "middlegame", "endgame"] if phase_weakness.get(k, {}).get("avg_cp_loss") is not None],
            key=lambda k: -phase_weakness[k]["avg_cp_loss"],
            default=None,
        )
        phase_kor = {"opening": "오프닝", "middlegame": "미들게임", "endgame": "엔드게임"}
        if weakest_phase and avg_loss is not None:
            advice.append({
                "priority": 1,
                "category": "strategy",
                "title": f"{phase_kor.get(weakest_phase, weakest_phase)} 방향으로 전환 유도",
                "detail": f"상대의 평균 cp_loss: {phase_kor.get(weakest_phase)}={avg_loss:.0f}. "
                          + (f"가장 강한 페이즈({phase_kor.get(best_phase, '')}) 회피 후 "
                             f"{phase_kor.get(weakest_phase)} 국면으로 유도하는 것이 유리합니다."
                             if best_phase and best_phase != weakest_phase else ""),
                "confidence": "high" if len(phase_weakness.get(weakest_phase, {}).get("n", 0) and [1]) > 0 else "medium",
                "evidence": f"Stockfish 스냅샷 {phase_data.get('n', 0)}게임 분석",
            })

    # ── 3. 시간 압박 전략 ─────────────────────────────────────────────────
    threshold = style_profile.get("clock_pressure_threshold", 40)
    time_score = style_profile.get("time_management_score", 50)
    if time_score < 50:
        advice.append({
            "priority": 2,
            "category": "time",
            "title": f"{threshold}수 이후 복잡한 포지션 유지",
            "detail": f"상대의 시간 관리 점수가 낮습니다 ({time_score}/100). "
                      f"약 {threshold}수 이후부터 시간 압박을 받는 경향이 있으므로, "
                      f"이 시점 이후에 복잡성을 높이는 수를 두어 계산 부담을 주세요. "
                      f"서두르지 않고 포지션을 유지하면 상대가 시간에 쫓겨 실수할 가능성이 높습니다.",
            "confidence": "high" if time_score < 35 else "medium",
            "evidence": f"클록 분석 ({style_profile.get('clock_pressure_threshold')}수 임계값)",
        })

    # ── 4. 스타일 카운터 ─────────────────────────────────────────────────
    tactical_score = style_profile.get("tactical_score", 50)
    complexity = style_profile.get("complexity_preference", "semi-open")
    if tactical_score > 65:
        advice.append({
            "priority": 3,
            "category": "style",
            "title": "포지셔널하고 닫힌 구조 유지",
            "detail": f"상대는 전술적 게임({tactical_score}/100)을 선호합니다. "
                      f"날카로운 전술 교환을 피하고 구조적이고 느린 게임을 유지하면 "
                      f"상대의 강점을 무력화할 수 있습니다. "
                      f"폰 교환을 줄이고 닫힌 센터를 유지하세요.",
            "confidence": "medium",
            "evidence": f"전술성 점수 {tactical_score}/100",
        })
    elif tactical_score < 35:
        advice.append({
            "priority": 3,
            "category": "style",
            "title": "날카로운 전술적 포지션 유도",
            "detail": f"상대는 포지셔널한 게임({100-tactical_score}/100)을 선호합니다. "
                      f"복잡하고 전술이 많은 포지션으로 유도하면 상대가 불편해집니다. "
                      f"조기 기물 교환을 피하고 긴장도 높은 포지션을 만드세요.",
            "confidence": "medium",
            "evidence": f"전술성 점수 {tactical_score}/100",
        })

    # ── 5. LightGBM 블런더 트리거 기반 ───────────────────────────────────
    if lgbm_insights.get("available") and lgbm_insights.get("blunder_triggers"):
        triggers = lgbm_insights["blunder_triggers"]
        top = triggers[0]
        advice.append({
            "priority": 2,
            "category": "ml_insight",
            "title": f"주요 블런더 트리거: {top['feature']}",
            "detail": f"LightGBM 분석 결과 '{top['feature']}'이(가) 상대 실수와 "
                      f"가장 높은 상관관계를 보입니다 (영향도 {top['impact']:.0f}%). "
                      f"{top['description']} "
                      f"이를 의도적으로 유발하는 방향으로 준비하세요.",
            "confidence": "medium",
            "evidence": f"LightGBM 특성 중요도 ({lgbm_insights.get('games_used', 0)}게임 학습)",
        })

    # ── 6. 퀸 교환 / 엔드게임 전략 ───────────────────────────────────────
    qe_rate = style_profile.get("queen_exchange_rate", 50)
    endgame_phase = phase_weakness.get("endgame", {})
    endgame_loss = endgame_phase.get("avg_cp_loss")
    if endgame_loss and endgame_loss > 30:
        advice.append({
            "priority": 3,
            "category": "endgame",
            "title": "퀸 교환 회피 — 엔드게임으로 유도",
            "detail": f"상대의 엔드게임 평균 cp_loss는 {endgame_loss:.0f}으로 높습니다. "
                      f"퀸 교환을 통한 엔드게임 전환이 유리합니다. "
                      f"단, 엔드게임 기술을 사전에 충분히 연습하세요.",
            "confidence": "high" if endgame_loss > 45 else "medium",
            "evidence": f"엔드게임 평균 cp_loss {endgame_loss:.0f}",
        })
    elif endgame_loss and endgame_loss < 15:
        advice.append({
            "priority": 3,
            "category": "endgame",
            "title": "엔드게임 회피 — 미들게임에서 결착",
            "detail": f"상대의 엔드게임이 강합니다 (avg cp_loss {endgame_loss:.0f}). "
                      f"미들게임에서의 공격적 플레이를 통해 엔드게임 돌입 전 결착을 노리세요.",
            "confidence": "medium",
            "evidence": f"엔드게임 평균 cp_loss {endgame_loss:.0f}",
        })

    # ── 7. K-Means 약점 클러스터 ─────────────────────────────────────────
    if style_clusters and style_clusters.get("worst_cluster"):
        worst = style_clusters["worst_cluster"]
        advice.append({
            "priority": 3,
            "category": "style",
            "title": f"'{worst}' 패턴 게임으로 유도",
            "detail": f"ML 군집 분석에서 '{worst}' 유형의 게임에서 상대의 수 품질이 "
                      f"가장 크게 저하됩니다. 이 유형의 게임을 의도적으로 만드세요.",
            "confidence": "medium",
            "evidence": "K-Means 군집화 (행동 피처 기반)",
        })

    # 중복 제거 및 우선순위 정렬
    seen_titles = set()
    deduped = []
    for a in sorted(advice, key=lambda x: x["priority"]):
        if a["title"] not in seen_titles:
            seen_titles.add(a["title"])
            deduped.append(a)

    return deduped[:8]  # 최대 8개


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 메인 서비스
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class OpponentAnalysisService:
    """
    대회 준비용 상대 분석 서비스.

    3단계 파이프라인:
    1. Stockfish 스냅샷 (게임당 3위치, 엔진 1회 기동) — ~10-15s
    2. 피처 추출 + ML 모델 훈련 — ~3s
    3. 준비 조언 생성 — <1s
    """

    def analyze(self, games: List[GameSummary], username: str) -> Dict[str, Any]:
        if not games:
            return self._empty()

        n = len(games)

        # ── Step 1: Stockfish 스냅샷 ─────────────────────────────────
        sf_games = games[:SF_BUDGET_GAMES]
        sf_data = _snap_helper.batch(sf_games, username)

        # ── Step 2: 피처 추출 ───────────────────────────────────────
        X = extract_features(games, username)
        game_ids = [g.game_id for g in games]

        # ── Step 3: 분석 모듈 ────────────────────────────────────────
        opening_profile = build_opening_profile(games, username, sf_data)
        phase_weakness  = build_phase_weakness(sf_data)
        style_profile   = build_style_profile(games, username, X)
        lgbm_insights   = build_lgbm_insights(X, sf_data, game_ids)
        style_clusters  = build_style_clusters(X, games, sf_data, game_ids, username)

        # ── Step 4: 준비 조언 ────────────────────────────────────────
        prep_advice = []
        if n >= MIN_GAMES_ADVICE:
            prep_advice = generate_prep_advice(
                opening_profile, phase_weakness, style_profile,
                lgbm_insights, style_clusters, games, username,
            )

        # ── Summary ──────────────────────────────────────────────────
        wr = sum(1 for g in games if g.result.value == "win") / n * 100
        tac = style_profile.get("tactical_score", 50)
        style_tag = (
            "공격형 전술가" if tac > 65 else
            "포지셔널 플레이어" if tac < 35 else
            "균형형 플레이어"
        )
        wp = phase_weakness.get("weakest_phase")
        phase_kor = {"opening": "오프닝", "middlegame": "미들게임", "endgame": "엔드게임"}
        key_insight = (
            f"{phase_kor.get(wp, wp)} 단계가 핵심 약점"
            if wp else "데이터 수집 중"
        )

        return {
            "total_games": n,
            "win_rate": round(wr, 1),
            "summary": {
                "style_tag": style_tag,
                "key_insight": key_insight,
                "games_analyzed": n,
                "sf_games_analyzed": len(sf_data),
            },
            "opening_profile": opening_profile,
            "phase_weakness": phase_weakness,
            "style_profile": style_profile,
            "ml_insights": {
                "lgbm": lgbm_insights,
                "style_clusters": style_clusters,
            },
            "preparation_advice": prep_advice,
        }

    def _empty(self) -> Dict[str, Any]:
        return {
            "total_games": 0, "win_rate": 0.0,
            "summary": {}, "opening_profile": {}, "phase_weakness": {},
            "style_profile": {}, "ml_insights": {}, "preparation_advice": [],
        }
