from __future__ import annotations

import io
from dataclasses import dataclass
from typing import List, Optional

import chess.pgn

from app.models.schemas import GameResult, GameSummary


@dataclass
class TacticalPatternResult:
    situation_id: int
    chart_data: Optional[dict]


class TacticalAnalysisService:
    """Minimal compatibility service for legacy IQP test coverage.

    The original richer tactical analysis module is not present in the current
    codebase, but some tests still import it and expect IQP comparison data via
    `_p_positional(..., situation_id == 10)`.
    """

    IQP_SITUATION_ID = 10

    def _has_iqp(self, pgn: str) -> bool:
        if not pgn or not pgn.strip():
            return False
        try:
            game = chess.pgn.read_game(io.StringIO(pgn))
            if game is None:
                return False
            board = game.board()
            for move in game.mainline_moves():
                board.push(move)
                for square, piece in board.piece_map().items():
                    if piece.piece_type != chess.PAWN:
                        continue
                    file_idx = chess.square_file(square)
                    if file_idx not in (3, 4):  # d/e file only
                        continue
                    rank_idx = chess.square_rank(square)
                    if piece.color == chess.WHITE and rank_idx >= 3:  # advanced white central pawn
                        adjacent_same = False
                        for nf in (file_idx - 1, file_idx + 1):
                            if not (0 <= nf <= 7):
                                continue
                            for nr in range(8):
                                other = board.piece_at(chess.square(nf, nr))
                                if other is not None and other.piece_type == chess.PAWN and other.color == chess.WHITE:
                                    adjacent_same = True
                                    break
                            if adjacent_same:
                                break
                        if not adjacent_same:
                            return True
                    if piece.color == chess.BLACK and rank_idx <= 4:  # advanced black central pawn
                        adjacent_same = False
                        for nf in (file_idx - 1, file_idx + 1):
                            if not (0 <= nf <= 7):
                                continue
                            for nr in range(8):
                                other = board.piece_at(chess.square(nf, nr))
                                if other is not None and other.piece_type == chess.PAWN and other.color == chess.BLACK:
                                    adjacent_same = True
                                    break
                            if adjacent_same:
                                break
                        if not adjacent_same:
                            return True
        except Exception:
            return False
        return False

    def _score_game(self, result: GameResult) -> float:
        if result == GameResult.win:
            return 1.0
        if result == GameResult.draw:
            return 0.5
        return 0.0

    def _p_positional(self, games: List[GameSummary], username: str, sf_cache: dict | None = None) -> List[TacticalPatternResult]:
        _ = (username, sf_cache)
        iqp_games = [g for g in games if self._has_iqp(g.pgn or "")]
        none_iqp_games = [g for g in games if not self._has_iqp(g.pgn or "")]

        def avg_score(items: List[GameSummary]) -> float:
            if not items:
                return 0.0
            return round(sum(self._score_game(g.result) for g in items) / len(items), 3)

        chart_data = {
            "type": "iqp_comparison",
            "my_iqp_count": len(iqp_games),
            "none_iqp_count": len(none_iqp_games),
            "my_iqp_games": [g.game_id for g in iqp_games],
            "my_vs_none_diff": round(avg_score(iqp_games) - avg_score(none_iqp_games), 3),
            "my_quality_avg": avg_score(iqp_games),
            "none_quality_avg": avg_score(none_iqp_games),
        }

        return [
            TacticalPatternResult(
                situation_id=self.IQP_SITUATION_ID,
                chart_data=chart_data,
            )
        ]
