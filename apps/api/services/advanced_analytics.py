from __future__ import annotations

import asyncio
import json
import os
import re
from dataclasses import dataclass
from datetime import date as DateType, datetime, time, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

from openai import AsyncOpenAI, OpenAIError
from pydantic import BaseModel, Field, ValidationError

from services.supabase_meals import (
    SupabaseServiceError,
    _coerce_non_negative_number,
    _fetch_latest_goals,
    _normalize_user_id,
    _resolve_timezone,
    _round_number,
    _supabase_get,
)

WeightUnit = Literal["kg", "lb"]
TrendDirection = Literal["up", "down", "stable"]

MIN_WEIGHT_KG = 20.0
MAX_WEIGHT_KG = 400.0
KG_TO_LB = 2.2046226218
DEFAULT_WATER_GOAL_ML = 2500
MIN_WATER_GOAL_ML = 1200
MAX_WATER_GOAL_ML = 6000
OPENAI_ANALYTICS_MODEL = os.getenv(
    "OPENAI_ANALYTICS_MODEL",
    os.getenv("OPENAI_INSIGHTS_MODEL", "gpt-4.1-mini"),
)
OPENAI_ANALYTICS_TIMEOUT_SECONDS = 10.0

MEDICAL_KEYWORDS = {
    "diagnose",
    "diagnosis",
    "disease",
    "cure",
    "treatment",
    "medication",
    "prescription",
    "therapy",
}

OPENAI_ANALYTICS_SUMMARY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "headline": {"type": "string", "minLength": 12, "maxLength": 140},
        "wins": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": {"type": "string", "minLength": 10, "maxLength": 120},
        },
        "focus_areas": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": {"type": "string", "minLength": 10, "maxLength": 120},
        },
        "next_steps": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": {"type": "string", "minLength": 10, "maxLength": 120},
        },
        "motivation": {"type": "string", "minLength": 12, "maxLength": 180},
        "risk_flags": {
            "type": "array",
            "maxItems": 4,
            "items": {"type": "string", "minLength": 8, "maxLength": 120},
        },
        "confidence_score": {"type": "integer", "minimum": 0, "maximum": 100},
    },
    "required": [
        "headline",
        "wins",
        "focus_areas",
        "next_steps",
        "motivation",
        "risk_flags",
        "confidence_score",
    ],
}

_openai_client: AsyncOpenAI | None = None
_WHITESPACE_RE = re.compile(r"\s+")


@dataclass(slots=True)
class AnalyticsServiceError(Exception):
    status_code: int
    message: str


@dataclass(slots=True)
class _MealRecord:
    eaten_at_utc: datetime
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


@dataclass(slots=True)
class _WaterRecord:
    logged_at_utc: datetime
    amount_ml: int


@dataclass(slots=True)
class _WeightRecord:
    logged_at_utc: datetime
    weight_kg: float


@dataclass(slots=True)
class _DayAggregate:
    date: DateType
    calories: float = 0.0
    protein_g: float = 0.0
    carbs_g: float = 0.0
    fat_g: float = 0.0
    hydration_ml: int = 0
    meal_count: int = 0
    weight_kg: float | None = None
    weight_logged_at_utc: datetime | None = None


@dataclass(slots=True)
class _AnalyticsContext:
    owner_id: str
    timezone_name: str
    target_timezone: ZoneInfo | timezone
    target_date: DateType
    start_date: DateType
    goals: dict[str, float]
    goal_type: str
    water_goal_ml: int
    weight_goal_kg: float | None
    day_map: dict[DateType, _DayAggregate]
    weight_records: list[_WeightRecord]


class _AISummaryEnvelope(BaseModel):
    headline: str = Field(min_length=12, max_length=140)
    wins: list[str] = Field(min_length=1, max_length=4)
    focus_areas: list[str] = Field(min_length=1, max_length=4)
    next_steps: list[str] = Field(min_length=1, max_length=4)
    motivation: str = Field(min_length=12, max_length=180)
    risk_flags: list[str] = Field(default_factory=list, max_length=4)
    confidence_score: int = Field(ge=0, le=100)


def _resolve_target_date(requested_date: str | None, target_timezone: ZoneInfo | timezone) -> DateType:
    cleaned = (requested_date or "").strip()
    if not cleaned:
        return datetime.now(target_timezone).date()

    try:
        return DateType.fromisoformat(cleaned)
    except ValueError as exc:
        raise SupabaseServiceError(status_code=422, message="date must be in YYYY-MM-DD format.") from exc


def _format_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_timezone_label(target_timezone: ZoneInfo | timezone) -> str:
    if isinstance(target_timezone, ZoneInfo):
        return target_timezone.key
    return "UTC"


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _normalize_weight_unit(unit: str | None) -> WeightUnit:
    return "lb" if (unit or "").strip().lower() == "lb" else "kg"


def _to_weight_unit(weight_kg: float, unit: WeightUnit) -> float:
    if unit == "lb":
        return weight_kg * KG_TO_LB
    return weight_kg


def _resolve_water_goal_from_weight(weight_kg: float | None) -> int:
    if weight_kg and weight_kg > 0:
        predicted = int(round((weight_kg * 35) / 250.0) * 250)
        return max(1800, min(4500, predicted))
    return DEFAULT_WATER_GOAL_ML


def _clamp_water_goal(value: int | None, *, fallback: int) -> int:
    if value is None:
        return fallback
    return max(MIN_WATER_GOAL_ML, min(MAX_WATER_GOAL_ML, int(value)))


def _adherence_percent(consumed: float, goal: float) -> int:
    if goal <= 0:
        return 0
    distance = abs(consumed - goal) / goal
    score = 100 - (distance * 100)
    return max(0, min(100, int(round(score))))


def _average(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / float(len(values))


def _trend_direction(values: list[float]) -> TrendDirection:
    if len(values) < 3:
        return "stable"
    split_index = max(1, len(values) // 2)
    first_avg = _average(values[:split_index])
    second_avg = _average(values[split_index:])
    baseline = max(1.0, abs(first_avg))
    delta_ratio = (second_avg - first_avg) / baseline
    if abs(delta_ratio) < 0.06:
        return "stable"
    return "up" if delta_ratio > 0 else "down"


def _target_consistency_score(values: list[float], target: float) -> int:
    if target <= 0 or not values:
        return 0
    deviations = [abs(value - target) / target for value in values]
    mean_deviation = _average(deviations)
    score = 100 - (mean_deviation * 100)
    return max(0, min(100, int(round(score))))


def _contains_medical_language(*values: str) -> bool:
    merged = " ".join(values).lower()
    return any(keyword in merged for keyword in MEDICAL_KEYWORDS)


def _compact_text(value: str, *, max_length: int) -> str:
    cleaned = _WHITESPACE_RE.sub(" ", value).strip()
    if len(cleaned) <= max_length:
        return cleaned
    return cleaned[: max_length - 1].rstrip() + "…"


def _initialize_day_map(start_date: DateType, end_date: DateType) -> dict[DateType, _DayAggregate]:
    day_map: dict[DateType, _DayAggregate] = {}
    cursor = start_date
    while cursor <= end_date:
        day_map[cursor] = _DayAggregate(date=cursor)
        cursor += timedelta(days=1)
    return day_map


async def _fetch_latest_goal_record(access_token: str, *, user_id: str) -> dict[str, Any] | None:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/user_goals",
        params=[
            (
                "select",
                "goal_type,goal_weight_kg,water_target_ml,daily_calorie_target,protein_target_g,carbs_target_g,fat_target_g",
            ),
            ("user_id", f"eq.{user_id}"),
            ("order", "created_at.desc"),
            ("limit", "1"),
        ],
    )
    if not isinstance(payload, list) or not payload or not isinstance(payload[0], dict):
        return None
    return payload[0]


async def _fetch_profile_weight(access_token: str, *, user_id: str) -> float | None:
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
    value = _coerce_non_negative_number(payload[0].get("weight_kg"))
    if value <= 0:
        return None
    return _round_number(value)


async def _fetch_meals_for_range(
    access_token: str,
    *,
    user_id: str,
    start_utc: str,
    end_utc: str,
) -> list[_MealRecord]:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/meals",
        params=[
            ("select", "eaten_at,total_calories,total_protein_g,total_carbs_g,total_fat_g"),
            ("user_id", f"eq.{user_id}"),
            ("eaten_at", f"gte.{start_utc}"),
            ("eaten_at", f"lt.{end_utc}"),
            ("order", "eaten_at.asc"),
            ("limit", "2000"),
        ],
    )
    if not isinstance(payload, list):
        raise SupabaseServiceError(status_code=502, message="Invalid meals analytics payload.")

    rows: list[_MealRecord] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        eaten_at = _parse_iso_datetime(row.get("eaten_at"))
        if eaten_at is None:
            continue
        rows.append(
            _MealRecord(
                eaten_at_utc=eaten_at,
                calories=_round_number(_coerce_non_negative_number(row.get("total_calories"))),
                protein_g=_round_number(_coerce_non_negative_number(row.get("total_protein_g"))),
                carbs_g=_round_number(_coerce_non_negative_number(row.get("total_carbs_g"))),
                fat_g=_round_number(_coerce_non_negative_number(row.get("total_fat_g"))),
            )
        )
    return rows


async def _fetch_water_for_range(
    access_token: str,
    *,
    user_id: str,
    start_utc: str,
    end_utc: str,
) -> list[_WaterRecord]:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/water_logs",
        params=[
            ("select", "logged_at,amount_ml"),
            ("user_id", f"eq.{user_id}"),
            ("logged_at", f"gte.{start_utc}"),
            ("logged_at", f"lt.{end_utc}"),
            ("order", "logged_at.asc"),
            ("limit", "4000"),
        ],
    )
    if not isinstance(payload, list):
        raise SupabaseServiceError(status_code=502, message="Invalid hydration analytics payload.")

    rows: list[_WaterRecord] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        logged_at = _parse_iso_datetime(row.get("logged_at"))
        amount_ml = int(round(_coerce_non_negative_number(row.get("amount_ml"))))
        if logged_at is None or amount_ml <= 0:
            continue
        rows.append(_WaterRecord(logged_at_utc=logged_at, amount_ml=amount_ml))
    return rows


async def _fetch_weight_for_range(
    access_token: str,
    *,
    user_id: str,
    start_utc: str,
    end_utc: str,
) -> list[_WeightRecord]:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/weight_logs",
        params=[
            ("select", "logged_at,weight_kg"),
            ("user_id", f"eq.{user_id}"),
            ("logged_at", f"gte.{start_utc}"),
            ("logged_at", f"lt.{end_utc}"),
            ("order", "logged_at.asc"),
            ("limit", "2000"),
        ],
    )
    if not isinstance(payload, list):
        raise SupabaseServiceError(status_code=502, message="Invalid weight analytics payload.")

    rows: list[_WeightRecord] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        logged_at = _parse_iso_datetime(row.get("logged_at"))
        weight_kg = _coerce_non_negative_number(row.get("weight_kg"))
        if logged_at is None or weight_kg <= 0:
            continue
        bounded = max(MIN_WEIGHT_KG, min(MAX_WEIGHT_KG, float(weight_kg)))
        rows.append(_WeightRecord(logged_at_utc=logged_at, weight_kg=_round_number(bounded)))
    return rows


def _populate_day_map(
    *,
    day_map: dict[DateType, _DayAggregate],
    meals: list[_MealRecord],
    waters: list[_WaterRecord],
    weights: list[_WeightRecord],
    target_timezone: ZoneInfo | timezone,
) -> None:
    for meal in meals:
        local_date = meal.eaten_at_utc.astimezone(target_timezone).date()
        day = day_map.get(local_date)
        if day is None:
            continue
        day.calories = _round_number(day.calories + meal.calories)
        day.protein_g = _round_number(day.protein_g + meal.protein_g)
        day.carbs_g = _round_number(day.carbs_g + meal.carbs_g)
        day.fat_g = _round_number(day.fat_g + meal.fat_g)
        day.meal_count += 1

    for water in waters:
        local_date = water.logged_at_utc.astimezone(target_timezone).date()
        day = day_map.get(local_date)
        if day is None:
            continue
        day.hydration_ml += max(0, int(water.amount_ml))

    for weight in weights:
        local_date = weight.logged_at_utc.astimezone(target_timezone).date()
        day = day_map.get(local_date)
        if day is None:
            continue
        if day.weight_logged_at_utc is None or weight.logged_at_utc >= day.weight_logged_at_utc:
            day.weight_kg = _round_number(weight.weight_kg)
            day.weight_logged_at_utc = weight.logged_at_utc


def _build_daily_metrics(
    *,
    day_map: dict[DateType, _DayAggregate],
    goals: dict[str, float],
    water_goal_ml: int,
    unit: WeightUnit,
) -> tuple[list[dict[str, Any]], int]:
    metrics: list[dict[str, Any]] = []
    tracked_days = 0

    for date_key in sorted(day_map.keys()):
        day = day_map[date_key]
        tracked = day.meal_count > 0 or day.hydration_ml > 0 or day.weight_kg is not None
        if tracked:
            tracked_days += 1
        metrics.append(
            {
                "date": day.date,
                "calories": _round_number(day.calories),
                "protein_g": _round_number(day.protein_g),
                "carbs_g": _round_number(day.carbs_g),
                "fat_g": _round_number(day.fat_g),
                "hydration_ml": max(0, int(day.hydration_ml)),
                "hydration_goal_ml": water_goal_ml,
                "calorie_adherence_percent": _adherence_percent(day.calories, goals.get("calories", 0.0)),
                "protein_adherence_percent": _adherence_percent(day.protein_g, goals.get("protein_g", 0.0)),
                "carbs_adherence_percent": _adherence_percent(day.carbs_g, goals.get("carbs_g", 0.0)),
                "fat_adherence_percent": _adherence_percent(day.fat_g, goals.get("fat_g", 0.0)),
                "hydration_adherence_percent": _adherence_percent(float(day.hydration_ml), float(water_goal_ml)),
                "weight": _round_number(_to_weight_unit(day.weight_kg, unit)) if day.weight_kg is not None else None,
                "weight_unit": unit,
                "meal_count": max(0, int(day.meal_count)),
                "tracked": tracked,
            }
        )

    return metrics, tracked_days


def _goal_adherence_breakdown(metrics: list[dict[str, Any]]) -> dict[str, int]:
    tracked = [metric for metric in metrics if metric.get("tracked")]
    if not tracked:
        return {
            "calories_percent": 0,
            "protein_percent": 0,
            "carbs_percent": 0,
            "fat_percent": 0,
            "hydration_percent": 0,
            "overall_percent": 0,
        }

    calories = int(round(_average([float(item["calorie_adherence_percent"]) for item in tracked])))
    protein = int(round(_average([float(item["protein_adherence_percent"]) for item in tracked])))
    carbs = int(round(_average([float(item["carbs_adherence_percent"]) for item in tracked])))
    fat = int(round(_average([float(item["fat_adherence_percent"]) for item in tracked])))
    hydration = int(round(_average([float(item["hydration_adherence_percent"]) for item in tracked])))
    overall = int(round(_average([float(calories), float(protein), float(carbs), float(fat), float(hydration)])))

    return {
        "calories_percent": max(0, min(100, calories)),
        "protein_percent": max(0, min(100, protein)),
        "carbs_percent": max(0, min(100, carbs)),
        "fat_percent": max(0, min(100, fat)),
        "hydration_percent": max(0, min(100, hydration)),
        "overall_percent": max(0, min(100, overall)),
    }


def _weekly_macro_averages(metrics: list[dict[str, Any]], goals: dict[str, float], water_goal_ml: int) -> list[dict[str, Any]]:
    calories_avg = _average([float(item["calories"]) for item in metrics])
    protein_avg = _average([float(item["protein_g"]) for item in metrics])
    carbs_avg = _average([float(item["carbs_g"]) for item in metrics])
    fat_avg = _average([float(item["fat_g"]) for item in metrics])
    hydration_avg = _average([float(item["hydration_ml"]) for item in metrics])
    return [
        {
            "macro": "calories",
            "average": _round_number(calories_avg),
            "goal": _round_number(goals.get("calories", 0.0)),
            "adherence_percent": _adherence_percent(calories_avg, goals.get("calories", 0.0)),
        },
        {
            "macro": "protein_g",
            "average": _round_number(protein_avg),
            "goal": _round_number(goals.get("protein_g", 0.0)),
            "adherence_percent": _adherence_percent(protein_avg, goals.get("protein_g", 0.0)),
        },
        {
            "macro": "carbs_g",
            "average": _round_number(carbs_avg),
            "goal": _round_number(goals.get("carbs_g", 0.0)),
            "adherence_percent": _adherence_percent(carbs_avg, goals.get("carbs_g", 0.0)),
        },
        {
            "macro": "fat_g",
            "average": _round_number(fat_avg),
            "goal": _round_number(goals.get("fat_g", 0.0)),
            "adherence_percent": _adherence_percent(fat_avg, goals.get("fat_g", 0.0)),
        },
        {
            "macro": "hydration_ml",
            "average": _round_number(hydration_avg),
            "goal": float(water_goal_ml),
            "adherence_percent": _adherence_percent(hydration_avg, float(water_goal_ml)),
        },
    ]


def _weight_change(weight_points: list[float]) -> float | None:
    if len(weight_points) < 2:
        return None
    return _round_number(weight_points[-1] - weight_points[0])


def _weight_goal_progress(weight_records: list[_WeightRecord], target_weight_kg: float | None) -> int | None:
    if target_weight_kg is None or len(weight_records) < 2:
        return None
    start = weight_records[0].weight_kg
    current = weight_records[-1].weight_kg
    path = abs(start - target_weight_kg)
    if path <= 0:
        return 100
    complete = abs(start - current)
    return max(0, min(100, int(round((complete / path) * 100))))


def _compute_current_streak(
    day_map: dict[DateType, _DayAggregate],
    *,
    end_date: DateType,
    predicate,
) -> int:
    streak = 0
    cursor = end_date
    while True:
        day = day_map.get(cursor)
        if day is None or not predicate(day):
            break
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _compute_best_streak(day_map: dict[DateType, _DayAggregate], *, predicate) -> int:
    best = 0
    active = 0
    for date_key in sorted(day_map.keys()):
        day = day_map[date_key]
        if predicate(day):
            active += 1
            best = max(best, active)
        else:
            active = 0
    return best


def _week_start(value: DateType) -> DateType:
    return value - timedelta(days=value.weekday())


def _compute_weight_week_streaks(
    weight_records: list[_WeightRecord],
    *,
    target_timezone: ZoneInfo | timezone,
    target_date: DateType,
) -> tuple[int, int]:
    if not weight_records:
        return 0, 0

    week_starts = {
        _week_start(record.logged_at_utc.astimezone(target_timezone).date())
        for record in weight_records
    }
    if not week_starts:
        return 0, 0

    current = 0
    cursor = _week_start(target_date)
    while cursor in week_starts:
        current += 1
        cursor -= timedelta(days=7)

    best = 0
    active = 0
    previous: DateType | None = None
    for start in sorted(week_starts):
        if previous is not None and start == previous + timedelta(days=7):
            active += 1
        else:
            active = 1
        best = max(best, active)
        previous = start

    return current, best


def _build_weekly_payload(context: _AnalyticsContext, *, unit: WeightUnit) -> dict[str, Any]:
    daily_metrics, days_tracked = _build_daily_metrics(
        day_map=context.day_map,
        goals=context.goals,
        water_goal_ml=context.water_goal_ml,
        unit=unit,
    )

    tracked_for_consistency = [item for item in daily_metrics if item["tracked"]]
    calorie_series = [float(item["calories"]) for item in tracked_for_consistency]
    weight_series = [
        float(item["weight"])
        for item in tracked_for_consistency
        if isinstance(item.get("weight"), (float, int))
    ]
    protein_values = [float(item["protein_g"]) for item in tracked_for_consistency if item["meal_count"] > 0]
    hydration_values = [float(item["hydration_ml"]) for item in tracked_for_consistency]

    goal_adherence = _goal_adherence_breakdown(daily_metrics)
    weight_goal_progress = _weight_goal_progress(context.weight_records, context.weight_goal_kg)

    return {
        "success": True,
        "timezone": context.timezone_name,
        "summary": {
            "week_start": context.start_date,
            "week_end": context.target_date,
            "days_tracked": days_tracked,
            "calorie_trend": _trend_direction(calorie_series),
            "weight_trend": _trend_direction(weight_series),
            "protein_consistency_score": _target_consistency_score(
                protein_values, context.goals.get("protein_g", 0.0)
            ),
            "hydration_consistency_score": _target_consistency_score(
                hydration_values, float(context.water_goal_ml)
            ),
            "goal_adherence": goal_adherence,
            "weekly_macro_averages": _weekly_macro_averages(
                daily_metrics,
                context.goals,
                context.water_goal_ml,
            ),
            "weight_change": _weight_change(weight_series),
            "weight_goal_progress_percent": weight_goal_progress,
        },
        "daily_metrics": daily_metrics,
    }


def _build_monthly_payload(context: _AnalyticsContext, *, unit: WeightUnit) -> dict[str, Any]:
    daily_metrics, days_tracked = _build_daily_metrics(
        day_map=context.day_map,
        goals=context.goals,
        water_goal_ml=context.water_goal_ml,
        unit=unit,
    )
    tracked = [item for item in daily_metrics if item["tracked"]]
    avg_goal_adherence = _goal_adherence_breakdown(daily_metrics)["overall_percent"]

    calories_trend = _trend_direction([float(item["calories"]) for item in tracked])
    protein_trend = _trend_direction([float(item["protein_g"]) for item in tracked])
    hydration_trend = _trend_direction([float(item["hydration_ml"]) for item in tracked])
    weight_trend = _trend_direction(
        [float(item["weight"]) for item in tracked if isinstance(item.get("weight"), (float, int))]
    )

    weekly_metrics: list[dict[str, Any]] = []
    for chunk_start in range(0, len(daily_metrics), 7):
        chunk = daily_metrics[chunk_start : chunk_start + 7]
        if not chunk:
            continue
        week_start = chunk[0]["date"]
        week_end = chunk[-1]["date"]
        chunk_goal = _goal_adherence_breakdown(chunk)
        chunk_weights = [
            float(item["weight"]) for item in chunk if isinstance(item.get("weight"), (float, int))
        ]
        weekly_metrics.append(
            {
                "week_start": week_start,
                "week_end": week_end,
                "avg_calories": _round_number(_average([float(item["calories"]) for item in chunk])),
                "avg_protein_g": _round_number(_average([float(item["protein_g"]) for item in chunk])),
                "avg_hydration_ml": _round_number(_average([float(item["hydration_ml"]) for item in chunk])),
                "goal_adherence_percent": chunk_goal["overall_percent"],
                "weight_change": _weight_change(chunk_weights),
            }
        )

    return {
        "success": True,
        "timezone": context.timezone_name,
        "summary": {
            "period_start": context.start_date,
            "period_end": context.target_date,
            "days_tracked": days_tracked,
            "average_goal_adherence_percent": avg_goal_adherence,
            "calories_trend": calories_trend,
            "protein_trend": protein_trend,
            "hydration_trend": hydration_trend,
            "weight_trend": weight_trend,
        },
        "daily_metrics": daily_metrics,
        "weekly_metrics": weekly_metrics,
    }


def _build_streaks_payload(context: _AnalyticsContext) -> dict[str, Any]:
    hydration_target = float(context.water_goal_ml)
    protein_target = context.goals.get("protein_g", 0.0)

    meal_current = _compute_current_streak(
        context.day_map,
        end_date=context.target_date,
        predicate=lambda day: day.meal_count > 0,
    )
    meal_best = _compute_best_streak(context.day_map, predicate=lambda day: day.meal_count > 0)

    hydration_current = _compute_current_streak(
        context.day_map,
        end_date=context.target_date,
        predicate=lambda day: day.hydration_ml >= hydration_target * 0.9,
    )
    hydration_best = _compute_best_streak(
        context.day_map,
        predicate=lambda day: day.hydration_ml >= hydration_target * 0.9,
    )

    protein_current = _compute_current_streak(
        context.day_map,
        end_date=context.target_date,
        predicate=lambda day: day.protein_g >= protein_target * 0.9 if protein_target > 0 else False,
    )
    protein_best = _compute_best_streak(
        context.day_map,
        predicate=lambda day: day.protein_g >= protein_target * 0.9 if protein_target > 0 else False,
    )

    weight_current, weight_best = _compute_weight_week_streaks(
        context.weight_records,
        target_timezone=context.target_timezone,
        target_date=context.target_date,
    )

    return {
        "success": True,
        "as_of_date": context.target_date,
        "streaks": [
            {
                "key": "meal_logging",
                "label": "Meal logging streak",
                "current": meal_current,
                "best": meal_best,
                "unit": "days",
                "is_active": meal_current > 0,
            },
            {
                "key": "hydration_goal",
                "label": "Hydration goal streak",
                "current": hydration_current,
                "best": hydration_best,
                "unit": "days",
                "is_active": hydration_current > 0,
            },
            {
                "key": "protein_goal",
                "label": "Protein goal streak",
                "current": protein_current,
                "best": protein_best,
                "unit": "days",
                "is_active": protein_current > 0,
            },
            {
                "key": "weight_logging_weeks",
                "label": "Weight logging streak",
                "current": weight_current,
                "best": weight_best,
                "unit": "weeks",
                "is_active": weight_current > 0,
            },
        ],
    }


def _achievement_progress(current: float, target: float) -> int:
    if target <= 0:
        return 0
    return max(0, min(100, int(round((current / target) * 100))))


def _build_achievements_payload(
    *,
    weekly_payload: dict[str, Any],
    monthly_payload: dict[str, Any],
    streaks_payload: dict[str, Any],
) -> dict[str, Any]:
    streak_lookup = {
        item["key"]: item
        for item in streaks_payload.get("streaks", [])
        if isinstance(item, dict) and isinstance(item.get("key"), str)
    }

    weekly_summary = weekly_payload.get("summary", {}) if isinstance(weekly_payload.get("summary"), dict) else {}
    monthly_summary = (
        monthly_payload.get("summary", {}) if isinstance(monthly_payload.get("summary"), dict) else {}
    )
    goal_adherence = (
        weekly_summary.get("goal_adherence", {})
        if isinstance(weekly_summary.get("goal_adherence"), dict)
        else {}
    )

    logging_current = float(streak_lookup.get("meal_logging", {}).get("current", 0))
    hydration_current = float(streak_lookup.get("hydration_goal", {}).get("current", 0))
    protein_current = float(streak_lookup.get("protein_goal", {}).get("current", 0))
    weight_weeks_current = float(streak_lookup.get("weight_logging_weeks", {}).get("current", 0))
    overall_adherence = float(monthly_summary.get("average_goal_adherence_percent", 0))
    weekly_overall = float(goal_adherence.get("overall_percent", 0))
    weight_goal_progress = weekly_summary.get("weight_goal_progress_percent")
    weight_goal_progress_value = float(weight_goal_progress) if isinstance(weight_goal_progress, int) else 0.0

    achievements = [
        {
            "id": "meal_streak_7",
            "title": "7-day logging streak",
            "description": "Log at least one meal for 7 days in a row.",
            "category": "consistency",
            "current_value": logging_current,
            "target_value": 7.0,
            "progress_percent": _achievement_progress(logging_current, 7.0),
            "unlocked": logging_current >= 7.0,
            "unlocked_at": None,
        },
        {
            "id": "hydration_streak_7",
            "title": "Hydration hero",
            "description": "Hit your hydration target for 7 consecutive days.",
            "category": "hydration",
            "current_value": hydration_current,
            "target_value": 7.0,
            "progress_percent": _achievement_progress(hydration_current, 7.0),
            "unlocked": hydration_current >= 7.0,
            "unlocked_at": None,
        },
        {
            "id": "protein_streak_5",
            "title": "Protein consistency",
            "description": "Reach your protein target for 5 consecutive days.",
            "category": "nutrition",
            "current_value": protein_current,
            "target_value": 5.0,
            "progress_percent": _achievement_progress(protein_current, 5.0),
            "unlocked": protein_current >= 5.0,
            "unlocked_at": None,
        },
        {
            "id": "goal_adherence_80",
            "title": "Balanced week",
            "description": "Maintain 80%+ average goal adherence in your 30-day window.",
            "category": "milestone",
            "current_value": overall_adherence,
            "target_value": 80.0,
            "progress_percent": _achievement_progress(overall_adherence, 80.0),
            "unlocked": overall_adherence >= 80.0,
            "unlocked_at": None,
        },
        {
            "id": "weight_logging_weeks_4",
            "title": "Weight trend tracker",
            "description": "Log weight for 4 consecutive weeks.",
            "category": "weight",
            "current_value": weight_weeks_current,
            "target_value": 4.0,
            "progress_percent": _achievement_progress(weight_weeks_current, 4.0),
            "unlocked": weight_weeks_current >= 4.0,
            "unlocked_at": None,
        },
        {
            "id": "weight_goal_progress_50",
            "title": "Halfway to weight goal",
            "description": "Reach at least 50% progress toward your configured weight goal.",
            "category": "weight",
            "current_value": weight_goal_progress_value,
            "target_value": 50.0,
            "progress_percent": _achievement_progress(weight_goal_progress_value, 50.0),
            "unlocked": weight_goal_progress_value >= 50.0 and isinstance(weight_goal_progress, int),
            "unlocked_at": None,
        },
        {
            "id": "weekly_adherence_75",
            "title": "Strong weekly execution",
            "description": "Hit 75%+ overall adherence this week.",
            "category": "nutrition",
            "current_value": weekly_overall,
            "target_value": 75.0,
            "progress_percent": _achievement_progress(weekly_overall, 75.0),
            "unlocked": weekly_overall >= 75.0,
            "unlocked_at": None,
        },
    ]

    unlocked_count = sum(1 for item in achievements if item["unlocked"])
    return {
        "success": True,
        "generated_at": datetime.now(timezone.utc),
        "total_unlocked": unlocked_count,
        "achievements": achievements,
    }


def _extract_json_from_model_output(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Analytics AI returned invalid JSON.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Analytics AI returned an invalid payload.")
    return payload


def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client


def _sanitize_summary_payload(candidate: _AISummaryEnvelope) -> _AISummaryEnvelope:
    fields = [
        candidate.headline,
        candidate.motivation,
        *candidate.wins,
        *candidate.focus_areas,
        *candidate.next_steps,
        *candidate.risk_flags,
    ]
    if _contains_medical_language(*fields):
        raise RuntimeError("Analytics AI response included medical guidance.")

    return _AISummaryEnvelope(
        headline=_compact_text(candidate.headline, max_length=140),
        wins=[_compact_text(item, max_length=120) for item in candidate.wins][:4],
        focus_areas=[_compact_text(item, max_length=120) for item in candidate.focus_areas][:4],
        next_steps=[_compact_text(item, max_length=120) for item in candidate.next_steps][:4],
        motivation=_compact_text(candidate.motivation, max_length=180),
        risk_flags=[_compact_text(item, max_length=120) for item in candidate.risk_flags][:4],
        confidence_score=max(0, min(100, int(candidate.confidence_score))),
    )


def _build_summary_fallback(
    *,
    weekly_payload: dict[str, Any],
    monthly_payload: dict[str, Any],
    streaks_payload: dict[str, Any],
) -> _AISummaryEnvelope:
    weekly_summary = weekly_payload.get("summary", {}) if isinstance(weekly_payload.get("summary"), dict) else {}
    monthly_summary = (
        monthly_payload.get("summary", {}) if isinstance(monthly_payload.get("summary"), dict) else {}
    )
    goal_adherence = (
        weekly_summary.get("goal_adherence", {})
        if isinstance(weekly_summary.get("goal_adherence"), dict)
        else {}
    )
    streaks = streaks_payload.get("streaks", []) if isinstance(streaks_payload.get("streaks"), list) else []
    logging_streak = 0
    hydration_streak = 0
    protein_streak = 0
    for item in streaks:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        current = int(item.get("current", 0))
        if key == "meal_logging":
            logging_streak = current
        elif key == "hydration_goal":
            hydration_streak = current
        elif key == "protein_goal":
            protein_streak = current

    adherence = int(monthly_summary.get("average_goal_adherence_percent", 0))
    weekly_adherence = int(goal_adherence.get("overall_percent", 0))
    protein_consistency = int(weekly_summary.get("protein_consistency_score", 0))
    hydration_consistency = int(weekly_summary.get("hydration_consistency_score", 0))

    wins: list[str] = []
    focus: list[str] = []

    if adherence >= 75:
        wins.append(f"Your 30-day goal adherence is strong at {adherence}%.")
    if logging_streak >= 3:
        wins.append(f"You are building consistency with a {logging_streak}-day logging streak.")
    if hydration_streak >= 3:
        wins.append(f"Hydration execution is improving with a {hydration_streak}-day streak.")
    if protein_streak >= 3:
        wins.append(f"Protein consistency is improving with {protein_streak} consecutive goal-hit days.")

    if weekly_adherence < 70:
        focus.append("Stabilize daily calories and macros by using one repeatable meal template.")
    if protein_consistency < 70:
        focus.append("Anchor each main meal with a predictable protein source to reduce day-to-day swings.")
    if hydration_consistency < 70:
        focus.append("Spread water intake across the day instead of catching up late.")
    if not focus:
        focus.append("Keep the current structure and tighten one small habit for compounding progress.")

    if not wins:
        wins = ["You are actively collecting trend data that improves coaching quality every week."]

    return _AISummaryEnvelope(
        headline="Your progress is trend-positive when consistency is sustained across meals, hydration, and weekly check-ins.",
        wins=wins[:4],
        focus_areas=focus[:4],
        next_steps=[
            "Plan your first protein-focused meal before the day starts.",
            "Set two hydration checkpoints before lunch and dinner.",
            "Review your weekly trend chart once and adjust one habit only.",
        ],
        motivation="Consistency beats perfection. Keep stacking small wins and your long-term trend will keep moving in the right direction.",
        risk_flags=[],
        confidence_score=max(50, min(92, int(round((adherence + weekly_adherence) / 2)))),
    )


async def _generate_ai_summary(
    *,
    weekly_payload: dict[str, Any],
    monthly_payload: dict[str, Any],
    streaks_payload: dict[str, Any],
    achievements_payload: dict[str, Any],
) -> _AISummaryEnvelope:
    client = _get_openai_client()
    prompt_payload = {
        "weekly_summary": weekly_payload.get("summary"),
        "monthly_summary": monthly_payload.get("summary"),
        "streaks": streaks_payload.get("streaks"),
        "achievements": achievements_payload.get("achievements"),
        "instructions": {
            "tone": "concise, motivational, practical",
            "avoid": "medical advice, diagnosis, treatment, medication mentions",
            "style": "clear next actions based on trend data",
        },
    }
    user_prompt = (
        "Generate a smart analytics summary from this payload.\n"
        "Return strict JSON only in the required schema.\n"
        f"{json.dumps(prompt_payload, ensure_ascii=False)}"
    )

    try:
        response = await asyncio.wait_for(
            client.responses.create(
                model=OPENAI_ANALYTICS_MODEL,
                input=[
                    {
                        "role": "system",
                        "content": [
                            {
                                "type": "input_text",
                                "text": (
                                    "You are a premium wellness analytics assistant. "
                                    "You must provide concise motivational coaching grounded in trend data only. "
                                    "Never provide medical advice or diagnosis."
                                ),
                            }
                        ],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "input_text", "text": user_prompt}],
                    },
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "analytics_smart_summary",
                        "schema": OPENAI_ANALYTICS_SUMMARY_SCHEMA,
                        "strict": True,
                    }
                },
                max_output_tokens=900,
            ),
            timeout=OPENAI_ANALYTICS_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError("Analytics AI summary timed out.") from exc
    except OpenAIError as exc:
        raise RuntimeError(f"Analytics AI summary failed: {exc}") from exc

    raw_text = (response.output_text or "").strip()
    if not raw_text:
        raise RuntimeError("Analytics AI summary was empty.")

    payload = _extract_json_from_model_output(raw_text)
    try:
        parsed = _AISummaryEnvelope.model_validate(payload)
    except ValidationError as exc:
        raise RuntimeError("Analytics AI summary schema was invalid.") from exc
    return _sanitize_summary_payload(parsed)


async def _load_analytics_context(
    access_token: str,
    *,
    requested_date: str | None,
    timezone_name: str | None,
    user_id: str | None,
    days: int,
) -> _AnalyticsContext:
    owner_id = _normalize_user_id(user_id)
    target_timezone = _resolve_timezone(timezone_name)
    target_date = _resolve_target_date(requested_date, target_timezone)
    bounded_days = max(1, min(180, int(days)))
    start_date = target_date - timedelta(days=bounded_days - 1)

    start_local = datetime.combine(start_date, time.min, tzinfo=target_timezone)
    end_local = datetime.combine(target_date + timedelta(days=1), time.min, tzinfo=target_timezone)
    start_utc = _format_utc(start_local)
    end_utc = _format_utc(end_local)

    goals = await _fetch_latest_goals(access_token, owner_id)
    latest_goal = await _fetch_latest_goal_record(access_token, user_id=owner_id)
    profile_weight = await _fetch_profile_weight(access_token, user_id=owner_id)

    configured_water_goal: int | None = None
    target_weight_kg: float | None = None
    goal_type = "general_wellness"
    if latest_goal:
        raw_water_goal = _coerce_non_negative_number(latest_goal.get("water_target_ml"))
        configured_water_goal = int(round(raw_water_goal)) if raw_water_goal > 0 else None
        raw_weight_goal = _coerce_non_negative_number(latest_goal.get("goal_weight_kg"))
        if raw_weight_goal > 0:
            target_weight_kg = _round_number(max(MIN_WEIGHT_KG, min(MAX_WEIGHT_KG, raw_weight_goal)))
        raw_goal_type = latest_goal.get("goal_type")
        if isinstance(raw_goal_type, str) and raw_goal_type.strip():
            goal_type = raw_goal_type.strip()

    water_goal_ml = _clamp_water_goal(
        configured_water_goal,
        fallback=_resolve_water_goal_from_weight(profile_weight),
    )

    meals = await _fetch_meals_for_range(
        access_token,
        user_id=owner_id,
        start_utc=start_utc,
        end_utc=end_utc,
    )
    waters = await _fetch_water_for_range(
        access_token,
        user_id=owner_id,
        start_utc=start_utc,
        end_utc=end_utc,
    )
    weights = await _fetch_weight_for_range(
        access_token,
        user_id=owner_id,
        start_utc=start_utc,
        end_utc=end_utc,
    )

    day_map = _initialize_day_map(start_date, target_date)
    _populate_day_map(
        day_map=day_map,
        meals=meals,
        waters=waters,
        weights=weights,
        target_timezone=target_timezone,
    )

    return _AnalyticsContext(
        owner_id=owner_id,
        timezone_name=_safe_timezone_label(target_timezone),
        target_timezone=target_timezone,
        target_date=target_date,
        start_date=start_date,
        goals=goals,
        goal_type=goal_type,
        water_goal_ml=water_goal_ml,
        weight_goal_kg=target_weight_kg,
        day_map=day_map,
        weight_records=weights,
    )


async def fetch_analytics_weekly(
    access_token: str,
    *,
    requested_date: str | None,
    timezone_name: str | None,
    user_id: str | None,
    unit: str | None,
) -> dict[str, Any]:
    context = await _load_analytics_context(
        access_token,
        requested_date=requested_date,
        timezone_name=timezone_name,
        user_id=user_id,
        days=7,
    )
    resolved_unit = _normalize_weight_unit(unit)
    return _build_weekly_payload(context, unit=resolved_unit)


async def fetch_analytics_monthly(
    access_token: str,
    *,
    requested_date: str | None,
    timezone_name: str | None,
    user_id: str | None,
    unit: str | None,
) -> dict[str, Any]:
    context = await _load_analytics_context(
        access_token,
        requested_date=requested_date,
        timezone_name=timezone_name,
        user_id=user_id,
        days=30,
    )
    resolved_unit = _normalize_weight_unit(unit)
    return _build_monthly_payload(context, unit=resolved_unit)


async def fetch_analytics_streaks(
    access_token: str,
    *,
    requested_date: str | None,
    timezone_name: str | None,
    user_id: str | None,
) -> dict[str, Any]:
    context = await _load_analytics_context(
        access_token,
        requested_date=requested_date,
        timezone_name=timezone_name,
        user_id=user_id,
        days=120,
    )
    return _build_streaks_payload(context)


async def fetch_analytics_achievements(
    access_token: str,
    *,
    requested_date: str | None,
    timezone_name: str | None,
    user_id: str | None,
    unit: str | None,
) -> dict[str, Any]:
    context_30 = await _load_analytics_context(
        access_token,
        requested_date=requested_date,
        timezone_name=timezone_name,
        user_id=user_id,
        days=30,
    )
    context_120 = await _load_analytics_context(
        access_token,
        requested_date=requested_date,
        timezone_name=timezone_name,
        user_id=user_id,
        days=120,
    )
    resolved_unit = _normalize_weight_unit(unit)
    weekly_payload = _build_weekly_payload(context_30, unit=resolved_unit)
    monthly_payload = _build_monthly_payload(context_30, unit=resolved_unit)
    streaks_payload = _build_streaks_payload(context_120)
    return _build_achievements_payload(
        weekly_payload=weekly_payload,
        monthly_payload=monthly_payload,
        streaks_payload=streaks_payload,
    )


async def fetch_analytics_summary(
    access_token: str,
    *,
    requested_date: str | None,
    timezone_name: str | None,
    user_id: str | None,
    unit: str | None,
) -> dict[str, Any]:
    context_30 = await _load_analytics_context(
        access_token,
        requested_date=requested_date,
        timezone_name=timezone_name,
        user_id=user_id,
        days=30,
    )
    context_120 = await _load_analytics_context(
        access_token,
        requested_date=requested_date,
        timezone_name=timezone_name,
        user_id=user_id,
        days=120,
    )
    resolved_unit = _normalize_weight_unit(unit)

    weekly_payload = _build_weekly_payload(context_30, unit=resolved_unit)
    monthly_payload = _build_monthly_payload(context_30, unit=resolved_unit)
    streaks_payload = _build_streaks_payload(context_120)
    achievements_payload = _build_achievements_payload(
        weekly_payload=weekly_payload,
        monthly_payload=monthly_payload,
        streaks_payload=streaks_payload,
    )

    source: Literal["ai", "fallback"] = "ai"
    fallback_reason: str | None = None
    try:
        summary = await _generate_ai_summary(
            weekly_payload=weekly_payload,
            monthly_payload=monthly_payload,
            streaks_payload=streaks_payload,
            achievements_payload=achievements_payload,
        )
    except Exception as exc:
        summary = _build_summary_fallback(
            weekly_payload=weekly_payload,
            monthly_payload=monthly_payload,
            streaks_payload=streaks_payload,
        )
        source = "fallback"
        fallback_reason = str(exc).strip() or "Analytics AI summary unavailable."

    streak_lookup = {
        item["key"]: item
        for item in streaks_payload.get("streaks", [])
        if isinstance(item, dict) and isinstance(item.get("key"), str)
    }
    monthly_summary = (
        monthly_payload.get("summary", {}) if isinstance(monthly_payload.get("summary"), dict) else {}
    )
    weekly_summary = weekly_payload.get("summary", {}) if isinstance(weekly_payload.get("summary"), dict) else {}

    key_metrics = {
        "days_tracked": int(monthly_summary.get("days_tracked", 0)),
        "average_goal_adherence_percent": int(monthly_summary.get("average_goal_adherence_percent", 0)),
        "logging_streak_days": int(streak_lookup.get("meal_logging", {}).get("current", 0)),
        "hydration_streak_days": int(streak_lookup.get("hydration_goal", {}).get("current", 0)),
        "protein_streak_days": int(streak_lookup.get("protein_goal", {}).get("current", 0)),
        "weight_goal_progress_percent": weekly_summary.get("weight_goal_progress_percent"),
    }

    streak_highlights = [
        item
        for item in streaks_payload.get("streaks", [])
        if isinstance(item, dict) and int(item.get("current", 0)) > 0
    ][:3]

    return {
        "success": True,
        "source": source,
        "timezone": context_30.timezone_name,
        "period_start": context_30.start_date,
        "period_end": context_30.target_date,
        "generated_at": datetime.now(timezone.utc),
        "key_metrics": key_metrics,
        "streak_highlights": streak_highlights,
        "summary": summary.model_dump(),
        "fallback_reason": fallback_reason,
    }
