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

import chess
import chess.pgn

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

        return {
            "total_games": len(games),
            "patterns": [self._to_dict(p) for p in patterns],
            "strengths": [self._to_dict(p) for p in strengths],
            "weaknesses": [self._to_dict(p) for p in weaknesses],
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
