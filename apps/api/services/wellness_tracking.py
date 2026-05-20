from __future__ import annotations

from dataclasses import dataclass
from datetime import date as DateType
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx

from services.supabase_meals import (
    _build_day_window,
    _build_user_headers,
    _coerce_non_negative_number,
    _extract_supabase_error,
    _normalize_user_id,
    _resolve_timezone,
    _round_number,
    _supabase_base_url,
    _supabase_get,
)

DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_WATER_GOAL_ML = 2500
MIN_WATER_GOAL_ML = 1200
MAX_WATER_GOAL_ML = 6000
MIN_WATER_ENTRY_ML = 50
MAX_WATER_ENTRY_ML = 3000
WATER_DUPLICATE_WINDOW_SECONDS = 45
MIN_WEIGHT_KG = 20.0
MAX_WEIGHT_KG = 400.0
WEIGHT_DUPLICATE_WINDOW_SECONDS = 300
KG_TO_LB = 2.2046226218

WeightUnit = Literal["kg", "lb"]


@dataclass(slots=True)
class WellnessTrackingError(Exception):
    status_code: int
    message: str


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _to_kg(weight: float, unit: WeightUnit) -> float:
    if unit == "lb":
        return weight / KG_TO_LB
    return weight


def _from_kg(weight_kg: float, unit: WeightUnit) -> float:
    if unit == "lb":
        return weight_kg * KG_TO_LB
    return weight_kg


def _normalize_weight_unit(unit: str | None) -> WeightUnit:
    normalized = (unit or "kg").strip().lower()
    return "lb" if normalized == "lb" else "kg"


def _validate_weight_kg(weight_kg: float) -> float:
    if weight_kg < MIN_WEIGHT_KG or weight_kg > MAX_WEIGHT_KG:
        raise WellnessTrackingError(
            status_code=422,
            message=f"weight must be between {MIN_WEIGHT_KG:g} and {MAX_WEIGHT_KG:g} kg.",
        )
    return _round_number(weight_kg)


def _validate_water_amount(amount_ml: int) -> int:
    if amount_ml < MIN_WATER_ENTRY_ML or amount_ml > MAX_WATER_ENTRY_ML:
        raise WellnessTrackingError(
            status_code=422,
            message=f"Water amount must be between {MIN_WATER_ENTRY_ML} and {MAX_WATER_ENTRY_ML} ml.",
        )
    return int(amount_ml)


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return parsed


def _supabase_url(path: str) -> str:
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{_supabase_base_url()}{normalized_path}"


async def _supabase_write(
    access_token: str,
    *,
    method: str,
    path: str,
    payload: dict[str, Any],
    params: list[tuple[str, str]] | None = None,
) -> Any:
    headers = {
        **_build_user_headers(access_token),
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.request(
                method=method,
                url=_supabase_url(path),
                headers=headers,
                json=payload,
                params=params,
            )
    except httpx.HTTPError as exc:
        raise WellnessTrackingError(status_code=502, message="Supabase write request failed.") from exc

    try:
        parsed = response.json()
    except ValueError:
        parsed = None

    if response.status_code >= 400:
        detail = _extract_supabase_error(parsed) or "Supabase rejected request."
        if response.status_code in {401, 403}:
            raise WellnessTrackingError(status_code=401, message=detail)
        if response.status_code in {400, 404, 409, 422}:
            raise WellnessTrackingError(status_code=422, message=detail)
        raise WellnessTrackingError(status_code=502, message=detail)

    return parsed


async def _supabase_delete(
    access_token: str,
    *,
    path: str,
    params: list[tuple[str, str]],
) -> Any:
    headers = {
        **_build_user_headers(access_token),
        "Prefer": "return=representation",
    }
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.delete(
                _supabase_url(path),
                headers=headers,
                params=params,
            )
    except httpx.HTTPError as exc:
        raise WellnessTrackingError(status_code=502, message="Supabase delete request failed.") from exc

    try:
        parsed = response.json()
    except ValueError:
        parsed = None

    if response.status_code >= 400:
        detail = _extract_supabase_error(parsed) or "Supabase rejected request."
        if response.status_code in {401, 403}:
            raise WellnessTrackingError(status_code=401, message=detail)
        if response.status_code in {404}:
            raise WellnessTrackingError(status_code=404, message=detail)
        raise WellnessTrackingError(status_code=502, message=detail)

    return parsed


async def _fetch_latest_user_goal(access_token: str, user_id: str) -> dict[str, Any] | None:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/user_goals",
        params=[
            ("select", "id,goal_type,water_target_ml,goal_weight_kg"),
            ("user_id", f"eq.{user_id}"),
            ("order", "created_at.desc"),
            ("limit", "1"),
        ],
    )
    if not isinstance(payload, list) or not payload:
        return None
    latest = payload[0]
    if not isinstance(latest, dict):
        return None
    return latest


async def _fetch_profile_weight(access_token: str, user_id: str) -> float | None:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/profiles",
        params=[
            ("select", "weight_kg"),
            ("id", f"eq.{user_id}"),
            ("limit", "1"),
        ],
    )
    if not isinstance(payload, list) or not payload or not isinstance(payload[0], dict):
        return None
    parsed = _coerce_non_negative_number(payload[0].get("weight_kg"))
    if parsed <= 0:
        return None
    return parsed


def _water_goal_from_weight(weight_kg: float | None) -> int:
    if weight_kg and weight_kg > 0:
        predicted = int(round((weight_kg * 35) / 250.0) * 250)
        return max(1800, min(4500, predicted))
    return DEFAULT_WATER_GOAL_ML


def _clamp_water_goal(value: int | None, *, fallback: int) -> int:
    if value is None:
        return fallback
    return max(MIN_WATER_GOAL_ML, min(MAX_WATER_GOAL_ML, int(value)))


async def _resolve_water_goal(access_token: str, user_id: str) -> int:
    latest_goal = await _fetch_latest_user_goal(access_token, user_id)
    profile_weight = await _fetch_profile_weight(access_token, user_id)
    fallback = _water_goal_from_weight(profile_weight)
    configured = None
    if latest_goal and latest_goal.get("water_target_ml") is not None:
        configured = _safe_int(latest_goal.get("water_target_ml"), fallback)
    return _clamp_water_goal(configured, fallback=fallback)


def _water_progress(total_ml: int, goal_ml: int) -> int:
    if goal_ml <= 0:
        return 0
    return int(round((total_ml / goal_ml) * 100))


def _normalize_water_log(row: dict[str, Any]) -> dict[str, Any] | None:
    log_id = str(row.get("id") or "").strip()
    logged_at = _parse_iso_datetime(row.get("logged_at"))
    created_at = _parse_iso_datetime(row.get("created_at"))
    amount_ml = _safe_int(row.get("amount_ml"), 0)
    if not log_id or not logged_at or not created_at or amount_ml <= 0:
        return None
    return {
        "id": log_id,
        "amount_ml": amount_ml,
        "logged_at": logged_at,
        "created_at": created_at,
    }


async def _fetch_water_logs_between(
    access_token: str,
    *,
    user_id: str,
    start_utc: str,
    end_utc: str,
    limit: int = 500,
) -> list[dict[str, Any]]:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/water_logs",
        params=[
            ("select", "id,amount_ml,logged_at,created_at"),
            ("user_id", f"eq.{user_id}"),
            ("logged_at", f"gte.{start_utc}"),
            ("logged_at", f"lt.{end_utc}"),
            ("order", "logged_at.desc"),
            ("limit", str(limit)),
        ],
    )
    if not isinstance(payload, list):
        raise WellnessTrackingError(status_code=502, message="Invalid water logs response from database.")
    logs = []
    for row in payload:
        if isinstance(row, dict):
            normalized = _normalize_water_log(row)
            if normalized:
                logs.append(normalized)
    return logs


async def fetch_water_today(
    access_token: str,
    *,
    user_id: str,
    date: str | None,
    timezone_name: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    target_date, start_utc, end_utc = _build_day_window(date, timezone_name)
    logs = await _fetch_water_logs_between(
        access_token,
        user_id=owner_id,
        start_utc=start_utc,
        end_utc=end_utc,
        limit=500,
    )
    goal_ml = await _resolve_water_goal(access_token, owner_id)
    total_ml = sum(_safe_int(log.get("amount_ml"), 0) for log in logs)
    progress_percent = _water_progress(total_ml, goal_ml)
    remaining_ml = max(0, goal_ml - total_ml)
    return {
        "success": True,
        "date": target_date,
        "today_total_ml": total_ml,
        "goal_ml": goal_ml,
        "remaining_ml": remaining_ml,
        "progress_percent": progress_percent,
        "logs": logs,
    }


async def fetch_water_history(
    access_token: str,
    *,
    user_id: str,
    days: int,
    timezone_name: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    bounded_days = max(1, min(90, int(days)))
    target_date, _, end_utc = _build_day_window(None, timezone_name)
    range_start_date = target_date - timedelta(days=bounded_days - 1)
    _, start_utc, _ = _build_day_window(range_start_date.isoformat(), timezone_name)
    logs = await _fetch_water_logs_between(
        access_token,
        user_id=owner_id,
        start_utc=start_utc,
        end_utc=end_utc,
        limit=2000,
    )
    goal_ml = await _resolve_water_goal(access_token, owner_id)
    tz = _resolve_timezone(timezone_name)
    totals_by_date: dict[str, int] = {}
    for log in logs:
        logged_at = log["logged_at"].astimezone(tz)
        key = logged_at.date().isoformat()
        totals_by_date[key] = totals_by_date.get(key, 0) + _safe_int(log.get("amount_ml"), 0)

    entries: list[dict[str, Any]] = []
    for index in range(bounded_days):
        day = range_start_date + timedelta(days=index)
        key = day.isoformat()
        total = totals_by_date.get(key, 0)
        entries.append(
            {
                "date": day,
                "total_ml": total,
                "goal_ml": goal_ml,
                "progress_percent": _water_progress(total, goal_ml),
            }
        )

    return {
        "success": True,
        "entries": entries,
        "logs": logs,
    }


async def _fetch_latest_water_log(access_token: str, user_id: str) -> dict[str, Any] | None:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/water_logs",
        params=[
            ("select", "id,amount_ml,logged_at,created_at"),
            ("user_id", f"eq.{user_id}"),
            ("order", "created_at.desc"),
            ("limit", "1"),
        ],
    )
    if not isinstance(payload, list) or not payload or not isinstance(payload[0], dict):
        return None
    return _normalize_water_log(payload[0])


async def create_water_log(
    access_token: str,
    *,
    user_id: str,
    amount_ml: int,
    logged_at: datetime | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    normalized_amount = _validate_water_amount(int(amount_ml))
    latest = await _fetch_latest_water_log(access_token, owner_id)
    target_logged_at = (logged_at or datetime.now(timezone.utc)).astimezone(timezone.utc)

    if latest:
        latest_logged_at = latest["logged_at"]
        delta = abs((target_logged_at - latest_logged_at).total_seconds())
        if latest["amount_ml"] == normalized_amount and delta <= WATER_DUPLICATE_WINDOW_SECONDS:
            raise WellnessTrackingError(
                status_code=409,
                message="Duplicate water entry detected. If intentional, wait a moment and retry.",
            )

    created = await _supabase_write(
        access_token,
        method="POST",
        path="/rest/v1/water_logs",
        payload={
            "user_id": owner_id,
            "amount_ml": normalized_amount,
            "logged_at": target_logged_at.isoformat(),
        },
    )

    if not isinstance(created, list) or not created or not isinstance(created[0], dict):
        raise WellnessTrackingError(status_code=502, message="Unable to create water log.")
    created_log = _normalize_water_log(created[0])
    if not created_log:
        raise WellnessTrackingError(status_code=502, message="Created water log payload is invalid.")

    today = await fetch_water_today(
        access_token,
        user_id=owner_id,
        date=None,
        timezone_name="UTC",
    )
    return {
        "success": True,
        "log": created_log,
        "today_total_ml": today["today_total_ml"],
        "goal_ml": today["goal_ml"],
        "remaining_ml": today["remaining_ml"],
        "progress_percent": today["progress_percent"],
    }


async def update_water_log(
    access_token: str,
    *,
    user_id: str,
    log_id: str,
    amount_ml: int,
    logged_at: datetime | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    normalized_amount = _validate_water_amount(int(amount_ml))
    normalized_log_id = log_id.strip()
    if not normalized_log_id:
        raise WellnessTrackingError(status_code=422, message="water log id is required.")

    target_logged_at = (logged_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    updated = await _supabase_write(
        access_token,
        method="PATCH",
        path="/rest/v1/water_logs",
        params=[
            ("id", f"eq.{normalized_log_id}"),
            ("user_id", f"eq.{owner_id}"),
        ],
        payload={
            "amount_ml": normalized_amount,
            "logged_at": target_logged_at.isoformat(),
        },
    )
    if not isinstance(updated, list) or not updated or not isinstance(updated[0], dict):
        raise WellnessTrackingError(status_code=404, message="Water log not found.")
    updated_log = _normalize_water_log(updated[0])
    if not updated_log:
        raise WellnessTrackingError(status_code=502, message="Updated water log payload is invalid.")

    today = await fetch_water_today(
        access_token,
        user_id=owner_id,
        date=None,
        timezone_name="UTC",
    )
    return {
        "success": True,
        "log": updated_log,
        "today_total_ml": today["today_total_ml"],
        "goal_ml": today["goal_ml"],
        "remaining_ml": today["remaining_ml"],
        "progress_percent": today["progress_percent"],
    }


async def delete_water_log(
    access_token: str,
    *,
    user_id: str,
    log_id: str,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    normalized_log_id = log_id.strip()
    if not normalized_log_id:
        raise WellnessTrackingError(status_code=422, message="water log id is required.")

    deleted = await _supabase_delete(
        access_token,
        path="/rest/v1/water_logs",
        params=[
            ("id", f"eq.{normalized_log_id}"),
            ("user_id", f"eq.{owner_id}"),
        ],
    )
    if not isinstance(deleted, list) or not deleted:
        raise WellnessTrackingError(status_code=404, message="Water log not found.")

    return await fetch_water_today(
        access_token,
        user_id=owner_id,
        date=None,
        timezone_name="UTC",
    )


async def update_water_goal(
    access_token: str,
    *,
    user_id: str,
    target_ml: int,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    normalized_target = _clamp_water_goal(int(target_ml), fallback=DEFAULT_WATER_GOAL_ML)
    latest_goal = await _fetch_latest_user_goal(access_token, owner_id)

    if latest_goal and isinstance(latest_goal.get("id"), str):
        await _supabase_write(
            access_token,
            method="PATCH",
            path="/rest/v1/user_goals",
            params=[
                ("id", f"eq.{latest_goal['id']}"),
                ("user_id", f"eq.{owner_id}"),
            ],
            payload={"water_target_ml": normalized_target},
        )
    else:
        await _supabase_write(
            access_token,
            method="POST",
            path="/rest/v1/user_goals",
            payload={
                "user_id": owner_id,
                "goal_type": "maintain",
                "water_target_ml": normalized_target,
            },
        )

    return {
        "success": True,
        "goal_ml": normalized_target,
    }


def _normalize_weight_log(row: dict[str, Any], *, unit: WeightUnit) -> dict[str, Any] | None:
    log_id = str(row.get("id") or "").strip()
    logged_at = _parse_iso_datetime(row.get("logged_at"))
    created_at = _parse_iso_datetime(row.get("created_at"))
    weight_kg_raw = _coerce_non_negative_number(row.get("weight_kg"))
    notes = row.get("notes") if isinstance(row.get("notes"), str) else None
    if not log_id or not logged_at or not created_at or weight_kg_raw <= 0:
        return None

    weight_kg = _validate_weight_kg(weight_kg_raw)
    return {
        "id": log_id,
        "weight_kg": weight_kg,
        "weight": _round_number(_from_kg(weight_kg, unit)),
        "unit": unit,
        "notes": notes,
        "logged_at": logged_at,
        "created_at": created_at,
    }


async def _fetch_weight_logs(
    access_token: str,
    *,
    user_id: str,
    start_utc: str | None = None,
    end_utc: str | None = None,
    order_ascending: bool = False,
    limit: int = 400,
) -> list[dict[str, Any]]:
    params: list[tuple[str, str]] = [
        ("select", "id,weight_kg,notes,logged_at,created_at"),
        ("user_id", f"eq.{user_id}"),
        ("order", f"logged_at.{ 'asc' if order_ascending else 'desc' }"),
        ("limit", str(limit)),
    ]
    if start_utc:
        params.append(("logged_at", f"gte.{start_utc}"))
    if end_utc:
        params.append(("logged_at", f"lt.{end_utc}"))

    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/weight_logs",
        params=params,
    )
    if not isinstance(payload, list):
        raise WellnessTrackingError(status_code=502, message="Invalid weight logs response from database.")
    rows: list[dict[str, Any]] = []
    for row in payload:
        if isinstance(row, dict):
            rows.append(row)
    return rows


def _build_weight_trend(
    logs: list[dict[str, Any]],
    *,
    timezone_name: str | None,
    unit: WeightUnit,
) -> list[dict[str, Any]]:
    tz = _resolve_timezone(timezone_name)
    grouped: dict[str, dict[str, Any]] = {}
    for log in logs:
        normalized = _normalize_weight_log(log, unit=unit)
        if not normalized:
            continue
        local_day = normalized["logged_at"].astimezone(tz).date().isoformat()
        existing = grouped.get(local_day)
        if not existing or normalized["logged_at"] > existing["logged_at"]:
            grouped[local_day] = normalized

    points: list[dict[str, Any]] = []
    for date_key in sorted(grouped.keys()):
        entry = grouped[date_key]
        points.append(
            {
                "date": DateType.fromisoformat(date_key),
                "weight": entry["weight"],
                "unit": unit,
            }
        )
    return points


async def fetch_weight_history(
    access_token: str,
    *,
    user_id: str,
    days: int,
    timezone_name: str | None,
    unit: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    target_unit = _normalize_weight_unit(unit)
    bounded_days = max(7, min(365, int(days)))
    target_date, _, end_utc = _build_day_window(None, timezone_name)
    range_start_date = target_date - timedelta(days=bounded_days - 1)
    _, start_utc, _ = _build_day_window(range_start_date.isoformat(), timezone_name)

    raw_logs = await _fetch_weight_logs(
        access_token,
        user_id=owner_id,
        start_utc=start_utc,
        end_utc=end_utc,
        order_ascending=False,
        limit=1000,
    )
    logs = []
    for row in raw_logs:
        normalized = _normalize_weight_log(row, unit=target_unit)
        if normalized:
            logs.append(normalized)

    trend = _build_weight_trend(raw_logs, timezone_name=timezone_name, unit=target_unit)
    return {
        "success": True,
        "logs": logs,
        "trend": trend,
    }


def _calculate_weight_summary(
    normalized_logs_asc: list[dict[str, Any]],
    *,
    target_weight_kg: float | None,
    unit: WeightUnit,
    timezone_name: str | None,
) -> dict[str, Any]:
    if not normalized_logs_asc:
        return {
            "success": True,
            "current_weight": None,
            "target_weight": _round_number(_from_kg(target_weight_kg, unit)) if target_weight_kg else None,
            "unit": unit,
            "change_from_start": None,
            "remaining_to_goal": None,
            "recent_change": None,
            "progress_percent": None,
            "trend": [],
        }

    first = normalized_logs_asc[0]
    current = normalized_logs_asc[-1]
    previous = normalized_logs_asc[-2] if len(normalized_logs_asc) > 1 else None

    first_kg = first["weight_kg"]
    current_kg = current["weight_kg"]
    previous_kg = previous["weight_kg"] if previous else None

    trend_logs_raw = [
        {
            "id": log["id"],
            "weight_kg": log["weight_kg"],
            "notes": log.get("notes"),
            "logged_at": log["logged_at"].isoformat(),
            "created_at": log["created_at"].isoformat(),
        }
        for log in normalized_logs_asc
    ]
    trend = _build_weight_trend(
        trend_logs_raw,
        timezone_name=timezone_name,
        unit=unit,
    )

    remaining = None
    progress_percent = None
    if target_weight_kg is not None:
        remaining = _round_number(abs(current_kg - target_weight_kg))
        path = abs(first_kg - target_weight_kg)
        if path > 0:
            completed = abs(first_kg - current_kg)
            progress_percent = max(0, min(100, int(round((completed / path) * 100))))
        else:
            progress_percent = 100

    return {
        "success": True,
        "current_weight": _round_number(_from_kg(current_kg, unit)),
        "target_weight": _round_number(_from_kg(target_weight_kg, unit)) if target_weight_kg is not None else None,
        "unit": unit,
        "change_from_start": _round_number(_from_kg(current_kg - first_kg, unit)),
        "remaining_to_goal": _round_number(_from_kg(remaining, unit)) if remaining is not None else None,
        "recent_change": _round_number(_from_kg(current_kg - previous_kg, unit)) if previous_kg else None,
        "progress_percent": progress_percent,
        "trend": trend,
    }


async def fetch_weight_summary(
    access_token: str,
    *,
    user_id: str,
    timezone_name: str | None,
    unit: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    target_unit = _normalize_weight_unit(unit)
    latest_goal = await _fetch_latest_user_goal(access_token, owner_id)
    target_weight_kg = None
    if latest_goal and latest_goal.get("goal_weight_kg") is not None:
        goal_raw = _coerce_non_negative_number(latest_goal.get("goal_weight_kg"))
        if goal_raw > 0:
            target_weight_kg = _validate_weight_kg(goal_raw)

    raw_logs = await _fetch_weight_logs(
        access_token,
        user_id=owner_id,
        order_ascending=True,
        limit=1200,
    )
    normalized = []
    for row in raw_logs:
        parsed = _normalize_weight_log(row, unit="kg")
        if parsed:
            normalized.append(parsed)

    return _calculate_weight_summary(
        normalized,
        target_weight_kg=target_weight_kg,
        unit=target_unit,
        timezone_name=timezone_name,
    )


async def _fetch_latest_weight_log(access_token: str, user_id: str) -> dict[str, Any] | None:
    rows = await _fetch_weight_logs(
        access_token,
        user_id=user_id,
        order_ascending=False,
        limit=1,
    )
    if not rows:
        return None
    return rows[0]


async def create_weight_log(
    access_token: str,
    *,
    user_id: str,
    weight: float,
    unit: str | None,
    notes: str | None,
    logged_at: datetime | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    target_unit = _normalize_weight_unit(unit)
    weight_kg = _validate_weight_kg(_to_kg(float(weight), target_unit))
    target_logged_at = (logged_at or datetime.now(timezone.utc)).astimezone(timezone.utc)

    latest = await _fetch_latest_weight_log(access_token, owner_id)
    latest_logged_at = _parse_iso_datetime(latest.get("logged_at")) if latest else None
    latest_weight_kg = _coerce_non_negative_number(latest.get("weight_kg")) if latest else None
    if latest_logged_at and latest_weight_kg:
        delta = abs((target_logged_at - latest_logged_at).total_seconds())
        if abs(latest_weight_kg - weight_kg) < 0.05 and delta <= WEIGHT_DUPLICATE_WINDOW_SECONDS:
            raise WellnessTrackingError(
                status_code=409,
                message="Duplicate weight entry detected. Please wait before logging the same value again.",
            )

    created = await _supabase_write(
        access_token,
        method="POST",
        path="/rest/v1/weight_logs",
        payload={
            "user_id": owner_id,
            "weight_kg": weight_kg,
            "notes": notes.strip() if isinstance(notes, str) and notes.strip() else None,
            "logged_at": target_logged_at.isoformat(),
        },
    )
    if not isinstance(created, list) or not created or not isinstance(created[0], dict):
        raise WellnessTrackingError(status_code=502, message="Unable to create weight log.")
    log = _normalize_weight_log(created[0], unit=target_unit)
    if not log:
        raise WellnessTrackingError(status_code=502, message="Created weight log payload is invalid.")
    summary = await fetch_weight_summary(
        access_token,
        user_id=owner_id,
        timezone_name="UTC",
        unit=target_unit,
    )
    return {
        "success": True,
        "log": log,
        "summary": summary,
    }


async def update_weight_goal(
    access_token: str,
    *,
    user_id: str,
    target_weight: float,
    unit: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    target_unit = _normalize_weight_unit(unit)
    target_weight_kg = _validate_weight_kg(_to_kg(float(target_weight), target_unit))
    latest_goal = await _fetch_latest_user_goal(access_token, owner_id)

    if latest_goal and isinstance(latest_goal.get("id"), str):
        await _supabase_write(
            access_token,
            method="PATCH",
            path="/rest/v1/user_goals",
            params=[
                ("id", f"eq.{latest_goal['id']}"),
                ("user_id", f"eq.{owner_id}"),
            ],
            payload={"goal_weight_kg": target_weight_kg},
        )
    else:
        await _supabase_write(
            access_token,
            method="POST",
            path="/rest/v1/user_goals",
            payload={
                "user_id": owner_id,
                "goal_type": "maintain",
                "goal_weight_kg": target_weight_kg,
            },
        )

    return {
        "success": True,
        "target_weight": _round_number(_from_kg(target_weight_kg, target_unit)),
        "unit": target_unit,
    }
