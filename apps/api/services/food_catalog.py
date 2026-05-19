from __future__ import annotations

import asyncio
import os
import re
import time as time_module
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from services.supabase_meals import (
    _build_user_headers,
    _coerce_non_negative_number,
    _extract_supabase_error,
    _normalize_user_id,
    _round_number,
    _supabase_base_url,
    _supabase_get,
)

USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
OPENFOODFACTS_BASE_URL = os.getenv("OPENFOODFACTS_BASE_URL", "https://world.openfoodfacts.org").rstrip(
    "/"
)
OPENFOODFACTS_USER_AGENT = os.getenv(
    "OPENFOODFACTS_USER_AGENT",
    "Nuvita/0.1 (+https://nuvita.local)",
)
DEFAULT_TIMEOUT_SECONDS = 12.0
FOOD_CACHE_TTL_SECONDS = 180
GRAM_RE = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*g", re.IGNORECASE)


@dataclass(slots=True)
class FoodCatalogError(Exception):
    status_code: int
    message: str


@dataclass(slots=True)
class _CacheEntry:
    expires_at: float
    value: dict[str, Any]


_FOOD_CACHE: dict[str, _CacheEntry] = {}


def _cache_get(cache_key: str) -> dict[str, Any] | None:
    entry = _FOOD_CACHE.get(cache_key)
    if not entry:
        return None
    if entry.expires_at <= time_module.time():
        _FOOD_CACHE.pop(cache_key, None)
        return None
    return dict(entry.value)


def _cache_set(cache_key: str, payload: dict[str, Any]) -> None:
    _FOOD_CACHE[cache_key] = _CacheEntry(
        expires_at=time_module.time() + FOOD_CACHE_TTL_SECONDS,
        value=dict(payload),
    )


def _safe_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return parsed


def _text(value: Any, fallback: str = "") -> str:
    if not isinstance(value, str):
        return fallback
    cleaned = value.strip()
    return cleaned if cleaned else fallback


def _parse_serving_size_grams(serving_size: str | None, serving_quantity: Any) -> float | None:
    quantity = _safe_float(serving_quantity)
    if quantity and quantity > 0:
        return _round_number(quantity)

    if serving_size:
        match = GRAM_RE.search(serving_size)
        if match:
            grams = _safe_float(match.group(1))
            if grams and grams > 0:
                return _round_number(grams)

    return None


def _format_serving_size(serving_size: str | None, serving_size_g: float | None) -> str:
    cleaned = _text(serving_size)
    if cleaned:
        return cleaned
    if serving_size_g and serving_size_g > 0:
        return f"{serving_size_g:g} g"
    return "1 serving"


def _extract_usda_nutrients(nutrients_payload: Any) -> dict[str, float]:
    nutrients = {
        "calories": 0.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 0.0,
    }

    if not isinstance(nutrients_payload, list):
        return nutrients

    for nutrient in nutrients_payload:
        if not isinstance(nutrient, dict):
            continue
        info = nutrient.get("nutrient") if isinstance(nutrient.get("nutrient"), dict) else {}
        nutrient_name = (
            _text(nutrient.get("nutrientName"))
            or _text(nutrient.get("name"))
            or _text(info.get("name"))
        ).lower()
        nutrient_number = str(
            nutrient.get("nutrientNumber")
            or nutrient.get("number")
            or info.get("number")
            or ""
        )

        value = nutrient.get("value")
        if value is None:
            value = nutrient.get("amount")
        parsed = _safe_float(value)
        if parsed is None:
            continue

        if nutrient_number in {"1008", "208"} or "energy" in nutrient_name:
            nutrients["calories"] = _round_number(parsed)
        elif nutrient_number == "203" or "protein" in nutrient_name:
            nutrients["protein_g"] = _round_number(parsed)
        elif nutrient_number == "205" or "carbohydrate" in nutrient_name:
            nutrients["carbs_g"] = _round_number(parsed)
        elif nutrient_number == "204" or "total lipid" in nutrient_name or nutrient_name == "fat":
            nutrients["fat_g"] = _round_number(parsed)

    return nutrients


def _source_key(food: dict[str, Any]) -> str:
    name = _text(food.get("name")).lower()
    brand = _text(food.get("brand")).lower()
    return f"{name}|{brand}"


async def _search_custom_foods(
    access_token: str,
    *,
    user_id: str,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    escaped = query.replace(",", " ")
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/custom_foods",
        params=[
            (
                "select",
                "id,name,brand,serving_size_g,calories,protein_g,carbs_g,fat_g",
            ),
            ("user_id", f"eq.{user_id}"),
            ("name", f"ilike.*{escaped}*"),
            ("order", "updated_at.desc"),
            ("limit", str(limit)),
        ],
    )

    if not isinstance(payload, list):
        return []

    foods: list[dict[str, Any]] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        name = _text(row.get("name"))
        if not name:
            continue
        serving_size_g = _safe_float(row.get("serving_size_g"))

        foods.append(
            {
                "id": f"custom:{_text(row.get('id'), name.lower())}",
                "name": name,
                "brand": _text(row.get("brand")) or None,
                "serving_size": _format_serving_size(None, serving_size_g),
                "serving_size_g": _round_number(serving_size_g) if serving_size_g else None,
                "calories": _round_number(_coerce_non_negative_number(row.get("calories"))),
                "protein_g": _round_number(_coerce_non_negative_number(row.get("protein_g"))),
                "carbs_g": _round_number(_coerce_non_negative_number(row.get("carbs_g"))),
                "fat_g": _round_number(_coerce_non_negative_number(row.get("fat_g"))),
                "image_url": None,
                "barcode": None,
                "source": "custom",
            }
        )

    return foods


async def _search_cached_barcode_foods(
    access_token: str,
    *,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    escaped = query.replace(",", " ")
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/barcode_foods",
        params=[
            (
                "select",
                "id,barcode,name,brand,serving_size_g,calories,protein_g,carbs_g,fat_g",
            ),
            ("name", f"ilike.*{escaped}*"),
            ("order", "updated_at.desc"),
            ("limit", str(limit)),
        ],
    )

    if not isinstance(payload, list):
        return []

    foods: list[dict[str, Any]] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        name = _text(row.get("name"))
        if not name:
            continue
        serving_size_g = _safe_float(row.get("serving_size_g"))
        foods.append(
            {
                "id": f"barcode-cache:{_text(row.get('barcode'), _text(row.get('id')))}",
                "name": name,
                "brand": _text(row.get("brand")) or None,
                "serving_size": _format_serving_size(None, serving_size_g),
                "serving_size_g": _round_number(serving_size_g) if serving_size_g else None,
                "calories": _round_number(_coerce_non_negative_number(row.get("calories"))),
                "protein_g": _round_number(_coerce_non_negative_number(row.get("protein_g"))),
                "carbs_g": _round_number(_coerce_non_negative_number(row.get("carbs_g"))),
                "fat_g": _round_number(_coerce_non_negative_number(row.get("fat_g"))),
                "image_url": None,
                "barcode": _text(row.get("barcode")) or None,
                "source": "openfoodfacts",
            }
        )

    return foods


async def _search_usda_foods(*, query: str, page: int, limit: int) -> list[dict[str, Any]]:
    api_key = os.getenv("USDA_API_KEY")
    if not api_key:
        raise FoodCatalogError(
            status_code=503,
            message="USDA API key is missing. Configure USDA_API_KEY to use food search.",
        )

    payload = {
        "query": query,
        "pageSize": limit,
        "pageNumber": page,
    }

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.post(
                USDA_SEARCH_URL,
                params={"api_key": api_key},
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPError as exc:
        raise FoodCatalogError(
            status_code=502,
            message="USDA food search is temporarily unavailable. Please try again shortly.",
        ) from exc
    except ValueError as exc:
        raise FoodCatalogError(
            status_code=502,
            message="USDA food search returned an invalid payload.",
        ) from exc

    rows = body.get("foods") if isinstance(body, dict) else None
    if not isinstance(rows, list):
        return []

    foods: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = _text(row.get("description"))
        if not name:
            continue

        nutrients = _extract_usda_nutrients(row.get("foodNutrients"))
        serving_size_value = _safe_float(row.get("servingSize"))
        serving_size_unit = _text(row.get("servingSizeUnit")).lower()
        serving_size_g = serving_size_value if serving_size_unit in {"g", "gram", "grams"} else None
        fdc_id = row.get("fdcId")
        fdc_text = str(fdc_id).strip() if fdc_id is not None else name.lower()

        if serving_size_value and serving_size_unit:
            serving_size = f"{_round_number(serving_size_value):g} {serving_size_unit}"
        elif serving_size_value:
            serving_size = f"{_round_number(serving_size_value):g} g"
            serving_size_g = serving_size_value
        else:
            serving_size = "100 g"
            serving_size_g = 100.0

        foods.append(
            {
                "id": f"usda:{fdc_text}",
                "name": name,
                "brand": _text(row.get("brandOwner")) or None,
                "serving_size": serving_size,
                "serving_size_g": _round_number(serving_size_g) if serving_size_g else None,
                "calories": _round_number(nutrients["calories"]),
                "protein_g": _round_number(nutrients["protein_g"]),
                "carbs_g": _round_number(nutrients["carbs_g"]),
                "fat_g": _round_number(nutrients["fat_g"]),
                "image_url": None,
                "barcode": None,
                "source": "usda",
            }
        )

    return foods


def _merge_food_search_results(results: list[list[dict[str, Any]]], limit: int) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for group in results:
        for food in group:
            key = _source_key(food)
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(food)
            if len(merged) >= limit:
                return merged
    return merged


async def search_foods(
    access_token: str,
    *,
    user_id: str,
    query: str,
    page: int,
    limit: int,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    normalized_query = query.strip()
    if len(normalized_query) < 2:
        raise FoodCatalogError(status_code=422, message="Search query must contain at least 2 characters.")

    custom_task = _search_custom_foods(
        access_token,
        user_id=owner_id,
        query=normalized_query,
        limit=min(limit, 12),
    )
    barcode_task = _search_cached_barcode_foods(
        access_token,
        query=normalized_query,
        limit=min(limit, 10),
    )
    usda_task = _search_usda_foods(query=normalized_query, page=page, limit=limit)

    custom_result, barcode_result, usda_result = await asyncio.gather(
        custom_task,
        barcode_task,
        usda_task,
    )
    merged = _merge_food_search_results([custom_result, barcode_result, usda_result], limit=limit)
    has_more = len(usda_result) >= limit

    return {
        "success": True,
        "query": normalized_query,
        "foods": merged,
        "pagination": {
            "page": page,
            "limit": limit,
            "has_more": has_more,
        },
    }


async def _lookup_cached_barcode_food(access_token: str, barcode: str) -> dict[str, Any] | None:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/barcode_foods",
        params=[
            (
                "select",
                "id,barcode,name,brand,serving_size_g,calories,protein_g,carbs_g,fat_g",
            ),
            ("barcode", f"eq.{barcode}"),
            ("limit", "1"),
        ],
    )
    if not isinstance(payload, list) or not payload:
        return None
    row = payload[0]
    if not isinstance(row, dict):
        return None

    name = _text(row.get("name"))
    if not name:
        return None
    serving_size_g = _safe_float(row.get("serving_size_g"))

    return {
        "id": f"barcode-cache:{barcode}",
        "name": name,
        "brand": _text(row.get("brand")) or None,
        "serving_size": _format_serving_size(None, serving_size_g),
        "serving_size_g": _round_number(serving_size_g) if serving_size_g else None,
        "calories": _round_number(_coerce_non_negative_number(row.get("calories"))),
        "protein_g": _round_number(_coerce_non_negative_number(row.get("protein_g"))),
        "carbs_g": _round_number(_coerce_non_negative_number(row.get("carbs_g"))),
        "fat_g": _round_number(_coerce_non_negative_number(row.get("fat_g"))),
        "image_url": None,
        "barcode": barcode,
        "source": "openfoodfacts",
    }


def _extract_openfoodfacts_macros(product: dict[str, Any]) -> dict[str, Any]:
    nutriments = product.get("nutriments")
    if not isinstance(nutriments, dict):
        nutriments = {}

    serving_size = _text(product.get("serving_size"))
    serving_size_g = _parse_serving_size_grams(serving_size, product.get("serving_quantity"))
    serving_label = _format_serving_size(serving_size, serving_size_g)

    calories_serving = _safe_float(nutriments.get("energy-kcal_serving"))
    protein_serving = _safe_float(nutriments.get("proteins_serving"))
    carbs_serving = _safe_float(nutriments.get("carbohydrates_serving"))
    fat_serving = _safe_float(nutriments.get("fat_serving"))

    calories_100g = _safe_float(nutriments.get("energy-kcal_100g"))
    protein_100g = _safe_float(nutriments.get("proteins_100g"))
    carbs_100g = _safe_float(nutriments.get("carbohydrates_100g"))
    fat_100g = _safe_float(nutriments.get("fat_100g"))

    multiplier = serving_size_g / 100 if serving_size_g and serving_size_g > 0 else 1

    calories = calories_serving if calories_serving is not None else (calories_100g or 0) * multiplier
    protein_g = protein_serving if protein_serving is not None else (protein_100g or 0) * multiplier
    carbs_g = carbs_serving if carbs_serving is not None else (carbs_100g or 0) * multiplier
    fat_g = fat_serving if fat_serving is not None else (fat_100g or 0) * multiplier

    return {
        "serving_size": serving_label,
        "serving_size_g": _round_number(serving_size_g) if serving_size_g else None,
        "calories": _round_number(calories),
        "protein_g": _round_number(protein_g),
        "carbs_g": _round_number(carbs_g),
        "fat_g": _round_number(fat_g),
    }


async def lookup_food_by_barcode(access_token: str, barcode: str) -> dict[str, Any]:
    if not re.fullmatch(r"\d{8,14}", barcode):
        raise FoodCatalogError(status_code=422, message="Barcode must contain 8-14 digits.")

    cache_key = f"barcode:{barcode}"
    cached = _cache_get(cache_key)
    if cached:
        return {"success": True, "barcode": barcode, "food": cached}

    cached_db_food = await _lookup_cached_barcode_food(access_token, barcode)
    if cached_db_food:
        _cache_set(cache_key, cached_db_food)
        return {"success": True, "barcode": barcode, "food": cached_db_food}

    endpoint = f"{OPENFOODFACTS_BASE_URL}/api/v2/product/{barcode}.json"
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.get(
                endpoint,
                params={
                    "fields": (
                        "code,product_name,brands,serving_size,serving_quantity,"
                        "nutriments,image_front_small_url,image_front_url"
                    )
                },
                headers={"User-Agent": OPENFOODFACTS_USER_AGENT},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise FoodCatalogError(status_code=404, message="Barcode was not found in the nutrition catalog.") from exc
        raise FoodCatalogError(
            status_code=502,
            message="Barcode lookup service is temporarily unavailable.",
        ) from exc
    except httpx.HTTPError as exc:
        raise FoodCatalogError(
            status_code=502,
            message="Barcode lookup service is temporarily unavailable.",
        ) from exc
    except ValueError as exc:
        raise FoodCatalogError(
            status_code=502,
            message="Barcode lookup returned invalid data.",
        ) from exc

    if not isinstance(payload, dict) or payload.get("status") != 1:
        raise FoodCatalogError(status_code=404, message="Barcode not found. Try manual search instead.")

    product = payload.get("product")
    if not isinstance(product, dict):
        raise FoodCatalogError(status_code=404, message="Barcode not found. Try manual search instead.")

    name = _text(product.get("product_name"))
    if not name:
        raise FoodCatalogError(status_code=404, message="Product found but missing display name.")

    macros = _extract_openfoodfacts_macros(product)
    if (
        macros["calories"] <= 0
        and macros["protein_g"] <= 0
        and macros["carbs_g"] <= 0
        and macros["fat_g"] <= 0
    ):
        raise FoodCatalogError(
            status_code=404,
            message="Barcode found, but nutrition data is not available for this product.",
        )

    food = {
        "id": f"openfoodfacts:{barcode}",
        "name": name,
        "brand": _text(product.get("brands")) or None,
        "serving_size": macros["serving_size"],
        "serving_size_g": macros["serving_size_g"],
        "calories": macros["calories"],
        "protein_g": macros["protein_g"],
        "carbs_g": macros["carbs_g"],
        "fat_g": macros["fat_g"],
        "image_url": _text(product.get("image_front_small_url"))
        or _text(product.get("image_front_url"))
        or None,
        "barcode": barcode,
        "source": "openfoodfacts",
    }

    _cache_set(cache_key, food)
    return {"success": True, "barcode": barcode, "food": food}


async def fetch_recent_foods(access_token: str, *, user_id: str, limit: int) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    query_limit = max(40, min(240, limit * 8))
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/meal_items",
        params=[
            (
                "select",
                "id,name,portion_description,estimated_weight_g,calories,protein_g,carbs_g,fat_g,created_at",
            ),
            ("user_id", f"eq.{owner_id}"),
            ("order", "created_at.desc"),
            ("limit", str(query_limit)),
        ],
    )
    if not isinstance(payload, list):
        raise FoodCatalogError(status_code=502, message="Recent foods data is unavailable right now.")

    seen: set[str] = set()
    foods: list[dict[str, Any]] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        name = _text(row.get("name"))
        if not name:
            continue
        dedupe_key = name.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        serving_size_g = _safe_float(row.get("estimated_weight_g"))
        foods.append(
            {
                "id": f"recent:{_text(row.get('id'), name)}",
                "name": name,
                "brand": None,
                "serving_size": _format_serving_size(_text(row.get("portion_description")), serving_size_g),
                "serving_size_g": _round_number(serving_size_g) if serving_size_g else None,
                "calories": _round_number(_coerce_non_negative_number(row.get("calories"))),
                "protein_g": _round_number(_coerce_non_negative_number(row.get("protein_g"))),
                "carbs_g": _round_number(_coerce_non_negative_number(row.get("carbs_g"))),
                "fat_g": _round_number(_coerce_non_negative_number(row.get("fat_g"))),
                "image_url": None,
                "barcode": None,
                "source": "recent",
            }
        )
        if len(foods) >= limit:
            break

    return {"success": True, "foods": foods}


def _food_from_snapshot(snapshot: dict[str, Any], *, fallback_name: str, favorite_id: str) -> dict[str, Any]:
    food_payload = snapshot.get("food")
    source_payload: dict[str, Any] | None = food_payload if isinstance(food_payload, dict) else None

    if source_payload is None:
        source_payload = snapshot

    name = _text(source_payload.get("name"), fallback_name)
    serving_size_g = _safe_float(source_payload.get("serving_size_g"))
    serving_size = _format_serving_size(_text(source_payload.get("serving_size")), serving_size_g)

    return {
        "id": f"favorite:{favorite_id}",
        "name": name,
        "brand": _text(source_payload.get("brand")) or None,
        "serving_size": serving_size,
        "serving_size_g": _round_number(serving_size_g) if serving_size_g else None,
        "calories": _round_number(_coerce_non_negative_number(source_payload.get("calories"))),
        "protein_g": _round_number(_coerce_non_negative_number(source_payload.get("protein_g"))),
        "carbs_g": _round_number(_coerce_non_negative_number(source_payload.get("carbs_g"))),
        "fat_g": _round_number(_coerce_non_negative_number(source_payload.get("fat_g"))),
        "image_url": _text(source_payload.get("image_url")) or None,
        "barcode": _text(source_payload.get("barcode")) or None,
        "source": "favorite",
    }


async def fetch_favorite_foods(access_token: str, *, user_id: str, limit: int) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/favorite_meals",
        params=[
            ("select", "id,name,meal_snapshot,updated_at"),
            ("user_id", f"eq.{owner_id}"),
            ("order", "updated_at.desc"),
            ("limit", str(limit)),
        ],
    )
    if not isinstance(payload, list):
        raise FoodCatalogError(status_code=502, message="Favorite foods are unavailable right now.")

    foods: list[dict[str, Any]] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        favorite_id = _text(row.get("id"))
        if not favorite_id:
            continue
        snapshot = row.get("meal_snapshot")
        if not isinstance(snapshot, dict):
            continue
        foods.append(
            _food_from_snapshot(
                snapshot,
                fallback_name=_text(row.get("name"), "Favorite food"),
                favorite_id=favorite_id,
            )
        )

    return {"success": True, "foods": foods}


async def _supabase_write(
    access_token: str,
    *,
    method: str,
    path: str,
    payload: dict[str, Any],
    params: list[tuple[str, str]] | None = None,
) -> Any:
    normalized_path = path if path.startswith("/") else f"/{path}"
    url = f"{_supabase_base_url()}{normalized_path}"
    headers = {
        **_build_user_headers(access_token),
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                json=payload,
                params=params,
            )
    except httpx.HTTPError as exc:
        raise FoodCatalogError(status_code=502, message="Favorite food request failed.") from exc

    try:
        parsed = response.json()
    except ValueError:
        parsed = None

    if response.status_code >= 400:
        detail = _extract_supabase_error(parsed) or "Supabase rejected favorite food request."
        if response.status_code in {401, 403}:
            raise FoodCatalogError(status_code=401, message=detail)
        if response.status_code in {400, 409, 422}:
            raise FoodCatalogError(status_code=422, message=detail)
        raise FoodCatalogError(status_code=502, message=detail)

    return parsed


async def save_favorite_food(
    access_token: str,
    *,
    user_id: str,
    food: dict[str, Any],
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    name = _text(food.get("name"))
    if not name:
        raise FoodCatalogError(status_code=422, message="Favorite food name is required.")

    normalized_food = {
        "id": _text(food.get("id")) or f"favorite:{name.lower().replace(' ', '-')}",
        "name": name,
        "brand": _text(food.get("brand")) or None,
        "serving_size": _format_serving_size(
            _text(food.get("serving_size")),
            _safe_float(food.get("serving_size_g")),
        ),
        "serving_size_g": (
            _round_number(_safe_float(food.get("serving_size_g")))
            if _safe_float(food.get("serving_size_g")) is not None
            else None
        ),
        "calories": _round_number(_coerce_non_negative_number(food.get("calories"))),
        "protein_g": _round_number(_coerce_non_negative_number(food.get("protein_g"))),
        "carbs_g": _round_number(_coerce_non_negative_number(food.get("carbs_g"))),
        "fat_g": _round_number(_coerce_non_negative_number(food.get("fat_g"))),
        "image_url": _text(food.get("image_url")) or None,
        "barcode": _text(food.get("barcode")) or None,
        "source": "favorite",
    }

    existing = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/favorite_meals",
        params=[
            ("select", "id"),
            ("user_id", f"eq.{owner_id}"),
            ("name", f"eq.{name}"),
            ("limit", "1"),
        ],
    )

    snapshot = {
        "food": normalized_food,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }

    favorite_id = ""
    if isinstance(existing, list) and existing and isinstance(existing[0], dict):
        existing_id = _text(existing[0].get("id"))
        if existing_id:
            favorite_id = existing_id
            updated = await _supabase_write(
                access_token,
                method="PATCH",
                path="/rest/v1/favorite_meals",
                params=[
                    ("id", f"eq.{existing_id}"),
                    ("user_id", f"eq.{owner_id}"),
                ],
                payload={
                    "name": name,
                    "meal_snapshot": snapshot,
                },
            )
            if isinstance(updated, list) and updated and isinstance(updated[0], dict):
                favorite_id = _text(updated[0].get("id"), favorite_id)

    if not favorite_id:
        created = await _supabase_write(
            access_token,
            method="POST",
            path="/rest/v1/favorite_meals",
            payload={
                "user_id": owner_id,
                "name": name,
                "meal_snapshot": snapshot,
            },
        )
        if isinstance(created, list) and created and isinstance(created[0], dict):
            favorite_id = _text(created[0].get("id"))

    if not favorite_id:
        raise FoodCatalogError(status_code=502, message="Unable to save favorite food.")

    return {
        "success": True,
        "favorite_id": favorite_id,
        "food": {
            **normalized_food,
            "id": f"favorite:{favorite_id}",
        },
    }
