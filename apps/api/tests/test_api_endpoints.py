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


WATER_TODAY_PAYLOAD = {
    "success": True,
    "date": "2026-05-19",
    "today_total_ml": 1750,
    "goal_ml": 2500,
    "remaining_ml": 750,
    "progress_percent": 70,
    "logs": [
        {
            "id": "water-1",
            "amount_ml": 500,
            "logged_at": "2026-05-19T08:00:00Z",
            "created_at": "2026-05-19T08:00:05Z",
        }
    ],
}

WATER_HISTORY_PAYLOAD = {
    "success": True,
    "entries": [
        {
            "date": "2026-05-18",
            "total_ml": 2100,
            "goal_ml": 2500,
            "progress_percent": 84,
        },
        {
            "date": "2026-05-19",
            "total_ml": 1750,
            "goal_ml": 2500,
            "progress_percent": 70,
        },
    ],
    "logs": WATER_TODAY_PAYLOAD["logs"],
}

WATER_MUTATION_PAYLOAD = {
    "success": True,
    "log": WATER_TODAY_PAYLOAD["logs"][0],
    "today_total_ml": 1750,
    "goal_ml": 2500,
    "remaining_ml": 750,
    "progress_percent": 70,
}

WEIGHT_SUMMARY_PAYLOAD = {
    "success": True,
    "current_weight": 78.4,
    "target_weight": 72.0,
    "unit": "kg",
    "change_from_start": -3.6,
    "remaining_to_goal": 6.4,
    "recent_change": -0.4,
    "progress_percent": 36,
    "trend": [
        {"date": "2026-05-12", "weight": 82.0, "unit": "kg"},
        {"date": "2026-05-19", "weight": 78.4, "unit": "kg"},
    ],
}

WEIGHT_HISTORY_PAYLOAD = {
    "success": True,
    "logs": [
        {
            "id": "weight-1",
            "weight": 78.4,
            "unit": "kg",
            "weight_kg": 78.4,
            "notes": "Morning fasted",
            "logged_at": "2026-05-19T06:00:00Z",
            "created_at": "2026-05-19T06:00:05Z",
        }
    ],
    "trend": WEIGHT_SUMMARY_PAYLOAD["trend"],
}

WEIGHT_MUTATION_PAYLOAD = {
    "success": True,
    "log": WEIGHT_HISTORY_PAYLOAD["logs"][0],
    "summary": WEIGHT_SUMMARY_PAYLOAD,
}

WEIGHT_GOAL_PAYLOAD = {
    "success": True,
    "target_weight": 72.0,
    "unit": "kg",
}


def test_water_today_endpoint_requires_authentication(client: TestClient) -> None:
    response = client.get("/water-logs/today")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required. Please sign in again."


def test_water_endpoints_return_service_payloads(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.wellness as wellness_routes

    monkeypatch.setattr(wellness_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_fetch_water_today(
        _access_token: str,
        *,
        user_id: str,
        date: str | None,
        timezone_name: str | None,
    ) -> dict:
        assert user_id == "user-1"
        assert date == "2026-05-19"
        assert timezone_name == "UTC"
        return WATER_TODAY_PAYLOAD

    async def fake_fetch_water_history(
        _access_token: str,
        *,
        user_id: str,
        days: int,
        timezone_name: str | None,
    ) -> dict:
        assert user_id == "user-1"
        assert days == 14
        assert timezone_name == "UTC"
        return WATER_HISTORY_PAYLOAD

    async def fake_create_water_log(
        _access_token: str,
        *,
        user_id: str,
        amount_ml: int,
        logged_at,
    ) -> dict:
        assert user_id == "user-1"
        assert amount_ml == 500
        assert logged_at is None
        return WATER_MUTATION_PAYLOAD

    async def fake_update_water_goal(
        _access_token: str,
        *,
        user_id: str,
        target_ml: int,
    ) -> dict:
        assert user_id == "user-1"
        assert target_ml == 2800
        return {"success": True, "goal_ml": 2800}

    monkeypatch.setattr(wellness_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(wellness_routes, "fetch_water_today", fake_fetch_water_today)
    monkeypatch.setattr(wellness_routes, "fetch_water_history", fake_fetch_water_history)
    monkeypatch.setattr(wellness_routes, "create_water_log", fake_create_water_log)
    monkeypatch.setattr(wellness_routes, "update_water_goal", fake_update_water_goal)

    today_response = client.get(
        "/water-logs/today?date=2026-05-19&timezone=UTC",
        headers={"Authorization": "Bearer token"},
    )
    history_response = client.get(
        "/water-logs/history?days=14&timezone=UTC",
        headers={"Authorization": "Bearer token"},
    )
    create_response = client.post(
        "/water-logs",
        headers={"Authorization": "Bearer token"},
        json={"amount_ml": 500},
    )
    goal_response = client.put(
        "/water-logs/goal",
        headers={"Authorization": "Bearer token"},
        json={"target_ml": 2800},
    )

    assert today_response.status_code == 200
    assert history_response.status_code == 200
    assert create_response.status_code == 200
    assert goal_response.status_code == 200
    assert today_response.json()["today_total_ml"] == 1750
    assert history_response.json()["entries"][0]["progress_percent"] == 84
    assert create_response.json()["log"]["id"] == "water-1"
    assert goal_response.json()["goal_ml"] == 2800


def test_weight_endpoints_return_service_payloads(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.wellness as wellness_routes

    monkeypatch.setattr(wellness_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_fetch_weight_summary(
        _access_token: str,
        *,
        user_id: str,
        timezone_name: str | None,
        unit: str | None,
    ) -> dict:
        assert user_id == "user-1"
        assert timezone_name == "UTC"
        assert unit == "kg"
        return WEIGHT_SUMMARY_PAYLOAD

    async def fake_fetch_weight_history(
        _access_token: str,
        *,
        user_id: str,
        days: int,
        timezone_name: str | None,
        unit: str | None,
    ) -> dict:
        assert user_id == "user-1"
        assert days == 90
        assert timezone_name == "UTC"
        assert unit == "kg"
        return WEIGHT_HISTORY_PAYLOAD

    async def fake_create_weight_log(
        _access_token: str,
        *,
        user_id: str,
        weight: float,
        unit: str | None,
        notes: str | None,
        logged_at,
    ) -> dict:
        assert user_id == "user-1"
        assert weight == 78.4
        assert unit == "kg"
        assert notes == "Morning fasted"
        assert logged_at is None
        return WEIGHT_MUTATION_PAYLOAD

    async def fake_update_weight_goal(
        _access_token: str,
        *,
        user_id: str,
        target_weight: float,
        unit: str | None,
    ) -> dict:
        assert user_id == "user-1"
        assert target_weight == 72.0
        assert unit == "kg"
        return WEIGHT_GOAL_PAYLOAD

    monkeypatch.setattr(wellness_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(wellness_routes, "fetch_weight_summary", fake_fetch_weight_summary)
    monkeypatch.setattr(wellness_routes, "fetch_weight_history", fake_fetch_weight_history)
    monkeypatch.setattr(wellness_routes, "create_weight_log", fake_create_weight_log)
    monkeypatch.setattr(wellness_routes, "update_weight_goal", fake_update_weight_goal)

    summary_response = client.get(
        "/weight-summary?timezone=UTC&unit=kg",
        headers={"Authorization": "Bearer token"},
    )
    history_response = client.get(
        "/weight-logs/history?days=90&timezone=UTC&unit=kg",
        headers={"Authorization": "Bearer token"},
    )
    create_response = client.post(
        "/weight-logs",
        headers={"Authorization": "Bearer token"},
        json={"weight": 78.4, "unit": "kg", "notes": "Morning fasted"},
    )
    goal_response = client.put(
        "/weight-logs/goal",
        headers={"Authorization": "Bearer token"},
        json={"target_weight": 72, "unit": "kg"},
    )

    assert summary_response.status_code == 200
    assert history_response.status_code == 200
    assert create_response.status_code == 200
    assert goal_response.status_code == 200
    assert summary_response.json()["remaining_to_goal"] == 6.4
    assert history_response.json()["logs"][0]["id"] == "weight-1"
    assert create_response.json()["summary"]["current_weight"] == 78.4
    assert goal_response.json()["target_weight"] == 72.0
