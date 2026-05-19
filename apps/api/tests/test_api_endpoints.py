from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from main import app

VALID_MEAL_PAYLOAD = {
    "meal_name": "Lunch Bowl",
    "meal_type": "lunch",
    "eaten_at": "2026-05-18T12:30:00Z",
    "notes": "Post-workout meal",
    "items": [
        {
            "name": "Chicken",
            "quantity_estimate": "150g",
            "estimated_grams": 150,
            "calories": 250,
            "protein_g": 40,
            "carbs_g": 0,
            "fat_g": 7,
            "confidence": 0.9,
            "source": "manual",
        }
    ],
}

DAILY_SUMMARY_PAYLOAD = {
    "success": True,
    "date": "2026-05-18",
    "goals": {"calories": 2200, "protein_g": 160, "carbs_g": 220, "fat_g": 70},
    "consumed": {"calories": 1300, "protein_g": 90, "carbs_g": 120, "fat_g": 35},
    "remaining": {"calories": 900, "protein_g": 70, "carbs_g": 100, "fat_g": 35},
    "progress": {
        "calories_percent": 59,
        "protein_percent": 56,
        "carbs_percent": 55,
        "fat_percent": 50,
    },
    "meals": [
        {
            "id": "meal-1",
            "meal_name": "Lunch Bowl",
            "meal_type": "lunch",
            "eaten_at": "2026-05-18T12:30:00Z",
            "total_calories": 650,
            "total_protein_g": 45,
            "total_carbs_g": 60,
            "total_fat_g": 18,
            "item_count": 3,
        }
    ],
}

MEAL_HISTORY_PAYLOAD = {
    "success": True,
    "date": "2026-05-18",
    "summary": {
        "total_calories": 1300,
        "total_protein_g": 90,
        "total_carbs_g": 120,
        "total_fat_g": 35,
        "meal_count": 2,
    },
    "goals": {"calories": 2200, "protein_g": 160, "carbs_g": 220, "fat_g": 70},
    "remaining": {"calories": 900, "protein_g": 70, "carbs_g": 100, "fat_g": 35},
    "progress": {
        "calories_percent": 59,
        "protein_percent": 56,
        "carbs_percent": 55,
        "fat_percent": 50,
    },
    "meals": [
        {
            "id": "meal-1",
            "meal_name": "Lunch Bowl",
            "meal_type": "lunch",
            "eaten_at": "2026-05-18T12:30:00Z",
            "total_calories": 650,
            "total_protein_g": 45,
            "total_carbs_g": 60,
            "total_fat_g": 18,
            "item_count": 3,
            "image_url": None,
        }
    ],
}

TODAY_INSIGHTS_FALLBACK_PAYLOAD = {
    "success": True,
    "date": "2026-05-18",
    "timezone": "UTC",
    "source": "fallback",
    "summary": {
        "goals": {"calories": 2200, "protein_g": 160, "carbs_g": 220, "fat_g": 70},
        "consumed": {"calories": 1300, "protein_g": 90, "carbs_g": 120, "fat_g": 35},
        "progress": {
            "calories_percent": 59,
            "protein_percent": 56,
            "carbs_percent": 55,
            "fat_percent": 50,
        },
        "meal_count": 2,
        "calorie_adherence_percent": 82,
        "logging_streak_days": 4,
        "protein_goal_hit_streak_days": 2,
        "late_night_calorie_share_percent": 12,
        "goal_type": "maintain",
    },
    "insights": [
        {
            "id": "ins_1",
            "type": "recommendation",
            "priority": "medium",
            "title": "Keep protein steady",
            "message": "Protein intake is on track and close to your planned daily target.",
            "recommendation": "Keep a protein-rich dinner to close the gap smoothly.",
            "actionable": True,
            "created_at": "2026-05-18T12:30:00Z",
        }
    ],
    "fallback_reason": "AI service timeout.",
}


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ai-diet-api"}


def test_analyze_image_requires_image_input(client: TestClient) -> None:
    response = client.post("/analyze-image", json={})

    assert response.status_code == 400
    assert "Provide image_base64 or image_url" in response.json()["detail"]


def test_analyze_image_rejects_extra_json_fields(client: TestClient) -> None:
    response = client.post(
        "/analyze-image",
        json={"image_url": "https://example.com/meal.jpg", "unexpected": "field"},
    )

    assert response.status_code == 422
    assert "unexpected" in response.json()["detail"]


def test_analyze_image_rejects_multiple_image_sources(client: TestClient) -> None:
    response = client.post(
        "/analyze-image",
        json={"image_url": "https://example.com/meal.jpg", "image_base64": "Zm9v"},
    )

    assert response.status_code == 422
    assert "either image_base64 or image_url" in response.json()["detail"]


def test_meals_endpoint_requires_authentication(client: TestClient) -> None:
    response = client.post("/meals", json=VALID_MEAL_PAYLOAD)

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required. Please sign in again."


def test_meals_endpoint_rejects_extra_fields(client: TestClient) -> None:
    response = client.post("/meals", json={**VALID_MEAL_PAYLOAD, "unexpected": "field"})

    assert response.status_code == 422


def test_daily_summary_endpoint_returns_service_payload(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.meals as meals_routes

    monkeypatch.setattr(meals_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_fetch_daily_summary(
        _access_token: str,
        *,
        requested_date: str | None,
        timezone_name: str | None,
        user_id: str | None,
    ) -> dict:
        assert requested_date == "2026-05-18"
        assert timezone_name == "UTC"
        assert user_id == "user-1"
        return DAILY_SUMMARY_PAYLOAD

    monkeypatch.setattr(meals_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(meals_routes, "fetch_daily_summary", fake_fetch_daily_summary)

    response = client.get(
        "/daily-summary?date=2026-05-18&timezone=UTC",
        headers={"Authorization": "Bearer token"},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["date"] == "2026-05-18"


def test_meal_history_endpoint_returns_service_payload(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.meals as meals_routes

    monkeypatch.setattr(meals_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_fetch_meal_history(
        _access_token: str,
        *,
        requested_date: str | None,
        timezone_name: str | None,
        user_id: str | None,
    ) -> dict:
        assert requested_date == "2026-05-18"
        assert timezone_name == "UTC"
        assert user_id == "user-1"
        return MEAL_HISTORY_PAYLOAD

    monkeypatch.setattr(meals_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(meals_routes, "fetch_meal_history", fake_fetch_meal_history)

    response = client.get(
        "/meal-history?date=2026-05-18&timezone=UTC",
        headers={"Authorization": "Bearer token"},
    )

    assert response.status_code == 200
    assert response.json()["summary"]["meal_count"] == 2


def test_ai_insights_today_endpoint_supports_fallback_payload(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.insights as insights_routes

    monkeypatch.setattr(insights_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_fetch_ai_insights_today(
        _access_token: str,
        *,
        requested_date: str | None,
        timezone_name: str | None,
        user_id: str | None,
    ) -> dict:
        assert requested_date == "2026-05-18"
        assert timezone_name == "UTC"
        assert user_id == "user-1"
        return TODAY_INSIGHTS_FALLBACK_PAYLOAD

    monkeypatch.setattr(insights_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(insights_routes, "fetch_ai_insights_today", fake_fetch_ai_insights_today)

    response = client.get(
        "/ai-insights/today?date=2026-05-18&timezone=UTC",
        headers={"Authorization": "Bearer token"},
    )

    assert response.status_code == 200
    assert response.json()["source"] == "fallback"
    assert response.json()["fallback_reason"] == "AI service timeout."

FOOD_SEARCH_PAYLOAD = {
    "success": True,
    "query": "chicken rice",
    "foods": [
        {
            "id": "usda:123",
            "name": "Chicken and rice bowl",
            "brand": None,
            "serving_size": "100 g",
            "serving_size_g": 100,
            "calories": 210,
            "protein_g": 14,
            "carbs_g": 24,
            "fat_g": 6,
            "image_url": None,
            "barcode": None,
            "source": "usda",
        }
    ],
    "pagination": {
        "page": 1,
        "limit": 12,
        "has_more": False,
    },
}

BARCODE_LOOKUP_PAYLOAD = {
    "success": True,
    "barcode": "7622210449283",
    "food": {
        "id": "openfoodfacts:7622210449283",
        "name": "Chocolate biscuit",
        "brand": "Brand",
        "serving_size": "30 g",
        "serving_size_g": 30,
        "calories": 145,
        "protein_g": 2,
        "carbs_g": 20,
        "fat_g": 6,
        "image_url": "https://example.com/food.jpg",
        "barcode": "7622210449283",
        "source": "openfoodfacts",
    },
}

FOODS_COLLECTION_PAYLOAD = {
    "success": True,
    "foods": [
        {
            "id": "recent:food-1",
            "name": "Greek Yogurt",
            "brand": None,
            "serving_size": "170 g",
            "serving_size_g": 170,
            "calories": 120,
            "protein_g": 17,
            "carbs_g": 6,
            "fat_g": 0,
            "image_url": None,
            "barcode": None,
            "source": "recent",
        }
    ],
}

FAVORITE_SAVE_PAYLOAD = {
    "success": True,
    "favorite_id": "fav-1",
    "food": {
        "id": "favorite:fav-1",
        "name": "Greek Yogurt",
        "brand": None,
        "serving_size": "170 g",
        "serving_size_g": 170,
        "calories": 120,
        "protein_g": 17,
        "carbs_g": 6,
        "fat_g": 0,
        "image_url": None,
        "barcode": None,
        "source": "favorite",
    },
}


def test_food_search_endpoint_requires_authentication(client: TestClient) -> None:
    response = client.get("/foods/search?q=chicken")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required. Please sign in again."


def test_food_search_endpoint_returns_service_payload(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.foods as foods_routes

    monkeypatch.setattr(foods_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_search_foods(
        _access_token: str,
        *,
        user_id: str,
        query: str,
        page: int,
        limit: int,
    ) -> dict:
        assert user_id == "user-1"
        assert query == "chicken rice"
        assert page == 1
        assert limit == 12
        return FOOD_SEARCH_PAYLOAD

    monkeypatch.setattr(foods_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(foods_routes, "search_foods", fake_search_foods)

    response = client.get(
        "/foods/search?q=chicken rice&page=1&limit=12",
        headers={"Authorization": "Bearer token"},
    )

    assert response.status_code == 200
    assert response.json()["foods"][0]["name"] == "Chicken and rice bowl"


def test_food_barcode_endpoint_returns_service_payload(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.foods as foods_routes

    monkeypatch.setattr(foods_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_lookup_food_by_barcode(_access_token: str, barcode: str) -> dict:
        assert barcode == "7622210449283"
        return BARCODE_LOOKUP_PAYLOAD

    monkeypatch.setattr(foods_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(foods_routes, "lookup_food_by_barcode", fake_lookup_food_by_barcode)

    response = client.get(
        "/foods/barcode/7622210449283",
        headers={"Authorization": "Bearer token"},
    )

    assert response.status_code == 200
    assert response.json()["food"]["source"] == "openfoodfacts"


def test_food_recent_and_favorites_endpoints_return_payloads(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.foods as foods_routes

    monkeypatch.setattr(foods_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_fetch_recent_foods(_access_token: str, *, user_id: str, limit: int) -> dict:
        assert user_id == "user-1"
        assert limit == 8
        return FOODS_COLLECTION_PAYLOAD

    async def fake_fetch_favorite_foods(_access_token: str, *, user_id: str, limit: int) -> dict:
        assert user_id == "user-1"
        assert limit == 8
        return {
            "success": True,
            "foods": [
                {
                    **FOODS_COLLECTION_PAYLOAD["foods"][0],
                    "id": "favorite:fav-1",
                    "source": "favorite",
                }
            ],
        }

    monkeypatch.setattr(foods_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(foods_routes, "fetch_recent_foods", fake_fetch_recent_foods)
    monkeypatch.setattr(foods_routes, "fetch_favorite_foods", fake_fetch_favorite_foods)

    recent_response = client.get("/foods/recent?limit=8", headers={"Authorization": "Bearer token"})
    favorites_response = client.get("/foods/favorites?limit=8", headers={"Authorization": "Bearer token"})

    assert recent_response.status_code == 200
    assert favorites_response.status_code == 200
    assert recent_response.json()["foods"][0]["source"] == "recent"
    assert favorites_response.json()["foods"][0]["source"] == "favorite"


def test_food_favorite_endpoint_saves_food(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.foods as foods_routes

    monkeypatch.setattr(foods_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_save_favorite_food(_access_token: str, *, user_id: str, food: dict) -> dict:
        assert user_id == "user-1"
        assert food["name"] == "Greek Yogurt"
        return FAVORITE_SAVE_PAYLOAD

    monkeypatch.setattr(foods_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(foods_routes, "save_favorite_food", fake_save_favorite_food)

    response = client.post(
        "/foods/favorite",
        headers={"Authorization": "Bearer token"},
        json={
            "food": {
                "name": "Greek Yogurt",
                "serving_size": "170 g",
                "serving_size_g": 170,
                "calories": 120,
                "protein_g": 17,
                "carbs_g": 6,
                "fat_g": 0,
                "source": "favorite",
            }
        },
    )

    assert response.status_code == 200
    assert response.json()["favorite_id"] == "fav-1"
