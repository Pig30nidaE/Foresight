from io import StringIO

import chess
import chess.pgn


def validate_pgn_optional(pgn_text: str | None) -> None:
    if not pgn_text or not pgn_text.strip():
        return
    stream = StringIO(pgn_text)
    game = chess.pgn.read_game(stream)
    if game is None:
        raise ValueError("Invalid PGN: could not parse a game")


def validate_fen_optional(fen: str | None) -> None:
    if not fen or not fen.strip():
        return
    chess.Board(fen)


def thumbnail_fen_for_post(pgn_text: str | None, fen_initial: str | None) -> str | None:
    """Final position from PGN if valid; else normalized FEN from fen_initial; else None."""
    if pgn_text and pgn_text.strip():
        try:
            stream = StringIO(pgn_text.strip())
            game = chess.pgn.read_game(stream)
            if game is None:
                return None
            board = game.board()
            for move in game.mainline_moves():
                board.push(move)
            return board.fen()
        except Exception:
            return None
    if fen_initial and fen_initial.strip():
        try:
            return chess.Board(fen_initial.strip()).fen()
        except Exception:
            return None
    return None
