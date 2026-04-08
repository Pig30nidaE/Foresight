from app.ml.game_analyzer import MoveTier, _determine_tier


def test_determine_tier_unique_best_is_t1_only_with_near_zero_loss():
    assert _determine_tier(6, 0.8, 1, True) == MoveTier.T2
    assert _determine_tier(12, 0.8, 1, True) == MoveTier.T2


def test_determine_tier_best_move_with_small_loss_is_t2():
    assert _determine_tier(18, 2.5, 1, False) == MoveTier.T3


def test_determine_tier_top_three_requires_small_actual_loss():
    assert _determine_tier(45, 6.0, 2, False) == MoveTier.T4
    assert _determine_tier(75, 6.0, 3, False) == MoveTier.T4


def test_determine_tier_large_loss_overrides_rank_bonus():
    assert _determine_tier(150, 8.0, 1, False) == MoveTier.T5
    assert _determine_tier(20, 24.0, 2, False) == MoveTier.T5


def test_determine_tier_non_top_move_stays_t4_until_severe_loss():
    assert _determine_tier(80, 11.0, 0, False) == MoveTier.T5
    assert _determine_tier(141, 11.0, 0, False) == MoveTier.T5