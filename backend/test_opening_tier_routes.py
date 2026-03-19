from fastapi.testclient import TestClient
import pytest

from app.api.routes.opening_tier import router as opening_router
from app.features.opening_tier.services.opening_tier_service import OpeningTierService
from app.main import app


app.include_router(opening_router, prefix="/api/v1/opening-tier")


@pytest.fixture(autouse=True)
def override_service(monkeypatch):
    svc = OpeningTierService()

    async def fake_get_opening_tiers(self, rating, speed, color):
        return ([{"eco": "A00", "name": "Fake", "tier": "S", "white_wins": 1, "draws": 0, "black_wins": 0, "total_games": 1, "win_rate": 1.0, "draw_rate": 0.0, "tier_score": 1.0}], "2025-01 ~ 2025-01")

    monkeypatch.setattr(svc, "get_opening_tiers", fake_get_opening_tiers)
    monkeypatch.setattr(OpeningTierService, "get_opening_tiers", fake_get_opening_tiers)
    return svc


def test_global_endpoint_success():
    client = TestClient(app)
    resp = client.get("/api/v1/opening-tier/global", params={"rating": 1800, "speed": "blitz", "color": "white"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["rating"] == 1800
    assert data["total_openings"] == 1


def test_global_endpoint_service_error(monkeypatch):
    """If the underlying service raises RuntimeError, the route should return 502."""
    client = TestClient(app)
    async def bad_call(self, rating, speed, color):
        raise RuntimeError("explorer unreachable")

    monkeypatch.setattr(OpeningTierService, "get_opening_tiers", bad_call)
    resp = client.get("/api/v1/opening-tier/global", params={"rating": 1800, "speed": "blitz", "color": "white"})
    assert resp.status_code == 502
    assert "explorer unreachable" in resp.json().get("detail", "")


def test_global_endpoint_bad_rating():
    client = TestClient(app)
    resp = client.get("/api/v1/opening-tier/global", params={"rating": 123, "speed": "blitz", "color": "white"})
    assert resp.status_code == 400


def test_brackets_endpoint():
    client = TestClient(app)
    resp = client.get("/api/v1/opening-tier/brackets", params={"speed": "blitz"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["speed"] == "blitz"
    assert isinstance(data["brackets"], list)
