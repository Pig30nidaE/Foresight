from app.features.dashboard.services.tactical_analysis import TacticalAnalysisService
from app.models.schemas import GameSummary, GameResult, Platform


MY_IQP_PGN = (
    "1. d4 d5 2. c4 e6 3. cxd5 exd5 4. Nc3 Nf6 5. Bg5 Be7 6. e3 O-O "
    "7. Bd3 c6 8. Qc2 Nbd7 9. Nge2 Re8 10. O-O Nf8 11. f3 Nh5 12. Bxe7 Qxe7 "
    "13. e4 dxe4 14. Nxe4 Be6 15. Rae1 Rad8 16. N4g3 Nf6 17. b3 Qd6 "
    "18. Qc3 Nd5 19. Qd2 Nb4 20. Bb1"
)

NO_IQP_PGN = (
    "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 "
    "7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 b4 12. a3 c5 "
    "13. d5 a5 14. Nbd2 Ne8 15. Nf1 g6 16. Bh6 Ng7 17. axb4 cxb4 "
    "18. Ba4 Nc5 19. Bc6 Ra6 20. Bb5"
)


def _mk_game(game_id: str, result: GameResult, pgn: str) -> GameSummary:
    return GameSummary(
        game_id=game_id,
        platform=Platform.chessdotcom,
        white="tester",
        black="opponent",
        result=result,
        time_class="blitz",
        pgn=pgn,
        url=f"https://www.chess.com/game/live/{game_id}",
    )


def test_iqp_pattern_provides_comparison_chart_data():
    svc = TacticalAnalysisService()

    games = [
        _mk_game("iqp1", GameResult.win, MY_IQP_PGN),
        _mk_game("iqp2", GameResult.win, MY_IQP_PGN),
        _mk_game("iqp3", GameResult.draw, MY_IQP_PGN),
        _mk_game("iqp4", GameResult.loss, MY_IQP_PGN),
        _mk_game("iqp5", GameResult.win, MY_IQP_PGN),
        _mk_game("none1", GameResult.win, NO_IQP_PGN),
        _mk_game("none2", GameResult.loss, NO_IQP_PGN),
        _mk_game("none3", GameResult.draw, NO_IQP_PGN),
    ]

    results = svc._p_positional(games, "tester", sf_cache={})
    iqp = next((p for p in results if p.situation_id == 10), None)

    assert iqp is not None
    assert iqp.chart_data is not None
    assert iqp.chart_data["type"] == "iqp_comparison"

    chart = iqp.chart_data
    assert chart["my_iqp_count"] >= 5
    assert chart["none_iqp_count"] >= 1
    assert len(chart["my_iqp_games"]) >= 5
    assert "my_vs_none_diff" in chart
    assert "my_quality_avg" in chart
