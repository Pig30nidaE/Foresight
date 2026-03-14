from app.features.opening_tier.services.opening_tier_service import (
    OpeningTierService,
    _OpeningNode,
    _infer_opening_side,
)


def test_infer_opening_side_from_ply_parity():
    assert _infer_opening_side(["e2e4"], 1) == "white"
    assert _infer_opening_side(["e2e4", "c7c6"], 2) == "black"
    # moves가 없는 BFS/legacy 캐시 데이터는 depth parity로 추론
    assert _infer_opening_side(None, 5) == "white"
    assert _infer_opening_side(None, 4) == "black"


def test_assign_tiers_filters_by_opening_side():
    svc = OpeningTierService()
    openings = {
        "A02": _OpeningNode(
            eco="A02",
            name="Bird's Opening",
            opening_side="white",
            white_wins=520,
            draws=180,
            black_wins=300,
            depth=3,
            moves=["f2f4", "d7d5", "g2g3"],
        ),
        "B10": _OpeningNode(
            eco="B10",
            name="Caro-Kann Defense",
            opening_side="black",
            white_wins=390,
            draws=210,
            black_wins=400,
            depth=4,
            moves=["e2e4", "c7c6", "d2d4", "d7d5"],
        ),
    }

    white_result = svc._assign_tiers(openings, "white")
    black_result = svc._assign_tiers(openings, "black")

    assert len(white_result) == 1
    assert white_result[0]["eco"] == "A02"

    assert len(black_result) == 1
    assert black_result[0]["eco"] == "B10"
