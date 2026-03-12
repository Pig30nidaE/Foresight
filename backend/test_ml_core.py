import numpy as np
import pytest

from app.features.dashboard.services.tactical_analysis import _binary_classification_metrics
from app.ml.engine import _cp_to_win_pct, analyze_game_sync
from app.ml.move_classifier import accuracy_from_avg_wpl, classify_move


def test_classify_move_threshold_boundaries():
    assert classify_move(0.0) == "Best"
    assert classify_move(4.99) == "Best"
    assert classify_move(5.0) == "Excellent"
    assert classify_move(9.99) == "Excellent"
    assert classify_move(10.0) == "Good"
    assert classify_move(19.99) == "Good"
    assert classify_move(20.0) == "Inaccuracy"
    assert classify_move(39.99) == "Inaccuracy"
    assert classify_move(40.0) == "Mistake"
    assert classify_move(69.99) == "Mistake"
    assert classify_move(70.0) == "Blunder"


def test_accuracy_formula_monotonic_decrease():
    acc_0 = accuracy_from_avg_wpl(0)
    acc_20 = accuracy_from_avg_wpl(20)
    acc_40 = accuracy_from_avg_wpl(40)

    assert 0.0 <= acc_40 <= acc_20 <= acc_0 <= 100.0


def test_cp_to_win_pct_bounds_and_midpoint():
    assert _cp_to_win_pct(-10_000) == pytest.approx(0.0, abs=0.01)
    assert _cp_to_win_pct(0) == pytest.approx(50.0, abs=0.01)
    assert _cp_to_win_pct(10_000) == pytest.approx(100.0, abs=0.01)


def test_analyze_game_sync_invalid_pgn_returns_empty():
    assert analyze_game_sync("this is not a pgn", "tester") == []


def test_analyze_game_sync_username_not_in_game_returns_empty():
    pgn = """[Event \"Casual Game\"]
[Site \"?\"]
[Date \"2026.03.12\"]
[Round \"-\"]
[White \"alpha\"]
[Black \"beta\"]
[Result \"1-0\"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0
"""
    assert analyze_game_sync(pgn, "tester") == []


def test_binary_classification_metrics_core_values():
    y_true = np.array([1, 1, 0, 0])
    y_pred = np.array([1, 0, 1, 0])

    m = _binary_classification_metrics(y_true, y_pred)

    assert m["accuracy"] == pytest.approx(50.0, abs=0.1)
    assert m["precision"] == pytest.approx(50.0, abs=0.1)
    assert m["recall"] == pytest.approx(50.0, abs=0.1)
    assert m["f1"] == pytest.approx(50.0, abs=0.1)
    assert m["baseline_accuracy"] == pytest.approx(50.0, abs=0.1)
    assert m["support_pos"] == 2
    assert m["support_neg"] == 2
