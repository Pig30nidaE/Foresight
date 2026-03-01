"""
전술 패턴 분석 서비스 — MVP.md 기반
========================================
python-chess 로 PGN 을 분석하여 MVP.md 의 20가지 체스 상황 중 구현 가능한
패턴들을 감지하고 유저의 강점/약점을 분류합니다.

구현된 패턴:
  1. 시간 압박 대응 (Time Trouble)       — 클록 데이터
  2. 즉각 반응 패턴 (Instant Response)   — 클록 데이터
  3. 오프닝 순간력                       — 게임 길이
  4. 엔드게임 전환력                     — 게임 길이
  5. 흑백 밸런스                         — 색상별 승률
  6. 오프닝 레퍼토리                     — 오프닝 반복도
  7. 핀(Pin) 인지                        — python-chess 보드 분석
  8. 나이트 포크 회피                    — python-chess 보드 분석
  9. 백랭크 수비                         — python-chess 보드 분석
 10. 우위 포기 (Advantage Throw)         — 게임 기물 득실 proxy
"""

from __future__ import annotations

import io
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

import numpy as np
import chess
import chess.pgn
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from app.models.schemas import GameSummary

# ── 시계 파싱 ────────────────────────────────────────────────
_RE_CLK = re.compile(r"\[%clk\s+(\d+):(\d{2}):(\d{2})\]")
_RE_EMT = re.compile(r"\[%emt\s+(\d+):(\d{2}):(\d{2})\]")


def _clk_sec(h: str, m: str, s: str) -> float:
    return int(h) * 3600 + int(m) * 60 + float(s)


def _parse_clock(comment: str) -> Optional[float]:
    mt = _RE_CLK.search(comment or "")
    return _clk_sec(*mt.groups()) if mt else None


def _parse_emt(comment: str) -> Optional[float]:
    mt = _RE_EMT.search(comment or "")
    return _clk_sec(*mt.groups()) if mt else None


def _estimate_total_moves(pgn: str) -> int:
    """PGN 에서 마지막 수 번호 추출로 게임 길이 추정."""
    nums = re.findall(r'(\d+)\.', pgn or "")
    return int(nums[-1]) if nums else 0


# ── 결과 모델 ─────────────────────────────────────────────────
@dataclass
class PatternResult:
    label: str
    description: str
    icon: str
    score: int          # 0–100  (높을수록 좋음)
    is_strength: bool   # score ≥ STRENGTH_THRESHOLD
    games_analyzed: int
    detail: str
    category: str       # "time" | "position" | "opening" | "endgame" | "balance"


STRENGTH_THRESHOLD = 55  # 55% 이상이면 강점으로 분류


# ── 메인 서비스 ───────────────────────────────────────────────
class TacticalAnalysisService:

    # ── 공개 진입점 ─────────────────────────────────────────
    def analyze(
        self,
        games: List[GameSummary],
        username: str,
        max_board_games: int = 120,
    ) -> Dict[str, Any]:
        """
        게임 목록에서 전술 패턴을 분석하여 강점 / 약점 목록 반환.
        """
        patterns: List[PatternResult] = []

        # --- 클록 기반 패턴 ------------------------------------
        tp = self._time_trouble(games, username)
        if tp:
            patterns.append(tp)

        ir = self._instant_response(games, username)
        if ir:
            patterns.append(ir)

        # --- 게임 길이 기반 패턴 --------------------------------
        patterns.extend(self._phase_patterns(games, username))

        # --- 결과 통계 기반 패턴 --------------------------------
        bal = self._color_balance(games, username)
        if bal:
            patterns.append(bal)

        rep = self._opening_repertoire(games, username)
        if rep:
            patterns.append(rep)

        # --- python-chess 보드 분석 (서브셋만) ------------------
        patterns.extend(self._board_patterns(games[:max_board_games], username))

        # --- 정렬 & 집계 ----------------------------------------
        strengths = sorted(
            [p for p in patterns if p.is_strength],
            key=lambda x: x.score, reverse=True
        )[:3]
        weaknesses = sorted(
            [p for p in patterns if not p.is_strength],
            key=lambda x: x.score
        )[:3]

        # --- K-Means 군집화 (게임 수 30 이상일 때만) -------------
        cluster_analysis = self._kmeans_cluster_analysis(games, username) if len(games) >= 30 else None

        return {
            "total_games": len(games),
            "patterns": [self._to_dict(p) for p in patterns],
            "strengths": [self._to_dict(p) for p in strengths],
            "weaknesses": [self._to_dict(p) for p in weaknesses],
            "cluster_analysis": cluster_analysis,
        }

    # ── 헬퍼 ────────────────────────────────────────────────
    def _to_dict(self, p: PatternResult) -> dict:
        return {
            "label": p.label,
            "description": p.description,
            "icon": p.icon,
            "score": p.score,
            "is_strength": p.is_strength,
            "games_analyzed": p.games_analyzed,
            "detail": p.detail,
            "category": p.category,
        }

    def _win_rate(self, games: List[GameSummary], username: str) -> float:
        if not games:
            return 0.0
        wins = sum(
            1 for g in games
            if g.result.value == "win"
        )
        return round(wins / len(games) * 100, 1)

    def _parse_game(self, pgn_str: str):
        try:
            return chess.pgn.read_game(io.StringIO(pgn_str))
        except Exception:
            return None

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 1. 시간 압박 대응 (Time Trouble)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _time_trouble(
        self, games: List[GameSummary], username: str, threshold: float = 30.0
    ) -> Optional[PatternResult]:
        """잔여시간 30초 미만 수가 있는 게임 vs 그렇지 않은 게임 승률 비교."""
        pressure_games: List[GameSummary] = []
        normal_games: List[GameSummary] = []

        for g in games:
            if not g.pgn:
                continue
            game = self._parse_game(g.pgn)
            if not game:
                continue

            is_white = g.white.lower() == username.lower()
            had_pressure = False
            board = game.board()

            for node in game.mainline():
                color_is_white = (board.turn == chess.WHITE)
                clk = _parse_clock(node.comment or "")
                if clk is not None and clk < threshold:
                    if (is_white and color_is_white) or (not is_white and not color_is_white):
                        had_pressure = True
                        break
                try:
                    board.push(node.move)
                except Exception:
                    break

            (pressure_games if had_pressure else normal_games).append(g)

        if len(pressure_games) < 5:
            return None

        press_wr = self._win_rate(pressure_games, username)
        norm_wr = self._win_rate(normal_games, username) if normal_games else 50.0
        diff = press_wr - norm_wr
        score = int(press_wr)
        is_str = press_wr >= 45 and diff >= -8

        return PatternResult(
            label="시간 압박 대응",
            description="잔여시간 30초 미만 상황에서의 수 품질 및 최종 승률",
            icon="⏱️",
            score=score,
            is_strength=is_str,
            games_analyzed=len(pressure_games),
            detail=f"압박 게임 {len(pressure_games)}개 → 승률 {press_wr:.0f}% | 일반 게임 {norm_wr:.0f}% ({diff:+.0f}%p)",
            category="time",
        )

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 2. 즉각 반응 패턴 (Instant Response)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _instant_response(
        self, games: List[GameSummary], username: str, quick_sec: float = 3.0
    ) -> Optional[PatternResult]:
        """3초 이내 응답 게임(전체 수의 30%+)에서의 승률."""
        quick_games: List[GameSummary] = []
        slow_games: List[GameSummary] = []

        for g in games:
            if not g.pgn:
                continue
            game = self._parse_game(g.pgn)
            if not game:
                continue

            is_white = g.white.lower() == username.lower()
            quick_count = 0
            total_clocked = 0
            prev_clk: Optional[float] = None
            board = game.board()

            for node in game.mainline():
                color_is_white = (board.turn == chess.WHITE)
                clk = _parse_clock(node.comment or "")
                emt = _parse_emt(node.comment or "")

                if (is_white and color_is_white) or (not is_white and not color_is_white):
                    if emt is not None:
                        total_clocked += 1
                        if emt <= quick_sec:
                            quick_count += 1
                    elif clk is not None and prev_clk is not None:
                        spent = prev_clk - clk
                        if 0 < spent:
                            total_clocked += 1
                            if spent <= quick_sec:
                                quick_count += 1

                if (is_white and color_is_white) or (not is_white and not color_is_white):
                    prev_clk = clk

                try:
                    board.push(node.move)
                except Exception:
                    break

            if total_clocked >= 10:
                ratio = quick_count / total_clocked
                (quick_games if ratio >= 0.30 else slow_games).append(g)

        if len(quick_games) < 5:
            return None

        quick_wr = self._win_rate(quick_games, username)
        slow_wr = self._win_rate(slow_games, username) if slow_games else 50.0
        diff = quick_wr - slow_wr
        score = int(quick_wr)

        return PatternResult(
            label="즉각 반응 패턴",
            description="수를 빠르게(3초 이내) 많이 두는 게임에서의 승률 — 직관력",
            icon="⚡",
            score=score,
            is_strength=score >= STRENGTH_THRESHOLD,
            games_analyzed=len(quick_games),
            detail=f"빠른 플레이 게임 {len(quick_games)}개 → {quick_wr:.0f}% | 신중한 게임 {slow_wr:.0f}% ({diff:+.0f}%p)",
            category="time",
        )

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 3 & 4. 게임 길이 기반 (Phase Performance)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _phase_patterns(
        self, games: List[GameSummary], username: str
    ) -> List[PatternResult]:
        results = []

        short = [g for g in games if _estimate_total_moves(g.pgn or "") in range(5, 25)]
        mid   = [g for g in games if _estimate_total_moves(g.pgn or "") in range(25, 40)]
        long_ = [g for g in games if _estimate_total_moves(g.pgn or "") >= 40]

        if len(short) >= 8:
            wr = self._win_rate(short, username)
            results.append(PatternResult(
                label="오프닝 순간력",
                description="25수 이하 단기전 승률 — 전술·공격 패턴 결정력",
                icon="♟️",
                score=int(wr),
                is_strength=wr >= STRENGTH_THRESHOLD,
                games_analyzed=len(short),
                detail=f"단기전 {len(short)}게임 승률 {wr:.0f}%",
                category="opening",
            ))

        if len(long_) >= 8:
            wr = self._win_rate(long_, username)
            results.append(PatternResult(
                label="엔드게임 전환력",
                description="40수 이상 장기전 승률 — 엔드게임 이해도 및 마무리 능력",
                icon="👑",
                score=int(wr),
                is_strength=wr >= 50,
                games_analyzed=len(long_),
                detail=f"장기전 {len(long_)}게임 승률 {wr:.0f}%",
                category="endgame",
            ))

        return results

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 5. 흑백 밸런스
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _color_balance(
        self, games: List[GameSummary], username: str
    ) -> Optional[PatternResult]:
        white_games = [g for g in games if g.white.lower() == username.lower()]
        black_games = [g for g in games if g.black.lower() == username.lower()]

        if len(white_games) < 10 or len(black_games) < 10:
            return None

        w_wr = self._win_rate(white_games, username)
        b_wr = self._win_rate(black_games, username)
        diff = abs(w_wr - b_wr)
        score = max(0, 100 - int(diff * 2))
        stronger = "백" if w_wr >= b_wr else "흑"

        return PatternResult(
            label="흑백 밸런스",
            description="백(선수) vs 흑(후수) 승률 균형도 — 차이가 작을수록 양색 균형",
            icon="⚖️",
            score=score,
            is_strength=diff <= 12,
            games_analyzed=len(games),
            detail=f"백 {w_wr:.0f}% | 흑 {b_wr:.0f}%  ({stronger} 우위 {diff:.0f}%p)",
            category="balance",
        )

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 6. 오프닝 레퍼토리
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _opening_repertoire(
        self, games: List[GameSummary], username: str
    ) -> Optional[PatternResult]:
        counts = Counter(g.opening_name or "Unknown" for g in games)

        familiar = [g for g in games if counts.get(g.opening_name or "Unknown", 0) >= 10]
        fresh    = [g for g in games if counts.get(g.opening_name or "Unknown", 0) <= 3]

        if len(familiar) < 8 or len(fresh) < 5:
            return None

        fam_wr  = self._win_rate(familiar, username)
        fres_wr = self._win_rate(fresh, username)
        diff = fam_wr - fres_wr
        score = int(fam_wr)

        return PatternResult(
            label="오프닝 레퍼토리",
            description="익숙한 오프닝(10게임+) vs 새로운 오프닝 승률 — 준비도 지표",
            icon="📚",
            score=score,
            is_strength=score >= STRENGTH_THRESHOLD and diff >= 5,
            games_analyzed=len(familiar),
            detail=f"단골 오프닝 {fam_wr:.0f}% vs 새 오프닝 {fres_wr:.0f}% ({diff:+.0f}%p)",
            category="opening",
        )

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 7–9. python-chess 보드 기반 전술 감지
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _board_patterns(
        self, games: List[GameSummary], username: str
    ) -> List[PatternResult]:
        results: List[PatternResult] = []

        pin_bad = 0         # 핀된 기물을 무리하게 이동
        pin_total = 0       # 핀 상황 총 수

        fork_evaded = 0     # 포크 위협 회피 성공
        fork_failed = 0     # 포크 위협 허용

        back_rank = 0       # 백랭크 체크 허용 횟수

        analyzed = 0

        for g in games:
            if not g.pgn:
                continue
            game = self._parse_game(g.pgn)
            if not game:
                continue

            is_white = g.white.lower() == username.lower()
            my_color  = chess.WHITE if is_white else chess.BLACK
            opp_color = chess.BLACK if is_white else chess.WHITE

            board = game.board()
            nodes = list(game.mainline())
            analyzed += 1

            for node in nodes:
                is_my_turn = (board.turn == my_color)
                move = node.move

                try:
                    # --- 핀(Pin) 인지 감지 ---
                    if is_my_turn:
                        if board.is_pinned(my_color, move.from_square):
                            pin_total += 1
                            # 절대 핀된 기물이 이동하면서 체크가 노출되는지 확인
                            board.push(move)
                            if board.is_check():
                                # 핀 노출로 체크 허용 — 나쁜 수
                                pin_bad += 1
                            board.pop()
                        # push는 아래서 한번만
                    # --- 나이트 포크 위협 (킹 + 퀸) 감지 ---
                    if is_my_turn:
                        opp_knights = board.pieces(chess.KNIGHT, opp_color)
                        my_king     = board.king(my_color)
                        my_queens   = board.pieces(chess.QUEEN, my_color)

                        for kn_sq in opp_knights:
                            atk = board.attacks(kn_sq)
                            king_attacked = my_king is not None and bool(
                                chess.BB_SQUARES[my_king] & atk
                            )
                            queen_attacked = any(
                                bool(chess.BB_SQUARES[q] & atk) for q in my_queens
                            )
                            if king_attacked and queen_attacked:
                                # 포크 위협 상황
                                moved = board.piece_at(move.from_square)
                                if moved:
                                    if moved.piece_type in (chess.KING, chess.QUEEN):
                                        fork_evaded += 1  # 킹/퀸 이동으로 회피
                                    elif board.is_capture(move) and move.to_square == kn_sq:
                                        fork_evaded += 1  # 나이트 제거
                                    else:
                                        fork_failed += 1

                    # --- 백랭크 체크 허용 감지 ---
                    if not is_my_turn:
                        # 상대 수 적용 후 내가 백랭크에서 체크를 받았는지
                        board.push(move)
                        if board.is_check():
                            king_sq = board.king(my_color)
                            if king_sq is not None:
                                back = chess.BB_RANK_1 if my_color == chess.WHITE else chess.BB_RANK_8
                                if chess.BB_SQUARES[king_sq] & back:
                                    # 체크 루트가 파일/랭크인지 (룩/퀸에 의한 백랭크 체크)
                                    checkers = board.checkers()
                                    for ch_sq in chess.scan_forward(checkers):
                                        ch_piece = board.piece_at(ch_sq)
                                        if ch_piece and ch_piece.piece_type in (chess.ROOK, chess.QUEEN):
                                            back_rank += 1
                                            break
                        board.pop()
                        board.push(move)
                    else:
                        board.push(move)

                except Exception:
                    try:
                        board.push(move)
                    except Exception:
                        break

        # ── 핀 인지 패턴 결과 ──
        if pin_total >= 3:
            pin_score = max(0, min(100, 100 - int(pin_bad / pin_total * 200)))
            results.append(PatternResult(
                label="핀(Pin) 인지",
                description="핀된 기물을 이동해 체크 노출 — 낮을수록 핀 활용/회피 부족",
                icon="📌",
                score=pin_score,
                is_strength=pin_score >= 60,
                games_analyzed=analyzed,
                detail=f"핀 상황 {pin_total}회 중 무리한 이동(체크 허용) {pin_bad}회",
                category="position",
            ))

        # ── 포크 회피 패턴 결과 ──
        fork_total = fork_evaded + fork_failed
        if fork_total >= 3:
            fork_score = int(fork_evaded / fork_total * 100)
            results.append(PatternResult(
                label="포크(Fork) 회피",
                description="상대 나이트의 킹+퀸 동시 공격(포크) 위협에 대한 대응률",
                icon="🐴",
                score=fork_score,
                is_strength=fork_score >= 60,
                games_analyzed=analyzed,
                detail=f"포크 위협 {fork_total}회 → 회피 {fork_evaded}회 ({fork_score}%)",
                category="position",
            ))

        # ── 백랭크 수비 패턴 결과 ──
        if back_rank >= 2 or analyzed >= 40:
            br_score = max(20, min(85, 100 - back_rank * 6))
            results.append(PatternResult(
                label="백랭크 수비",
                description="1랭크/8랭크에서 룩·퀸에 의한 백랭크 체크 허용 빈도",
                icon="🏰",
                score=br_score,
                is_strength=br_score >= 65,
                games_analyzed=analyzed,
                detail=f"백랭크 체크 허용 {back_rank}회 (분석 {analyzed}게임)",
                category="position",
            ))

        return results

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # K-Means 군집화 — 게임 Feature → 3 클러스터 → 강점/약점 해석
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _extract_game_features(
        self, games: List[GameSummary], username: str
    ) -> List[Dict[str, Any]]:
        """
        게임별 6-dim Feature 벡터 추출 (PGN 경량 파싱 — board.push 없음).
        Features:
          0 won            — 1.0 win / 0.5 draw / 0.0 loss
          1 game_length    — 총 수 (0~80+ 범위, scaler가 정규화)
          2 is_white       — 1.0 백 / 0.0 흑
          3 is_familiar    — 1.0 (해당 오프닝 ≥4회) / 0.0
          4 time_pressure  — 1.0 (내 수 중 클록 <30s 있음) / 0.0
          5 quick_ratio    — 내 수 중 3초 이내 비율 (0.0–1.0)
        """
        # 오프닝 친숙도 계산
        opening_counts: Counter = Counter(g.opening_name or "Unknown" for g in games)

        rows = []
        for g in games:
            # 0. 결과
            res = g.result.value if g.result else "loss"
            won = 1.0 if res == "win" else (0.5 if res == "draw" else 0.0)

            # 2. 색상
            is_white = 1.0 if g.white.lower() == username.lower() else 0.0
            is_my_white = bool(is_white)

            # 3. 오프닝 친숙도
            is_familiar = 1.0 if opening_counts.get(g.opening_name or "Unknown", 0) >= 4 else 0.0

            # 1, 4, 5: PGN 경량 파싱 (comment만 읽고 board.push 없음)
            game_length = _estimate_total_moves(g.pgn or "")
            time_pressure = 0.0
            quick_count = 0
            total_clocked = 0

            if g.pgn:
                try:
                    parsed = chess.pgn.read_game(io.StringIO(g.pgn))
                    if parsed:
                        move_num = 0
                        for node in parsed.mainline():
                            move_num += 1
                            # 내 수인지 대략 판단 (1수=백, 2수=흑, ...)
                            my_turn = (move_num % 2 == 1) if is_my_white else (move_num % 2 == 0)
                            if not my_turn:
                                continue
                            clk = _parse_clock(node.comment or "")
                            emt = _parse_emt(node.comment or "")
                            if clk is not None and clk < 30.0:
                                time_pressure = 1.0
                            if emt is not None:
                                total_clocked += 1
                                if emt <= 3.0:
                                    quick_count += 1
                except Exception:
                    pass

            quick_ratio = quick_count / total_clocked if total_clocked >= 5 else 0.5

            rows.append({
                "game": g,
                "features": [won, float(game_length), is_white, is_familiar, time_pressure, quick_ratio],
            })

        return rows

    def _kmeans_cluster_analysis(
        self, games: List[GameSummary], username: str, n_clusters: int = 3
    ) -> Optional[Dict[str, Any]]:
        """
        K-Means (k=3) 으로 게임을 군집화하고 각 클러스터의 특성을 해석.
        반환 구조:
          {
            "n_clusters": 3,
            "feature_names": [...],
            "clusters": [
              { "id": 0, "n_games": N, "win_rate": 45.2, "label": "시간 압박 게임",
                "key_traits": ["시간 압박 빈번", "빠른 응수"], "is_weakness": True,
                "description": "..." }
            ],
            "summary": "...",
            "top_weakness": "...",
            "top_strength": "..."
          }
        """
        FEATURE_NAMES = ["결과", "게임 길이", "백 플레이", "친숙한 오프닝", "시간 압박", "빠른 응수"]

        rows = self._extract_game_features(games, username)
        if len(rows) < 10:
            return None

        X = np.array([r["features"] for r in rows], dtype=float)

        # NaN/Inf 제거
        X = np.nan_to_num(X, nan=0.5, posinf=1.0, neginf=0.0)
        X = np.clip(X, 0.0, 1.0)

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # K-Means (여러 init 시도로 안정성 확보)
        km = KMeans(n_clusters=n_clusters, n_init=20, random_state=42, max_iter=300)
        labels = km.fit_predict(X_scaled)

        # ── 클러스터별 통계 계산 ────────────────────────────
        overall_win_rate = float(np.mean(X[:, 0]) * 100)
        cluster_stats = []

        centers_orig = scaler.inverse_transform(km.cluster_centers_)

        # Feature 해석 규칙 (feature_idx, high_label, low_label, threshold)
        TRAIT_RULES = [
            # (idx, high_trait, low_trait, high_threshold)
            (1, "장기전 위주", "단기전 위주", 40),
            (4, "시간 압박 빈번", "여유로운 시간", 0.5),
            (5, "직관적 빠른 응수", "신중한 수 선택", 0.5),
            (2, "백 게임 위주", "흑 게임 위주", 0.6),
            (3, "익숙한 오프닝", "새로운 오프닝", 0.5),
        ]

        # 클러스터 이름 후보 (승률 + 지배적 feature 기반)
        CLUSTER_NAME_MAP = {
            ("시간 압박 빈번", "직관적 빠른 응수"): ("⏱️ 시간 압박 게임", "시간이 부족한 상황에서 빠르게 수를 두는 패턴"),
            ("시간 압박 빈번",): ("⏱️ 시간 압박 게임", "클록이 30초 이하로 떨어지는 상황이 잦은 게임"),
            ("직관적 빠른 응수",): ("⚡ 직관적 플레이", "대부분의 수를 3초 이내 직관으로 두는 게임"),
            ("장기전 위주",): ("👑 엔드게임 전투", "40수 이상 이어지는 장기전 위주 게임"),
            ("단기전 위주",): ("♟️ 오프닝·전술 결전", "25수 이하 단기간에 승부가 나는 게임"),
            ("익숙한 오프닝",): ("📚 단골 오프닝 게임", "자주 두는 오프닝 레퍼토리 게임"),
            ("새로운 오프닝",): ("🎲 낯선 오프닝 게임", "처음 접하거나 드물게 두는 오프닝 게임"),
            ("백 게임 위주",): ("⬜ 백(선수) 게임", "백으로 진행된 게임 위주 클러스터"),
            ("흑 게임 위주",): ("⬛ 흑(후수) 게임", "흑으로 진행된 게임 위주 클러스터"),
        }

        for cid in range(n_clusters):
            mask = labels == cid
            n_games = int(mask.sum())
            if n_games == 0:
                continue

            c_feats = X[mask]
            win_rate = float(np.mean(c_feats[:, 0]) * 100)
            center = centers_orig[cid]

            # 지배적 특성 추출
            traits: List[str] = []
            for idx, high_t, low_t, threshold in TRAIT_RULES:
                val = center[idx]
                if idx == 1:   # 게임 길이 — 절대값 비교
                    if val >= threshold:
                        traits.append(high_t)
                    elif val <= 25:
                        traits.append(low_t)
                else:           # 0~1 비율 값
                    if val >= threshold + 0.15:
                        traits.append(high_t)
                    elif val <= threshold - 0.15:
                        traits.append(low_t)

            # 이름 결정 — 가장 많이 일치하는 규칙
            best_name = None
            best_desc = None
            for key_traits, (name, desc) in CLUSTER_NAME_MAP.items():
                if all(t in traits for t in key_traits):
                    if best_name is None or len(key_traits) > len(best_name):
                        best_name = name
                        best_desc = desc

            if best_name is None:
                best_name = f"🎯 패턴 그룹 {cid + 1}"
                best_desc = "명확한 단일 특성이 없는 혼합 게임 패턴"

            is_weakness = win_rate < max(35, overall_win_rate - 8)
            is_strength = win_rate > min(65, overall_win_rate + 8)

            cluster_stats.append({
                "id": cid,
                "n_games": n_games,
                "win_rate": round(win_rate, 1),
                "label": best_name,
                "description": best_desc,
                "key_traits": traits[:3],
                "is_weakness": is_weakness,
                "is_strength": is_strength,
                "center": {FEATURE_NAMES[i]: round(float(center[i]), 3) for i in range(len(FEATURE_NAMES))},
            })

        # 승률 순 정렬
        cluster_stats.sort(key=lambda c: c["win_rate"], reverse=True)

        weaknesses_c = [c for c in cluster_stats if c["is_weakness"]]
        strengths_c  = [c for c in cluster_stats if c["is_strength"]]

        # 요약 문장
        top_w = weaknesses_c[0]["label"] if weaknesses_c else None
        top_s = strengths_c[0]["label"] if strengths_c else None

        summary_parts = []
        if top_s:
            summary_parts.append(f"{top_s} 유형에서 강세")
        if top_w:
            summary_parts.append(f"{top_w} 유형에서 약세")
        summary = " · ".join(summary_parts) if summary_parts else "게임 패턴이 고르게 분포됨"

        return {
            "n_clusters": n_clusters,
            "feature_names": FEATURE_NAMES,
            "clusters": cluster_stats,
            "overall_win_rate": round(overall_win_rate, 1),
            "summary": summary,
            "top_weakness": top_w,
            "top_strength": top_s,
        }

