from app.ml.game_analyzer import (
    MoveTier,
    AnalyzedMove,
    _compute_accuracy,
    _determine_tier,
    _promote_best_t2_to_t1,
)


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


def test_promote_best_t2_to_t1():
    def mv(hm, cp_loss, win_loss, rank, only_best, tier, **extra):
        return AnalyzedMove(
            halfmove=hm, move_number=hm // 2 + 1, color="white", san="e4", uci="e2e4",
            cp_loss=cp_loss, win_pct_loss=win_loss,
            user_move_rank=rank, is_only_best=only_best, tier=tier,
            **extra,
        )

    w = [
        mv(0, 5, 0.5, 1, True, MoveTier.T2, best_gap_cp=90, is_decisive=True),
        mv(2, 8, 1.0, 1, False, MoveTier.T2),
    ]
    b = [mv(1, 3, 0.2, 1, True, MoveTier.T2)]
    _promote_best_t2_to_t1(w, b)
    t1s = [m for m in w + b if m.tier == MoveTier.T1]
    assert len(t1s) == 1
    assert t1s[0].halfmove == 0


def test_promote_best_t2_to_t1_skips_when_no_rare_signal():
    move = AnalyzedMove(
        halfmove=0,
        move_number=1,
        color="white",
        san="e4",
        uci="e2e4",
        cp_loss=2,
        win_pct_loss=0.2,
        user_move_rank=1,
        is_only_best=True,
        tier=MoveTier.T2,
    )

    promoted = _promote_best_t2_to_t1([move], [])
    assert promoted is None
    assert move.tier == MoveTier.T2


def test_promote_best_t2_to_t1_accepts_sacrifice_signal():
    move = AnalyzedMove(
        halfmove=5,
        move_number=3,
        color="black",
        san="Bxh2+",
        uci="c7h2",
        cp_loss=3,
        win_pct_loss=0.4,
        user_move_rank=1,
        is_only_best=True,
        tier=MoveTier.T2,
        is_sacrifice=True,
        sacrifice_value=3,
    )

    promoted = _promote_best_t2_to_t1([], [move])
    assert promoted is move
    assert move.tier == MoveTier.T1


def test_accuracy_is_stabilized_in_mate_like_decisive_sequence():
    moves = [
        AnalyzedMove(
            halfmove=1,
            move_number=1,
            color="white",
            san="Qh5+",
            uci="d1h5",
            cp_before=9800,
            cp_after=9600,
            win_pct_loss=45.0,  # 메이트 수순 변화로 과대 산정된 손실 가정
            tier=MoveTier.T2,
        ),
        AnalyzedMove(
            halfmove=3,
            move_number=2,
            color="white",
            san="Bc4",
            uci="f1c4",
            cp_before=9500,
            cp_after=9400,
            win_pct_loss=35.0,
            tier=MoveTier.T2,
        ),
    ]

    acc = _compute_accuracy(moves)
    # 완화 로직이 없으면 한 자리 수 정확도로 급락할 수 있음.
    assert acc >= 90.0


def test_accuracy_reflects_engine_alignment_and_cp_loss():
    good = [
        AnalyzedMove(
            halfmove=1,
            move_number=1,
            color="white",
            san="Nf3",
            uci="g1f3",
            cp_loss=4,
            win_pct_loss=0.8,
            user_move_rank=1,
            top_moves=[{"uci": "g1f3", "rank": 1}],
            tier=MoveTier.T2,
        )
    ]
    bad = [
        AnalyzedMove(
            halfmove=1,
            move_number=1,
            color="white",
            san="a3",
            uci="a2a3",
            cp_loss=60,
            win_pct_loss=0.8,
            user_move_rank=0,
            top_moves=[{"uci": "g1f3", "rank": 1}],
            tier=MoveTier.T5,
        )
    ]

    assert _compute_accuracy(good) > _compute_accuracy(bad)