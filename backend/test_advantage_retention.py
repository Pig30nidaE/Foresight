import pytest

from app.features.dashboard.services.tactical_analysis import TacticalAnalysisService
from app.models.schemas import GameSummary, GameResult, Platform


def _mk_game(game_id: str, result: GameResult) -> GameSummary:
    return GameSummary(
        game_id=game_id,
        platform=Platform.chessdotcom,
        white="tester",
        black="opponent",
        result=result,
        time_class="blitz",
        pgn="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3",
        url=f"https://www.chess.com/game/live/{game_id}",
    )


def _adv_moves(peak: int, first_neg_move: int | None = None) -> list[dict]:
    # 5~7수 연속 +0.75폰 이상으로 우위게임 조건을 만족시키고,
    # 필요하면 first_neg_move에서 음수 진입을 만들어 phase 분류를 유도한다.
    rows = [
        {"move_no": 5, "is_my_move": True, "cp_after": 80},
        {"move_no": 6, "is_my_move": True, "cp_after": 95},
        {"move_no": 7, "is_my_move": True, "cp_after": peak},
        {"move_no": 8, "is_my_move": True, "cp_after": 90},
        {"move_no": 12, "is_my_move": True, "cp_after": 70},
        {"move_no": 20, "is_my_move": True, "cp_after": 60},
        {"move_no": 36, "is_my_move": True, "cp_after": 45},
    ]
    if first_neg_move is not None:
        rows.append({"move_no": first_neg_move, "is_my_move": True, "cp_after": -30})
    return sorted(rows, key=lambda x: x["move_no"])


def test_advantage_breakdown_keeps_compatibility_keys_and_counts():
    svc = TacticalAnalysisService()

    games = [
        _mk_game("g1", GameResult.win),   # smooth
        _mk_game("g2", GameResult.win),   # smooth
        _mk_game("g3", GameResult.win),   # shaky (음수 진입 후 승리)
        _mk_game("g4", GameResult.loss),  # blown-mid
        _mk_game("g5", GameResult.draw),  # blown-end
        _mk_game("g6", GameResult.win),   # smooth
    ]

    sf_cache = {
        "g1": _adv_moves(110, None),
        "g2": _adv_moves(120, None),
        "g3": _adv_moves(115, 18),
        "g4": _adv_moves(105, 24),
        "g5": _adv_moves(100, 35),
        "g6": _adv_moves(130, None),
    }

    p = svc._p_advantage_throw(games, "tester", sf_cache)
    assert p is not None
    assert p.chart_data is not None

    c = p.chart_data

    # 최신 필드
    assert c["smooth"] == 3
    assert c["shaky"] == 1
    assert c["blown"] == 2
    assert c["converted"] == 4

    # 프론트 호환 필드(회귀 보호)
    assert c["maintained"] == 4
    assert c["reversed_mid"] == 1
    assert c["reversed_end"] == 1
    assert c["maintain_rate"] == pytest.approx(66.7, abs=0.1)

    # 핵심 KPI도 동일한 값을 가리켜야 한다.
    assert p.key_metric_value == pytest.approx(66.7, abs=0.1)
    assert p.score == 66
