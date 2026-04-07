from app.features.opening_tier.services.opening_tier_service import (
    OpeningTierService,
    _OpeningNode,
    _infer_opening_side_by_eco,
)


def test_infer_opening_side_by_eco_ranges():
    # White 대역
    assert _infer_opening_side_by_eco("A00", "Irregular", ["b2b3"], 1) == "white"
    assert _infer_opening_side_by_eco("C30", "King's Gambit", None, 0) == "white"
    assert _infer_opening_side_by_eco("E05", "Catalan Opening", None, 0) == "white"

    # Black 대역
    assert _infer_opening_side_by_eco("B10", "Caro-Kann Defense", None, 0) == "black"
    assert _infer_opening_side_by_eco("D85", "Grunfeld Defense", None, 0) == "black"
    assert _infer_opening_side_by_eco("E60", "King's Indian Defense", None, 0) == "black"

    # 대역 외 fallback (안전 처리)
    assert _infer_opening_side_by_eco("Z99", "Unknown", None, 5) == "white"
    assert _infer_opening_side_by_eco("Z99", "Unknown", None, 4) == "black"


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
