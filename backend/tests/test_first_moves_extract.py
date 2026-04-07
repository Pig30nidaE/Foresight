"""백/흑 첫 수 추출(_extract_first_moves) 단위 테스트."""
from app.features.dashboard.services.analysis import _extract_first_moves


def test_standard_game():
    pgn = """[Event "x"]\n[White "a"]\n[Black "b"]\n\n1. e4 c5 2. Nf3 *"""
    assert _extract_first_moves(pgn) == ("e4", "c5")


def test_lichess_clock_annotations():
    pgn = """[Event "Lichess blitz"]\n[White "u1"]\n[Black "u2"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:05:00]} c5 {[%clk 0:05:00]} 2. Nf3 1-0"""
    assert _extract_first_moves(pgn) == ("e4", "c5")


def test_no_space_after_move_number():
    pgn = """[Event "x"]\n\n1.e4 c5 1-0"""
    assert _extract_first_moves(pgn) == ("e4", "c5")


def test_black_first_move_d4_opening():
    pgn = """[Event "x"]\n\n1. d4 Nf6 2. c4 *"""
    assert _extract_first_moves(pgn) == ("d4", "Nf6")


def test_empty_pgn():
    assert _extract_first_moves("") == (None, None)
    assert _extract_first_moves("   ") == (None, None)


def test_variation_mainline_still_e4_c5():
    """괄호 변형이 있어도 메인라인 첫 두 수는 e4, c5."""
    pgn = """[Event "x"]\n\n1. e4 ( 1. d4 d5 ) 1... c5 *"""
    assert _extract_first_moves(pgn) == ("e4", "c5")
