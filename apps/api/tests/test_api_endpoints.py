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


ANALYTICS_WEEKLY_PAYLOAD = {
    "success": True,
    "timezone": "UTC",
    "summary": {
        "week_start": "2026-05-13",
        "week_end": "2026-05-19",
        "days_tracked": 6,
        "calorie_trend": "up",
        "weight_trend": "down",
        "protein_consistency_score": 82,
        "hydration_consistency_score": 77,
        "goal_adherence": {
            "calories_percent": 79,
            "protein_percent": 81,
            "carbs_percent": 75,
            "fat_percent": 78,
            "hydration_percent": 72,
            "overall_percent": 77,
        },
        "weekly_macro_averages": [
            {"macro": "calories", "average": 2080, "goal": 2200, "adherence_percent": 95},
            {"macro": "protein_g", "average": 152, "goal": 160, "adherence_percent": 95},
            {"macro": "carbs_g", "average": 208, "goal": 220, "adherence_percent": 95},
            {"macro": "fat_g", "average": 68, "goal": 70, "adherence_percent": 97},
            {"macro": "hydration_ml", "average": 2320, "goal": 2500, "adherence_percent": 93},
        ],
        "weight_change": -0.7,
        "weight_goal_progress_percent": 42,
    },
    "daily_metrics": [
        {
            "date": "2026-05-19",
            "calories": 2140,
            "protein_g": 155,
            "carbs_g": 210,
            "fat_g": 70,
            "hydration_ml": 2400,
            "hydration_goal_ml": 2500,
            "calorie_adherence_percent": 97,
            "protein_adherence_percent": 97,
            "carbs_adherence_percent": 95,
            "fat_adherence_percent": 100,
            "hydration_adherence_percent": 96,
            "weight": 78.4,
            "weight_unit": "kg",
            "meal_count": 4,
            "tracked": True,
        }
    ],
}

ANALYTICS_MONTHLY_PAYLOAD = {
    "success": True,
    "timezone": "UTC",
    "summary": {
        "period_start": "2026-04-20",
        "period_end": "2026-05-19",
        "days_tracked": 24,
        "average_goal_adherence_percent": 74,
        "calories_trend": "stable",
        "protein_trend": "up",
        "hydration_trend": "up",
        "weight_trend": "down",
    },
    "daily_metrics": ANALYTICS_WEEKLY_PAYLOAD["daily_metrics"],
    "weekly_metrics": [
        {
            "week_start": "2026-05-13",
            "week_end": "2026-05-19",
            "avg_calories": 2080,
            "avg_protein_g": 152,
            "avg_hydration_ml": 2320,
            "goal_adherence_percent": 77,
            "weight_change": -0.7,
        }
    ],
}

ANALYTICS_STREAKS_PAYLOAD = {
    "success": True,
    "as_of_date": "2026-05-19",
    "streaks": [
        {
            "key": "meal_logging",
            "label": "Meal logging streak",
            "current": 6,
            "best": 11,
            "unit": "days",
            "is_active": True,
        },
        {
            "key": "hydration_goal",
            "label": "Hydration goal streak",
            "current": 3,
            "best": 7,
            "unit": "days",
            "is_active": True,
        },
    ],
}

ANALYTICS_ACHIEVEMENTS_PAYLOAD = {
    "success": True,
    "generated_at": "2026-05-19T12:00:00Z",
    "total_unlocked": 2,
    "achievements": [
        {
            "id": "meal_streak_7",
            "title": "7-day logging streak",
            "description": "Log at least one meal for 7 days in a row.",
            "category": "consistency",
            "current_value": 6,
            "target_value": 7,
            "progress_percent": 86,
            "unlocked": False,
            "unlocked_at": None,
        }
    ],
}

ANALYTICS_SUMMARY_PAYLOAD = {
    "success": True,
    "source": "fallback",
    "timezone": "UTC",
    "period_start": "2026-04-20",
    "period_end": "2026-05-19",
    "generated_at": "2026-05-19T12:00:00Z",
    "key_metrics": {
        "days_tracked": 24,
        "average_goal_adherence_percent": 74,
        "logging_streak_days": 6,
        "hydration_streak_days": 3,
        "protein_streak_days": 4,
        "weight_goal_progress_percent": 42,
    },
    "streak_highlights": ANALYTICS_STREAKS_PAYLOAD["streaks"],
    "summary": {
        "headline": "Your consistency trend is improving and your adherence is becoming more stable.",
        "wins": ["Meal logging consistency is improving this week."],
        "focus_areas": ["Keep hydration timing evenly distributed."],
        "next_steps": ["Repeat your highest-protein breakfast template tomorrow."],
        "motivation": "Small, repeatable behaviors are compounding into long-term progress.",
        "risk_flags": [],
        "confidence_score": 74,
    },
    "fallback_reason": "Analytics AI summary timed out.",
}


def test_analytics_endpoint_requires_authentication(client: TestClient) -> None:
    response = client.get("/analytics/weekly")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required. Please sign in again."


def test_analytics_endpoints_return_service_payloads(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.analytics as analytics_routes

    monkeypatch.setattr(analytics_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_fetch_analytics_weekly(
        _access_token: str,
        *,
        requested_date: str | None,
        timezone_name: str | None,
        user_id: str | None,
        unit: str | None,
    ) -> dict:
        assert requested_date == "2026-05-19"
        assert timezone_name == "UTC"
        assert user_id == "user-1"
        assert unit == "kg"
        return ANALYTICS_WEEKLY_PAYLOAD

    async def fake_fetch_analytics_monthly(
        _access_token: str,
        *,
        requested_date: str | None,
        timezone_name: str | None,
        user_id: str | None,
        unit: str | None,
    ) -> dict:
        assert requested_date == "2026-05-19"
        assert timezone_name == "UTC"
        assert user_id == "user-1"
        assert unit == "kg"
        return ANALYTICS_MONTHLY_PAYLOAD

    async def fake_fetch_analytics_streaks(
        _access_token: str,
        *,
        requested_date: str | None,
        timezone_name: str | None,
        user_id: str | None,
    ) -> dict:
        assert requested_date == "2026-05-19"
        assert timezone_name == "UTC"
        assert user_id == "user-1"
        return ANALYTICS_STREAKS_PAYLOAD

    async def fake_fetch_analytics_achievements(
        _access_token: str,
        *,
        requested_date: str | None,
        timezone_name: str | None,
        user_id: str | None,
        unit: str | None,
    ) -> dict:
        assert requested_date == "2026-05-19"
        assert timezone_name == "UTC"
        assert user_id == "user-1"
        assert unit == "kg"
        return ANALYTICS_ACHIEVEMENTS_PAYLOAD

    async def fake_fetch_analytics_summary(
        _access_token: str,
        *,
        requested_date: str | None,
        timezone_name: str | None,
        user_id: str | None,
        unit: str | None,
    ) -> dict:
        assert requested_date == "2026-05-19"
        assert timezone_name == "UTC"
        assert user_id == "user-1"
        assert unit == "kg"
        return ANALYTICS_SUMMARY_PAYLOAD

    monkeypatch.setattr(analytics_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(analytics_routes, "fetch_analytics_weekly", fake_fetch_analytics_weekly)
    monkeypatch.setattr(analytics_routes, "fetch_analytics_monthly", fake_fetch_analytics_monthly)
    monkeypatch.setattr(analytics_routes, "fetch_analytics_streaks", fake_fetch_analytics_streaks)
    monkeypatch.setattr(analytics_routes, "fetch_analytics_achievements", fake_fetch_analytics_achievements)
    monkeypatch.setattr(analytics_routes, "fetch_analytics_summary", fake_fetch_analytics_summary)

    weekly_response = client.get(
        "/analytics/weekly?date=2026-05-19&timezone=UTC&unit=kg",
        headers={"Authorization": "Bearer token"},
    )
    monthly_response = client.get(
        "/analytics/monthly?date=2026-05-19&timezone=UTC&unit=kg",
        headers={"Authorization": "Bearer token"},
    )
    streaks_response = client.get(
        "/analytics/streaks?date=2026-05-19&timezone=UTC",
        headers={"Authorization": "Bearer token"},
    )
    achievements_response = client.get(
        "/analytics/achievements?date=2026-05-19&timezone=UTC&unit=kg",
        headers={"Authorization": "Bearer token"},
    )
    summary_response = client.get(
        "/analytics/summary?date=2026-05-19&timezone=UTC&unit=kg",
        headers={"Authorization": "Bearer token"},
    )

    assert weekly_response.status_code == 200
    assert monthly_response.status_code == 200
    assert streaks_response.status_code == 200
    assert achievements_response.status_code == 200
    assert summary_response.status_code == 200
    assert weekly_response.json()["summary"]["days_tracked"] == 6
    assert monthly_response.json()["summary"]["average_goal_adherence_percent"] == 74
    assert streaks_response.json()["streaks"][0]["current"] == 6
    assert achievements_response.json()["total_unlocked"] == 2
    assert summary_response.json()["source"] == "fallback"


INTEGRATIONS_LIST_PAYLOAD = {
    "success": True,
    "integrations": [
        {
            "provider": "fitbit",
            "display_name": "Fitbit",
            "status": "connected",
            "supports_web_oauth": True,
            "requires_native_app": False,
            "data_types": ["steps", "active_calories", "distance", "weight"],
            "permissions": ["activity", "weight"],
            "connected_at": "2026-05-19T08:00:00Z",
            "last_synced_at": "2026-05-19T08:30:00Z",
            "last_error": None,
            "message": "Connect Fitbit to sync activity and body metrics into Nuvita.",
        },
        {
            "provider": "apple_health",
            "display_name": "Apple Health",
            "status": "native_required",
            "supports_web_oauth": False,
            "requires_native_app": True,
            "data_types": ["steps", "active_calories", "workouts", "weight"],
            "permissions": [],
            "connected_at": None,
            "last_synced_at": None,
            "last_error": None,
            "message": "Apple Health sync requires native iOS app support. Web setup is not yet available.",
        },
        {
            "provider": "google_fit",
            "display_name": "Google Fit",
            "status": "native_required",
            "supports_web_oauth": False,
            "requires_native_app": True,
            "data_types": ["steps", "active_calories", "distance", "weight"],
            "permissions": [],
            "connected_at": None,
            "last_synced_at": None,
            "last_error": None,
            "message": "Google Fit sync is planned through native Android health integrations.",
        },
        {
            "provider": "health_connect",
            "display_name": "Health Connect",
            "status": "native_required",
            "supports_web_oauth": False,
            "requires_native_app": True,
            "data_types": ["steps", "active_calories", "workouts", "weight"],
            "permissions": [],
            "connected_at": None,
            "last_synced_at": None,
            "last_error": None,
            "message": "Health Connect requires native Android support and is not available in web-only mode yet.",
        },
    ],
}

INTEGRATION_CONNECT_PAYLOAD = {
    "success": True,
    "provider": "fitbit",
    "status": "connecting",
    "authorization_url": "https://www.fitbit.com/oauth2/authorize?client_id=client-1",
    "message": "Continue in Fitbit to authorize data sharing.",
    "state_expires_at": "2026-05-19T08:10:00Z",
}

INTEGRATION_CALLBACK_PAYLOAD = {
    "success": True,
    "provider": "fitbit",
    "status": "sync_success",
    "message": "Fitbit connected and initial sync completed.",
    "synced_counts": {
        "activity_records": 7,
        "body_records": 2,
        "sleep_records": 0,
        "heart_records": 0,
    },
    "last_synced_at": "2026-05-19T08:35:00Z",
}

INTEGRATION_SYNC_PAYLOAD = {
    "success": True,
    "provider": "fitbit",
    "status": "sync_success",
    "message": "Sync completed successfully.",
    "synced_counts": {
        "activity_records": 14,
        "body_records": 4,
        "sleep_records": 0,
        "heart_records": 0,
    },
    "last_synced_at": "2026-05-19T08:40:00Z",
}

INTEGRATION_DISCONNECT_PAYLOAD = {
    "success": True,
    "provider": "fitbit",
    "status": "disconnected",
    "message": "Fitbit disconnected successfully.",
}

HEALTH_SUMMARY_PAYLOAD = {
    "success": True,
    "date": "2026-05-19",
    "timezone": "UTC",
    "steps_today": 8200,
    "active_calories_today": 432.5,
    "distance_meters_today": 6240.0,
    "exercise_minutes_today": 54,
    "workouts_this_week": 5,
    "latest_weight": {
        "provider": "fitbit",
        "weight": 78.2,
        "unit": "kg",
        "body_fat_percentage": 18.4,
        "recorded_at": "2026-05-19T06:15:00Z",
    },
    "sleep_duration_minutes": 432,
    "resting_heart_rate_bpm": 58,
    "integration_status": [
        {"provider": "fitbit", "status": "sync_success", "last_synced_at": "2026-05-19T08:40:00Z"},
        {"provider": "apple_health", "status": "native_required", "last_synced_at": None},
    ],
}

HEALTH_ACTIVITY_PAYLOAD = {
    "success": True,
    "timezone": "UTC",
    "start_date": "2026-05-06",
    "end_date": "2026-05-19",
    "entries": [
        {
            "date": "2026-05-18",
            "steps": 7600,
            "active_calories": 390.0,
            "distance_meters": 5800.0,
            "exercise_minutes": 48,
            "workouts_count": 1,
            "providers": ["fitbit"],
        },
        {
            "date": "2026-05-19",
            "steps": 8200,
            "active_calories": 432.5,
            "distance_meters": 6240.0,
            "exercise_minutes": 54,
            "workouts_count": 1,
            "providers": ["fitbit"],
        },
    ],
}

HEALTH_BODY_PAYLOAD = {
    "success": True,
    "timezone": "UTC",
    "start_date": "2026-04-20",
    "end_date": "2026-05-19",
    "latest": {
        "id": "body-2",
        "provider": "fitbit",
        "source_record_id": "fitbit-weight-2",
        "weight": 78.2,
        "body_fat_percentage": 18.4,
        "unit": "kg",
        "recorded_at": "2026-05-19T06:15:00Z",
    },
    "entries": [
        {
            "id": "body-2",
            "provider": "fitbit",
            "source_record_id": "fitbit-weight-2",
            "weight": 78.2,
            "body_fat_percentage": 18.4,
            "unit": "kg",
            "recorded_at": "2026-05-19T06:15:00Z",
        },
        {
            "id": "body-1",
            "provider": "fitbit",
            "source_record_id": "fitbit-weight-1",
            "weight": 78.6,
            "body_fat_percentage": 18.8,
            "unit": "kg",
            "recorded_at": "2026-05-18T06:15:00Z",
        },
    ],
}


def test_integrations_endpoint_requires_authentication(client: TestClient) -> None:
    response = client.get("/integrations")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required. Please sign in again."


def test_integrations_and_health_data_endpoints_return_service_payloads(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import routes.integrations as integrations_routes

    monkeypatch.setattr(integrations_routes, "extract_bearer_token", lambda _authorization: "token")

    async def fake_authenticate_user(_access_token: str) -> dict[str, str]:
        return {"id": "user-1"}

    async def fake_list_integrations(_access_token: str, *, user_id: str | None) -> dict:
        assert user_id == "user-1"
        return INTEGRATIONS_LIST_PAYLOAD

    async def fake_begin_integration_connect(
        _access_token: str,
        *,
        user_id: str | None,
        provider: str,
        redirect_to: str | None,
    ) -> dict:
        assert user_id == "user-1"
        assert provider == "fitbit"
        assert redirect_to == "/integrations"
        return INTEGRATION_CONNECT_PAYLOAD

    async def fake_complete_integration_callback(
        _access_token: str,
        *,
        user_id: str | None,
        provider: str,
        code: str | None,
        state: str | None,
        error: str | None,
        error_description: str | None,
    ) -> dict:
        assert user_id == "user-1"
        assert provider == "fitbit"
        assert code == "oauth-code"
        assert state == "oauth-state"
        assert error is None
        assert error_description is None
        return INTEGRATION_CALLBACK_PAYLOAD

    async def fake_sync_integration(
        _access_token: str,
        *,
        user_id: str | None,
        provider: str,
        days: int | None,
    ) -> dict:
        assert user_id == "user-1"
        assert provider == "fitbit"
        assert days == 14
        return INTEGRATION_SYNC_PAYLOAD

    async def fake_disconnect_integration(
        _access_token: str,
        *,
        user_id: str | None,
        provider: str,
    ) -> dict:
        assert user_id == "user-1"
        assert provider == "fitbit"
        return INTEGRATION_DISCONNECT_PAYLOAD

    async def fake_fetch_health_data_summary(
        _access_token: str,
        *,
        user_id: str | None,
        requested_date: str | None,
        timezone_name: str | None,
    ) -> dict:
        assert user_id == "user-1"
        assert requested_date == "2026-05-19"
        assert timezone_name == "UTC"
        return HEALTH_SUMMARY_PAYLOAD

    async def fake_fetch_health_data_activity(
        _access_token: str,
        *,
        user_id: str | None,
        days: int,
        timezone_name: str | None,
    ) -> dict:
        assert user_id == "user-1"
        assert days == 14
        assert timezone_name == "UTC"
        return HEALTH_ACTIVITY_PAYLOAD

    async def fake_fetch_health_data_body(
        _access_token: str,
        *,
        user_id: str | None,
        days: int,
        timezone_name: str | None,
    ) -> dict:
        assert user_id == "user-1"
        assert days == 30
        assert timezone_name == "UTC"
        return HEALTH_BODY_PAYLOAD

    monkeypatch.setattr(integrations_routes, "authenticate_user", fake_authenticate_user)
    monkeypatch.setattr(integrations_routes, "list_integrations", fake_list_integrations)
    monkeypatch.setattr(integrations_routes, "begin_integration_connect", fake_begin_integration_connect)
    monkeypatch.setattr(integrations_routes, "complete_integration_callback", fake_complete_integration_callback)
    monkeypatch.setattr(integrations_routes, "sync_integration", fake_sync_integration)
    monkeypatch.setattr(integrations_routes, "disconnect_integration", fake_disconnect_integration)
    monkeypatch.setattr(integrations_routes, "fetch_health_data_summary", fake_fetch_health_data_summary)
    monkeypatch.setattr(integrations_routes, "fetch_health_data_activity", fake_fetch_health_data_activity)
    monkeypatch.setattr(integrations_routes, "fetch_health_data_body", fake_fetch_health_data_body)

    integrations_response = client.get("/integrations", headers={"Authorization": "Bearer token"})
    connect_response = client.post(
        "/integrations/fitbit/connect",
        headers={"Authorization": "Bearer token"},
        json={"redirect_to": "/integrations"},
    )
    callback_response = client.get(
        "/integrations/fitbit/callback?code=oauth-code&state=oauth-state",
        headers={"Authorization": "Bearer token"},
    )
    sync_response = client.post(
        "/integrations/fitbit/sync",
        headers={"Authorization": "Bearer token"},
        json={"days": 14},
    )
    disconnect_response = client.post(
        "/integrations/fitbit/disconnect",
        headers={"Authorization": "Bearer token"},
    )
    summary_response = client.get(
        "/health-data/summary?date=2026-05-19&timezone=UTC",
        headers={"Authorization": "Bearer token"},
    )
    activity_response = client.get(
        "/health-data/activity?days=14&timezone=UTC",
        headers={"Authorization": "Bearer token"},
    )
    body_response = client.get(
        "/health-data/body?days=30&timezone=UTC",
        headers={"Authorization": "Bearer token"},
    )

    assert integrations_response.status_code == 200
    assert connect_response.status_code == 200
    assert callback_response.status_code == 200
    assert sync_response.status_code == 200
    assert disconnect_response.status_code == 200
    assert summary_response.status_code == 200
    assert activity_response.status_code == 200
    assert body_response.status_code == 200

    assert integrations_response.json()["integrations"][0]["provider"] == "fitbit"
    assert connect_response.json()["status"] == "connecting"
    assert callback_response.json()["synced_counts"]["activity_records"] == 7
    assert sync_response.json()["synced_counts"]["body_records"] == 4
    assert disconnect_response.json()["status"] == "disconnected"
    assert summary_response.json()["steps_today"] == 8200
    assert activity_response.json()["entries"][0]["date"] == "2026-05-18"
    assert body_response.json()["latest"]["id"] == "body-2"
