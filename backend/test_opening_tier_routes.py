from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest

from app.api.routes.opening_tier import router as opening_router
from app.features.opening_tier.services.opening_tier_service import OpeningTierService


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(opening_router, prefix="/api/v1/opening-tier")
    return app


@pytest.fixture(autouse=True)
def override_service(monkeypatch):
    svc = OpeningTierService()

    async def fake_get_opening_tiers(self, rating, speed, color, **kwargs):
        return (
            [{"eco": "A00", "name": "Fake", "tier": "S", "white_wins": 1, "draws": 0, "black_wins": 0, "total_games": 1, "win_rate": 1.0, "draw_rate": 0.0, "tier_score": 1.0}],
            "2025-01 ~ 2025-01",
            "2025-01-15",
        )

    monkeypatch.setattr(svc, "get_opening_tiers", fake_get_opening_tiers)
    monkeypatch.setattr(OpeningTierService, "get_opening_tiers", fake_get_opening_tiers)
    return svc


@pytest.mark.anyio
async def test_global_endpoint_success(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        resp = await client.get(
            "/api/v1/opening-tier/global",
            params={"rating": 1600, "speed": "blitz", "color": "white"},
            headers={"x-foresight-client": "web-ui"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["rating"] == 1600
    assert data["total_openings"] == 1


@pytest.mark.anyio
async def test_global_endpoint_public_no_extra_headers(app):
    """로그인·클라이언트 헤더 없이도 티어 데이터 조회 가능해야 함."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        resp = await client.get(
            "/api/v1/opening-tier/global",
            params={"rating": 1600, "speed": "blitz", "color": "white"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["rating"] == 1600
    assert data["total_openings"] == 1


@pytest.mark.anyio
async def test_global_endpoint_service_error(app, monkeypatch):
    """If the underlying service raises RuntimeError, the route should return 503."""
    async def bad_call(self, rating, speed, color, **kwargs):
        raise RuntimeError("explorer unreachable")

    monkeypatch.setattr(OpeningTierService, "get_opening_tiers", bad_call)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        resp = await client.get(
            "/api/v1/opening-tier/global",
            params={"rating": 1600, "speed": "blitz", "color": "white"},
            headers={"x-foresight-client": "web-ui"},
        )
    assert resp.status_code == 503
    assert "explorer unreachable" in resp.json().get("detail", "")


@pytest.mark.anyio
async def test_global_endpoint_bad_rating(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        resp = await client.get(
            "/api/v1/opening-tier/global",
            params={"rating": 123, "speed": "blitz", "color": "white"},
            headers={"x-foresight-client": "web-ui"},
        )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_brackets_endpoint(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        resp = await client.get(
            "/api/v1/opening-tier/brackets",
            params={"speed": "blitz"},
            headers={"x-foresight-client": "web-ui"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["speed"] == "blitz"
    assert isinstance(data["brackets"], list)


@pytest.mark.anyio
async def test_global_hides_minor_without_query(app, monkeypatch):
    async def fake_get_opening_tiers(self, rating, speed, color, **kwargs):
        return (
            [
                {
                    "eco": "B97",
                    "name": "Sicilian Defense: Najdorf",
                    "tier": "A",
                    "white_wins": 120,
                    "draws": 40,
                    "black_wins": 180,
                    "total_games": 340,
                    "win_rate": 0.5294,
                    "draw_rate": 0.1176,
                    "tier_score": 0.1245,
                    "moves": None,
                    "is_minor": False,
                },
                {
                    "eco": "A40",
                    "name": "Queen's Pawn Game",
                    "tier": "D",
                    "white_wins": 0,
                    "draws": 0,
                    "black_wins": 1,
                    "total_games": 1,
                    "win_rate": 1.0,
                    "draw_rate": 0.0,
                    "tier_score": -0.5,
                    "moves": None,
                    "is_minor": True,
                },
            ],
            "2025-01 ~ 2025-01",
            "2025-01-15",
        )

    monkeypatch.setattr(OpeningTierService, "get_opening_tiers", fake_get_opening_tiers)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        resp = await client.get(
            "/api/v1/opening-tier/global",
            params={"rating": 1600, "speed": "blitz", "color": "black"},
            headers={"x-foresight-client": "web-ui"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_openings"] == 1
    assert data["openings"][0]["eco"] == "B97"


@pytest.mark.anyio
async def test_global_shows_minor_on_query(app, monkeypatch):
    async def fake_get_opening_tiers(self, rating, speed, color, **kwargs):
        return (
            [
                {
                    "eco": "A40",
                    "name": "Queen's Pawn Game",
                    "tier": "D",
                    "white_wins": 0,
                    "draws": 0,
                    "black_wins": 1,
                    "total_games": 1,
                    "win_rate": 1.0,
                    "draw_rate": 0.0,
                    "tier_score": -0.5,
                    "moves": None,
                    "is_minor": True,
                }
            ],
            "2025-01 ~ 2025-01",
            "2025-01-15",
        )

    monkeypatch.setattr(OpeningTierService, "get_opening_tiers", fake_get_opening_tiers)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        resp = await client.get(
            "/api/v1/opening-tier/global",
            params={"rating": 1600, "speed": "blitz", "color": "black", "q": "queen"},
            headers={"x-foresight-client": "web-ui"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_openings"] == 1
    assert data["openings"][0]["eco"] == "A40"
