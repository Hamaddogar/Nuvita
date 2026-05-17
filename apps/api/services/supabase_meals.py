from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date as DateType, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from schemas.meals import MealCreateRequest

DEFAULT_TIMEOUT_SECONDS = 20.0


@dataclass(slots=True)
class SupabaseServiceError(Exception):
    status_code: int
    message: str


def _round_number(value: float) -> float:
    return round(float(value), 2)


def _coerce_non_negative_number(value: Any) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0
    return parsed if parsed >= 0 else 0.0


def _coerce_nullable_non_negative_number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return parsed


def _percentage(consumed: float, goal: float) -> int:
    if goal <= 0:
        return 0
    return int(round(max(0.0, (consumed / goal) * 100)))


def _get_required_env(*keys: str) -> str:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    joined = ", ".join(keys)
    raise SupabaseServiceError(
        status_code=500,
        message=f"Missing Supabase environment configuration: expected one of [{joined}].",
    )


def _supabase_base_url() -> str:
    return _get_required_env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").rstrip("/")


def _supabase_anon_key() -> str:
    return _get_required_env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")


def _extract_supabase_error(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None

    message = payload.get("message")
    details = payload.get("details")
    hint = payload.get("hint")
    detail = payload.get("detail")

    candidates = [message, detail, details, hint]
    cleaned = [str(candidate).strip() for candidate in candidates if isinstance(candidate, str) and candidate.strip()]
    if not cleaned:
        return None
    return " | ".join(cleaned)


def _is_missing_meal_rpc_error(detail: str) -> bool:
    normalized = detail.lower()
    return (
        "could not find the function public.create_meal_with_items" in normalized
        or "schema cache" in normalized and "create_meal_with_items" in normalized
    )


def extract_bearer_token(authorization_header: str | None) -> str:
    if not authorization_header:
        raise SupabaseServiceError(status_code=401, message="Missing Authorization header.")

    prefix = "bearer "
    if not authorization_header.lower().startswith(prefix):
        raise SupabaseServiceError(status_code=401, message="Authorization header must use Bearer token.")

    token = authorization_header[len(prefix) :].strip()
    if not token:
        raise SupabaseServiceError(status_code=401, message="Bearer token is empty.")
    return token


def _build_user_headers(access_token: str) -> dict[str, str]:
    anon_key = _supabase_anon_key()
    return {
        "apikey": anon_key,
        "Authorization": f"Bearer {access_token}",
    }


def _parse_json_response(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return None


async def _supabase_get(
    *,
    access_token: str,
    path: str,
    params: list[tuple[str, str]] | None = None,
) -> Any:
    normalized_path = path if path.startswith("/") else f"/{path}"
    url = f"{_supabase_base_url()}{normalized_path}"
    headers = _build_user_headers(access_token)

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.get(url, headers=headers, params=params)
    except httpx.HTTPError as exc:
        raise SupabaseServiceError(status_code=502, message=f"Supabase request failed: {exc}") from exc

    payload = _parse_json_response(response)
    if response.status_code >= 400:
        detail = _extract_supabase_error(payload) or "Supabase rejected dashboard request."
        status_code = 401 if response.status_code in {401, 403} else 502
        raise SupabaseServiceError(status_code=status_code, message=detail)

    return payload


def _resolve_timezone(timezone_name: str | None) -> ZoneInfo | timezone:
    cleaned = (timezone_name or "").strip()
    if not cleaned:
        return timezone.utc
    if cleaned.upper() == "UTC":
        return timezone.utc

    try:
        return ZoneInfo(cleaned)
    except ZoneInfoNotFoundError:
        return timezone.utc


def _resolve_target_date(date_value: str | None, target_timezone: ZoneInfo | timezone) -> DateType:
    cleaned = (date_value or "").strip()
    if not cleaned:
        return datetime.now(target_timezone).date()

    try:
        return DateType.fromisoformat(cleaned)
    except ValueError as exc:
        raise SupabaseServiceError(status_code=422, message="date must be in YYYY-MM-DD format.") from exc


def _format_utc(dt_value: datetime) -> str:
    return dt_value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _build_day_window(date_value: str | None, timezone_name: str | None) -> tuple[DateType, str, str]:
    target_timezone = _resolve_timezone(timezone_name)
    target_date = _resolve_target_date(date_value, target_timezone)

    start_of_day_local = datetime.combine(target_date, time.min, tzinfo=target_timezone)
    end_of_day_local = start_of_day_local + timedelta(days=1)

    start_utc = _format_utc(start_of_day_local)
    end_utc = _format_utc(end_of_day_local)
    return target_date, start_utc, end_utc


def _default_goals() -> dict[str, float]:
    return {
        "calories": 0.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 0.0,
    }


def _normalize_user_id(user_id: str | None) -> str:
    normalized = (user_id or "").strip()
    if not normalized:
        raise SupabaseServiceError(status_code=401, message="Unable to resolve authenticated user.")
    return normalized


async def _fetch_latest_goals(access_token: str, user_id: str) -> dict[str, float]:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/user_goals",
        params=[
            ("select", "daily_calorie_target,protein_target_g,carbs_target_g,fat_target_g"),
            ("user_id", f"eq.{user_id}"),
            ("order", "created_at.desc"),
            ("limit", "1"),
        ],
    )

    if not isinstance(payload, list):
        raise SupabaseServiceError(
            status_code=502,
            message="Supabase returned an invalid goals payload.",
        )

    if not payload:
        return _default_goals()

    latest = payload[0]
    if not isinstance(latest, dict):
        return _default_goals()

    return {
        "calories": _round_number(_coerce_non_negative_number(latest.get("daily_calorie_target"))),
        "protein_g": _round_number(_coerce_non_negative_number(latest.get("protein_target_g"))),
        "carbs_g": _round_number(_coerce_non_negative_number(latest.get("carbs_target_g"))),
        "fat_g": _round_number(_coerce_non_negative_number(latest.get("fat_target_g"))),
    }


async def _fetch_meals_for_window(
    access_token: str,
    user_id: str,
    start_utc: str,
    end_utc: str,
) -> list[dict[str, Any]]:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/meals",
        params=[
            (
                "select",
                "id,meal_name,meal_type,eaten_at,total_calories,total_protein_g,total_carbs_g,total_fat_g,image_url",
            ),
            ("user_id", f"eq.{user_id}"),
            ("order", "eaten_at.desc"),
            ("eaten_at", f"gte.{start_utc}"),
            ("eaten_at", f"lt.{end_utc}"),
            ("limit", "200"),
        ],
    )

    if not isinstance(payload, list):
        raise SupabaseServiceError(
            status_code=502,
            message="Supabase returned an invalid meals payload.",
        )

    meal_rows: list[dict[str, Any]] = []
    for row in payload:
        if isinstance(row, dict):
            meal_rows.append(row)
    return meal_rows


async def _fetch_item_counts(access_token: str, user_id: str, meal_ids: list[str]) -> dict[str, int]:
    if not meal_ids:
        return {}

    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/meal_items",
        params=[
            ("select", "meal_id"),
            ("user_id", f"eq.{user_id}"),
            ("meal_id", f"in.({','.join(meal_ids)})"),
            ("limit", "2000"),
        ],
    )

    if not isinstance(payload, list):
        raise SupabaseServiceError(
            status_code=502,
            message="Supabase returned an invalid meal item payload.",
        )

    counts: dict[str, int] = {}
    for row in payload:
        if not isinstance(row, dict):
            continue
        meal_id = row.get("meal_id")
        if not isinstance(meal_id, str) or not meal_id.strip():
            continue
        counts[meal_id] = counts.get(meal_id, 0) + 1
    return counts


def _normalize_meals(rows: list[dict[str, Any]], item_counts: dict[str, int]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        meal_id = str(row.get("id") or "").strip()
        if not meal_id:
            continue

        meal_name = str(row.get("meal_name") or "").strip() or "Meal"
        meal_type = str(row.get("meal_type") or "").strip() or "unknown"
        eaten_at = row.get("eaten_at")
        eaten_at_value = eaten_at if isinstance(eaten_at, str) and eaten_at.strip() else datetime.now(timezone.utc)

        normalized.append(
            {
                "id": meal_id,
                "meal_name": meal_name,
                "meal_type": meal_type,
                "eaten_at": eaten_at_value,
                "total_calories": _round_number(_coerce_non_negative_number(row.get("total_calories"))),
                "total_protein_g": _round_number(_coerce_non_negative_number(row.get("total_protein_g"))),
                "total_carbs_g": _round_number(_coerce_non_negative_number(row.get("total_carbs_g"))),
                "total_fat_g": _round_number(_coerce_non_negative_number(row.get("total_fat_g"))),
                "item_count": max(0, int(item_counts.get(meal_id, 0))),
                "image_url": row.get("image_url") if isinstance(row.get("image_url"), str) else None,
            }
        )
    return normalized


async def fetch_daily_summary(
    access_token: str,
    *,
    requested_date: str | None,
    timezone_name: str | None,
    user_id: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    target_date, start_utc, end_utc = _build_day_window(requested_date, timezone_name)
    goals = await _fetch_latest_goals(access_token, owner_id)
    meals_raw = await _fetch_meals_for_window(access_token, owner_id, start_utc, end_utc)
    meal_ids = list(
        {
            row.get("id").strip()
            for row in meals_raw
            if isinstance(row.get("id"), str) and row.get("id").strip()
        }
    )
    item_counts = await _fetch_item_counts(access_token, owner_id, meal_ids)
    meals = _normalize_meals(meals_raw, item_counts)

    consumed = {
        "calories": _round_number(sum(meal["total_calories"] for meal in meals)),
        "protein_g": _round_number(sum(meal["total_protein_g"] for meal in meals)),
        "carbs_g": _round_number(sum(meal["total_carbs_g"] for meal in meals)),
        "fat_g": _round_number(sum(meal["total_fat_g"] for meal in meals)),
    }
    remaining = {
        "calories": _round_number(goals["calories"] - consumed["calories"]),
        "protein_g": _round_number(goals["protein_g"] - consumed["protein_g"]),
        "carbs_g": _round_number(goals["carbs_g"] - consumed["carbs_g"]),
        "fat_g": _round_number(goals["fat_g"] - consumed["fat_g"]),
    }
    progress = {
        "calories_percent": _percentage(consumed["calories"], goals["calories"]),
        "protein_percent": _percentage(consumed["protein_g"], goals["protein_g"]),
        "carbs_percent": _percentage(consumed["carbs_g"], goals["carbs_g"]),
        "fat_percent": _percentage(consumed["fat_g"], goals["fat_g"]),
    }

    return {
        "success": True,
        "date": target_date.isoformat(),
        "goals": goals,
        "consumed": consumed,
        "remaining": remaining,
        "progress": progress,
        "meals": meals,
    }


async def _fetch_meal_record(access_token: str, user_id: str, meal_id: str) -> dict[str, Any]:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/meals",
        params=[
            (
                "select",
                "id,meal_name,meal_type,eaten_at,notes,image_url,total_calories,total_protein_g,total_carbs_g,total_fat_g",
            ),
            ("id", f"eq.{meal_id}"),
            ("user_id", f"eq.{user_id}"),
            ("limit", "1"),
        ],
    )

    if not isinstance(payload, list):
        raise SupabaseServiceError(
            status_code=502,
            message="Supabase returned an invalid meal detail payload.",
        )

    if not payload:
        raise SupabaseServiceError(status_code=404, message="Meal not found.")

    meal = payload[0]
    if not isinstance(meal, dict):
        raise SupabaseServiceError(
            status_code=502,
            message="Supabase returned an invalid meal detail payload.",
        )

    return meal


async def _fetch_meal_items(access_token: str, user_id: str, meal_id: str) -> list[dict[str, Any]]:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/meal_items",
        params=[
            (
                "select",
                "id,name,category,portion_description,estimated_weight_g,calories,protein_g,carbs_g,fat_g,confidence,nutrition_source,notes,created_at",
            ),
            ("user_id", f"eq.{user_id}"),
            ("meal_id", f"eq.{meal_id}"),
            ("order", "created_at.asc"),
            ("limit", "400"),
        ],
    )

    if not isinstance(payload, list):
        raise SupabaseServiceError(
            status_code=502,
            message="Supabase returned an invalid meal-item payload.",
        )

    items: list[dict[str, Any]] = []
    for row in payload:
        if not isinstance(row, dict):
            continue

        item_id = str(row.get("id") or "").strip()
        if not item_id:
            continue

        estimated_weight = _coerce_nullable_non_negative_number(row.get("estimated_weight_g"))
        items.append(
            {
                "id": item_id,
                "name": str(row.get("name") or "").strip() or "Item",
                "category": row.get("category") if isinstance(row.get("category"), str) else None,
                "portion_description": row.get("portion_description")
                if isinstance(row.get("portion_description"), str)
                else None,
                "estimated_weight_g": _round_number(estimated_weight) if estimated_weight is not None else None,
                "calories": _round_number(_coerce_non_negative_number(row.get("calories"))),
                "protein_g": _round_number(_coerce_non_negative_number(row.get("protein_g"))),
                "carbs_g": _round_number(_coerce_non_negative_number(row.get("carbs_g"))),
                "fat_g": _round_number(_coerce_non_negative_number(row.get("fat_g"))),
                "confidence": str(row.get("confidence") or "medium"),
                "nutrition_source": str(row.get("nutrition_source") or "ai_estimate"),
                "notes": row.get("notes") if isinstance(row.get("notes"), str) else None,
            }
        )

    return items


async def fetch_meal_history(
    access_token: str,
    *,
    requested_date: str | None,
    timezone_name: str | None,
    user_id: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    target_date, start_utc, end_utc = _build_day_window(requested_date, timezone_name)
    goals = await _fetch_latest_goals(access_token, owner_id)
    meals_raw = await _fetch_meals_for_window(access_token, owner_id, start_utc, end_utc)

    meal_ids = list(
        {
            row.get("id").strip()
            for row in meals_raw
            if isinstance(row.get("id"), str) and row.get("id").strip()
        }
    )
    item_counts = await _fetch_item_counts(access_token, owner_id, meal_ids)
    meals = _normalize_meals(meals_raw, item_counts)

    summary = {
        "total_calories": _round_number(sum(meal["total_calories"] for meal in meals)),
        "total_protein_g": _round_number(sum(meal["total_protein_g"] for meal in meals)),
        "total_carbs_g": _round_number(sum(meal["total_carbs_g"] for meal in meals)),
        "total_fat_g": _round_number(sum(meal["total_fat_g"] for meal in meals)),
        "meal_count": len(meals),
    }
    remaining = {
        "calories": _round_number(goals["calories"] - summary["total_calories"]),
        "protein_g": _round_number(goals["protein_g"] - summary["total_protein_g"]),
        "carbs_g": _round_number(goals["carbs_g"] - summary["total_carbs_g"]),
        "fat_g": _round_number(goals["fat_g"] - summary["total_fat_g"]),
    }
    progress = {
        "calories_percent": _percentage(summary["total_calories"], goals["calories"]),
        "protein_percent": _percentage(summary["total_protein_g"], goals["protein_g"]),
        "carbs_percent": _percentage(summary["total_carbs_g"], goals["carbs_g"]),
        "fat_percent": _percentage(summary["total_fat_g"], goals["fat_g"]),
    }

    return {
        "success": True,
        "date": target_date.isoformat(),
        "summary": summary,
        "goals": goals,
        "remaining": remaining,
        "progress": progress,
        "meals": meals,
    }


async def fetch_meal_detail(access_token: str, meal_id: str, *, user_id: str | None) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    normalized_meal_id = meal_id.strip()
    if not normalized_meal_id:
        raise SupabaseServiceError(status_code=422, message="meal_id is required.")
    meal = await _fetch_meal_record(access_token, owner_id, normalized_meal_id)
    items = await _fetch_meal_items(access_token, owner_id, normalized_meal_id)

    meal_payload = {
        "id": str(meal.get("id") or normalized_meal_id),
        "meal_name": str(meal.get("meal_name") or "").strip() or "Meal",
        "meal_type": str(meal.get("meal_type") or "").strip() or "unknown",
        "eaten_at": meal.get("eaten_at") if isinstance(meal.get("eaten_at"), str) else datetime.now(timezone.utc),
        "notes": meal.get("notes") if isinstance(meal.get("notes"), str) else None,
        "image_url": meal.get("image_url") if isinstance(meal.get("image_url"), str) else None,
        "total_calories": _round_number(_coerce_non_negative_number(meal.get("total_calories"))),
        "total_protein_g": _round_number(_coerce_non_negative_number(meal.get("total_protein_g"))),
        "total_carbs_g": _round_number(_coerce_non_negative_number(meal.get("total_carbs_g"))),
        "total_fat_g": _round_number(_coerce_non_negative_number(meal.get("total_fat_g"))),
    }

    return {
        "success": True,
        "meal": meal_payload,
        "items": items,
    }


async def authenticate_user(access_token: str) -> dict[str, Any]:
    url = f"{_supabase_base_url()}/auth/v1/user"
    headers = _build_user_headers(access_token)

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        raise SupabaseServiceError(status_code=502, message=f"Failed to verify auth session: {exc}") from exc

    raw_payload = _parse_json_response(response)

    if response.status_code >= 400:
        detail = _extract_supabase_error(raw_payload) or "Unauthorized user session."
        status_code = 401 if response.status_code in {401, 403} else 502
        raise SupabaseServiceError(status_code=status_code, message=detail)

    if not isinstance(raw_payload, dict) or not raw_payload.get("id"):
        raise SupabaseServiceError(status_code=401, message="Unable to resolve authenticated user.")

    return raw_payload


async def create_meal_via_rpc(access_token: str, payload: MealCreateRequest) -> dict[str, Any]:
    url = f"{_supabase_base_url()}/rest/v1/rpc/create_meal_with_items"
    headers = {
        **_build_user_headers(access_token),
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    meal_payload = payload.model_dump(mode="json")
    candidate_bodies: list[Any] = [
        {"payload": meal_payload},
        {"p_payload": meal_payload},
        meal_payload,
    ]

    last_error_detail = "Supabase rejected meal save request."
    missing_rpc_error_seen = False

    for body in candidate_bodies:
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
                response = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as exc:
            raise SupabaseServiceError(status_code=502, message=f"Failed to save meal: {exc}") from exc

        raw_payload = _parse_json_response(response)

        if response.status_code < 400:
            if not isinstance(raw_payload, dict):
                raise SupabaseServiceError(
                    status_code=502,
                    message="Supabase returned an invalid meal save response.",
                )
            return raw_payload

        detail = _extract_supabase_error(raw_payload) or "Supabase rejected meal save request."
        last_error_detail = detail

        if _is_missing_meal_rpc_error(detail):
            missing_rpc_error_seen = True
            continue

        if response.status_code in {400, 409, 422}:
            raise SupabaseServiceError(status_code=422, message=detail)
        if response.status_code in {401, 403}:
            raise SupabaseServiceError(status_code=401, message=detail)
        raise SupabaseServiceError(status_code=502, message=detail)

    if missing_rpc_error_seen:
        raise SupabaseServiceError(
            status_code=503,
            message=(
                "Meal save function is not deployed in Supabase yet. "
                "Run the Step 4 SQL migration that creates public.create_meal_with_items, "
                "then reload the PostgREST schema cache and retry."
            ),
        )

    raise SupabaseServiceError(status_code=502, message=last_error_detail)