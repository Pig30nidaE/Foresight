from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest

import app.api.routes.stats as stats_route
from app.api.routes.stats import router as stats_router


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(stats_router, prefix="/api/v1/stats")
    return app


@pytest.mark.anyio
async def test_first_moves_accepts_list_rows(app, monkeypatch):
    async def fake_get_recent_games(*args, **kwargs):
        return [{"dummy": True}]

    rows = [
        {"time_class": "bullet", "white": "any_hogs", "black": "opponent"},
        {"time_class": "bullet", "white": "other", "black": "any_hogs"},
    ]

    monkeypatch.setattr(stats_route.chessdotcom_svc, "get_recent_games", fake_get_recent_games)
    monkeypatch.setattr(stats_route.analysis_svc, "build_dataframe", lambda games: rows)
    monkeypatch.setattr(
        stats_route.analysis_svc,
        "get_first_move_stats",
        lambda built_rows, username: {
            "white": [{"eco": "e4", "games": 1}],
            "black": [{"eco": "c5", "games": 1}],
            "total_games": len(built_rows),
            "username": username,
        },
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        resp = await client.get(
            "/api/v1/stats/first-moves/chess.com/any_hogs",
            params={"time_class": "bullet", "max_games": 100},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_games"] == 2
    assert data["username"] == "any_hogs"


@pytest.mark.anyio
async def test_opening_tree_side_filter_with_list_rows(app, monkeypatch):
    async def fake_get_recent_games(*args, **kwargs):
        return [{"dummy": True}]

    rows = [
        {"white": "any_hogs", "black": "opponent", "opening_eco": "B20", "opening_name": "Sicilian"},
        {"white": "Any_Hogs", "black": "opponent2", "opening_eco": "C20", "opening_name": "King's Pawn"},
        {"white": "other", "black": "any_hogs", "opening_eco": "D00", "opening_name": "Queen's Pawn"},
    ]

    captured = {}

    def fake_get_opening_tree(filtered_rows, depth):
        captured["rows"] = filtered_rows
        captured["depth"] = depth
        return [{"games": len(filtered_rows)}]

    monkeypatch.setattr(stats_route.chessdotcom_svc, "get_recent_games", fake_get_recent_games)
    monkeypatch.setattr(stats_route.analysis_svc, "build_dataframe", lambda games: rows)
    monkeypatch.setattr(stats_route.analysis_svc, "get_opening_tree", fake_get_opening_tree)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        resp = await client.get(
            "/api/v1/stats/opening-tree/chess.com/any_hogs",
            params={"time_class": "bullet", "max_games": 100, "side": "white", "depth": 3},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["games"] == 2
    assert captured["depth"] == 3
    assert all(r["white"].lower() == "any_hogs" for r in captured["rows"])