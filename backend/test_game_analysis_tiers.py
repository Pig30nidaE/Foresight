from app.ml.game_analyzer import MoveTier, _determine_tier


def test_determine_tier_top_rank_near_zero_is_t2():
    assert _determine_tier(6, 0.8, 1, True) == MoveTier.T2
    assert _determine_tier(10, 1.5, 1, False) == MoveTier.T2


def test_determine_tier_old_t2_shifted_to_t3():
    assert _determine_tier(18, 2.5, 1, False) == MoveTier.T3


def test_determine_tier_t4_vs_t5_boundaries_are_clearer():
    # 2.4% loss should be T3/T4 range, not broad T5
    assert _determine_tier(20, 2.4, 2, False) in (MoveTier.T3, MoveTier.T4)
    # 9.8% loss should be lower than 2.4% class
    assert _determine_tier(60, 9.8, 2, False) in (MoveTier.T4, MoveTier.T5)


def test_determine_tier_large_loss_overrides_rank_bonus_to_t6():
    assert _determine_tier(150, 8.0, 1, False) == MoveTier.T6
    assert _determine_tier(20, 24.0, 2, False) == MoveTier.T6


def test_determine_tier_non_top_move_steps_t5_then_t6():
    assert _determine_tier(80, 11.0, 0, False) == MoveTier.T5
    assert _determine_tier(141, 11.0, 0, False) == MoveTier.T6


def test_determine_tier_only_best_win_loss_small_cp_loss_can_be_large_is_t2():
    # is_only_best=True 인 케이스는 "손실이 있어도" 우선 T2로 보는 기대값에 맞춘다.
    assert _determine_tier(30, 0.9, 1, True) == MoveTier.T2