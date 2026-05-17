from __future__ import annotations

import asyncio
import copy
import json
import os
import re
import time as time_module
from dataclasses import dataclass
from datetime import date as DateType, datetime, time, timedelta, timezone
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from openai import AsyncOpenAI, OpenAIError
from pydantic import BaseModel, Field, ValidationError

from schemas.insights import (
    AIInsightItem,
    AIInsightsTodayResponse,
    AIInsightsWeeklyResponse,
    DailyInsightSummary,
    InsightPriority,
    InsightType,
    WeeklyDailyMetric,
    WeeklyInsightSummary,
)
from services.supabase_meals import (
    SupabaseServiceError,
    _coerce_non_negative_number,
    _fetch_latest_goals,
    _normalize_user_id,
    _resolve_timezone,
    _round_number,
    _supabase_get,
)

OPENAI_INSIGHTS_MODEL = os.getenv("OPENAI_INSIGHTS_MODEL", "gpt-4.1-mini")
OPENAI_INSIGHTS_TIMEOUT_SECONDS = 12.0
INSIGHTS_CACHE_TTL_SECONDS = 90
MAX_INSIGHTS = 6
MIN_INSIGHTS = 3

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

OPENAI_INSIGHTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "insights": {
            "type": "array",
            "minItems": 3,
            "maxItems": MAX_INSIGHTS,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": [
                            "calorie_balance",
                            "protein",
                            "carbs",
                            "fat",
                            "meal_timing",
                            "consistency",
                            "recommendation",
                            "motivation",
                            "warning",
                            "weekly_summary",
                        ],
                    },
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                    "title": {"type": "string", "minLength": 3, "maxLength": 80},
                    "message": {"type": "string", "minLength": 12, "maxLength": 280},
                    "recommendation": {"type": "string", "minLength": 6, "maxLength": 200},
                    "actionable": {"type": "boolean"},
                },
                "required": [
                    "type",
                    "priority",
                    "title",
                    "message",
                    "recommendation",
                    "actionable",
                ],
            },
        },
        "summary_note": {"type": ["string", "null"], "maxLength": 220},
    },
    "required": ["insights", "summary_note"],
}

_openai_client: AsyncOpenAI | None = None


@dataclass(slots=True)
class _MealRecord:
    meal_type: str
    eaten_at_utc: datetime
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


@dataclass(slots=True)
class _DayTotals:
    date: DateType
    calories: float = 0.0
    protein_g: float = 0.0
    carbs_g: float = 0.0
    fat_g: float = 0.0
    meal_count: int = 0
    has_breakfast: bool = False
    late_night_calories: float = 0.0


@dataclass(slots=True)
class _InsightDraft:
    type: InsightType
    priority: InsightPriority
    title: str
    message: str
    recommendation: str
    actionable: bool = True


@dataclass(slots=True)
class _CacheEntry:
    expires_at: float
    payload: dict[str, Any]


class _AIInsightCandidate(BaseModel):
    type: InsightType
    priority: InsightPriority
    title: str = Field(min_length=3, max_length=80)
    message: str = Field(min_length=12, max_length=280)
    recommendation: str = Field(min_length=6, max_length=200)
    actionable: bool = True


class _AIInsightEnvelope(BaseModel):
    insights: list[_AIInsightCandidate]
    summary_note: str | None = None


_INSIGHTS_CACHE: dict[str, _CacheEntry] = {}
_PRIORITY_RANK: dict[InsightPriority, int] = {"high": 3, "medium": 2, "low": 1}
_WHITESPACE_RE = re.compile(r"\s+")


def _resolve_target_date(requested_date: str | None, target_timezone: ZoneInfo | timezone) -> DateType:
    cleaned = (requested_date or "").strip()
    if not cleaned:
        return datetime.now(target_timezone).date()

    try:
        return DateType.fromisoformat(cleaned)
    except ValueError as exc:
        raise SupabaseServiceError(status_code=422, message="date must be in YYYY-MM-DD format.") from exc


def _format_utc(dt_value: datetime) -> str:
    return dt_value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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


def _ratio_percent(consumed: float, goal: float) -> int:
    if goal <= 0:
        return 0
    return int(round(max(0.0, (consumed / goal) * 100)))


def _closeness_percent(consumed: float, goal: float) -> int:
    if goal <= 0:
        return 0
    distance = abs(consumed - goal) / goal
    return int(round(max(0.0, 100 - (distance * 100))))


def _default_goal_type() -> str:
    return "general_wellness"


def _safe_timezone_label(target_timezone: ZoneInfo | timezone) -> str:
    if isinstance(target_timezone, ZoneInfo):
        return target_timezone.key
    return "UTC"


def _cache_get(cache_key: str) -> dict[str, Any] | None:
    entry = _INSIGHTS_CACHE.get(cache_key)
    if not entry:
        return None
    if entry.expires_at <= time_module.time():
        _INSIGHTS_CACHE.pop(cache_key, None)
        return None
    return copy.deepcopy(entry.payload)


def _cache_set(cache_key: str, payload: dict[str, Any]) -> None:
    _INSIGHTS_CACHE[cache_key] = _CacheEntry(
        expires_at=time_module.time() + INSIGHTS_CACHE_TTL_SECONDS,
        payload=copy.deepcopy(payload),
    )


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
        raise ValueError("OpenAI returned invalid JSON for insights.") from exc

    if not isinstance(payload, dict):
        raise ValueError("OpenAI returned an invalid insights payload.")
    return payload


def _compact_text(value: str, *, max_length: int) -> str:
    cleaned = _WHITESPACE_RE.sub(" ", value).strip()
    if len(cleaned) <= max_length:
        return cleaned
    return cleaned[: max_length - 1].rstrip() + "…"


def _contains_medical_language(*values: str) -> bool:
    merged = " ".join(values).lower()
    return any(keyword in merged for keyword in MEDICAL_KEYWORDS)


def _to_meal_record(row: dict[str, Any]) -> _MealRecord | None:
    eaten_at = _parse_iso_datetime(row.get("eaten_at"))
    if eaten_at is None:
        return None

    return _MealRecord(
        meal_type=str(row.get("meal_type") or "unknown").strip().lower() or "unknown",
        eaten_at_utc=eaten_at,
        calories=_round_number(_coerce_non_negative_number(row.get("total_calories"))),
        protein_g=_round_number(_coerce_non_negative_number(row.get("total_protein_g"))),
        carbs_g=_round_number(_coerce_non_negative_number(row.get("total_carbs_g"))),
        fat_g=_round_number(_coerce_non_negative_number(row.get("total_fat_g"))),
    )


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
            (
                "select",
                "meal_type,eaten_at,total_calories,total_protein_g,total_carbs_g,total_fat_g",
            ),
            ("user_id", f"eq.{user_id}"),
            ("eaten_at", f"gte.{start_utc}"),
            ("eaten_at", f"lt.{end_utc}"),
            ("order", "eaten_at.asc"),
            ("limit", "700"),
        ],
    )

    if not isinstance(payload, list):
        raise SupabaseServiceError(
            status_code=502,
            message="Supabase returned an invalid meals payload for AI insights.",
        )

    meals: list[_MealRecord] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        meal = _to_meal_record(row)
        if meal is not None:
            meals.append(meal)
    return meals


async def _fetch_goal_type(access_token: str, *, user_id: str) -> str | None:
    try:
        payload = await _supabase_get(
            access_token=access_token,
            path="/rest/v1/user_goals",
            params=[
                ("select", "goal_type"),
                ("user_id", f"eq.{user_id}"),
                ("order", "created_at.desc"),
                ("limit", "1"),
            ],
        )
    except SupabaseServiceError:
        return None

    if not isinstance(payload, list) or not payload:
        return None
    candidate = payload[0]
    if not isinstance(candidate, dict):
        return None

    value = candidate.get("goal_type")
    if isinstance(value, str) and value.strip():
        return value.strip().lower()
    return None


def _build_day_totals_map(
    *,
    meals: list[_MealRecord],
    target_timezone: ZoneInfo | timezone,
    start_date: DateType,
    end_date: DateType,
) -> dict[DateType, _DayTotals]:
    totals_map: dict[DateType, _DayTotals] = {}

    cursor = start_date
    while cursor <= end_date:
        totals_map[cursor] = _DayTotals(date=cursor)
        cursor += timedelta(days=1)

    for meal in meals:
        local_dt = meal.eaten_at_utc.astimezone(target_timezone)
        local_date = local_dt.date()
        day_totals = totals_map.get(local_date)
        if day_totals is None:
            continue

        day_totals.calories = _round_number(day_totals.calories + meal.calories)
        day_totals.protein_g = _round_number(day_totals.protein_g + meal.protein_g)
        day_totals.carbs_g = _round_number(day_totals.carbs_g + meal.carbs_g)
        day_totals.fat_g = _round_number(day_totals.fat_g + meal.fat_g)
        day_totals.meal_count += 1
        if meal.meal_type == "breakfast" or local_dt.hour < 11:
            day_totals.has_breakfast = True
        if local_dt.hour >= 20:
            day_totals.late_night_calories = _round_number(day_totals.late_night_calories + meal.calories)

    return totals_map


def _compute_logging_streak(day_map: dict[DateType, _DayTotals], *, end_date: DateType) -> int:
    streak = 0
    cursor = end_date
    while True:
        day = day_map.get(cursor)
        if day is None or day.meal_count <= 0:
            break
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _compute_protein_goal_streak(
    day_map: dict[DateType, _DayTotals],
    *,
    end_date: DateType,
    protein_goal: float,
) -> int:
    if protein_goal <= 0:
        return 0

    streak = 0
    cursor = end_date
    while True:
        day = day_map.get(cursor)
        if day is None or day.meal_count <= 0:
            break
        if day.protein_g < (protein_goal * 0.9):
            break
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _empty_or_unknown_goal(goals: dict[str, float]) -> bool:
    return goals.get("calories", 0) <= 0 and goals.get("protein_g", 0) <= 0


def _goal_aware_recommendation(largest_gap_macro: str) -> str:
    if largest_gap_macro == "protein_g":
        return "Add a protein anchor next meal (eggs, Greek yogurt, tofu, chicken, paneer, or lentils)."
    if largest_gap_macro == "carbs_g":
        return "Add complex carbs like oats, fruit, or rice around your active hours for steadier energy."
    if largest_gap_macro == "fat_g":
        return "Use healthy fats in small portions, such as nuts, seeds, olive oil, or avocado."
    return "Build your next plate with protein + colorful vegetables + a controlled carb portion."


def _macro_gap(goals: dict[str, float], day: _DayTotals, key: str, consumed: float) -> float:
    goal = goals.get(key, 0.0)
    if goal <= 0:
        return 0.0
    return _round_number(max(0.0, goal - consumed))


def _build_daily_rule_insights(
    *,
    day: _DayTotals,
    goals: dict[str, float],
    goal_type: str | None,
    logging_streak_days: int,
    protein_goal_streak_days: int,
) -> list[_InsightDraft]:
    insights: list[_InsightDraft] = []

    calorie_goal = goals.get("calories", 0.0)
    protein_goal = goals.get("protein_g", 0.0)
    carbs_goal = goals.get("carbs_g", 0.0)
    fat_goal = goals.get("fat_g", 0.0)

    if day.meal_count == 0:
        insights.append(
            _InsightDraft(
                type="warning",
                priority="high",
                title="No meals logged yet",
                message="I can't coach accurately until at least one meal is logged for today.",
                recommendation="Log your next meal to unlock personalized calorie and macro guidance.",
                actionable=True,
            )
        )
        insights.append(
            _InsightDraft(
                type="motivation",
                priority="low",
                title="Small start wins",
                message="Even one complete meal log helps build better trends and smarter coaching.",
                recommendation="Start with your next meal and include all major ingredients.",
                actionable=True,
            )
        )
        return insights

    if protein_goal > 0:
        protein_ratio = day.protein_g / protein_goal
        if protein_ratio < 0.75:
            protein_gap = _round_number(protein_goal - day.protein_g)
            insights.append(
                _InsightDraft(
                    type="protein",
                    priority="high",
                    title="Protein is trending low today",
                    message=f"You're about {protein_gap}g below your protein target, which may slow recovery and satiety.",
                    recommendation="Prioritize a high-protein next meal and include at least one lean protein source.",
                )
            )
        elif protein_ratio >= 1.0:
            insights.append(
                _InsightDraft(
                    type="protein",
                    priority="low",
                    title="Protein target achieved",
                    message="Great work hitting your protein target today.",
                    recommendation="Keep this pattern tomorrow by planning protein in your first two meals.",
                    actionable=False,
                )
            )

    if calorie_goal > 0:
        calorie_ratio = day.calories / calorie_goal
        if calorie_ratio > 1.15:
            over_by = _round_number(day.calories - calorie_goal)
            insights.append(
                _InsightDraft(
                    type="calorie_balance",
                    priority="high",
                    title="Calorie intake is above target",
                    message=f"You're currently about {over_by} kcal above your daily goal.",
                    recommendation="Keep dinner lighter: prioritize vegetables and protein, and reduce calorie-dense extras.",
                )
            )
        elif calorie_ratio < 0.6 and day.meal_count >= 2:
            under_by = _round_number(calorie_goal - day.calories)
            insights.append(
                _InsightDraft(
                    type="calorie_balance",
                    priority="medium",
                    title="Intake may be too low for your target",
                    message=f"You're around {under_by} kcal under target with multiple meals already logged.",
                    recommendation="Add a balanced snack with protein + carbs to support energy and adherence.",
                )
            )

    if fat_goal > 0 and day.fat_g > fat_goal * 1.25:
        excess_fat = _round_number(day.fat_g - fat_goal)
        insights.append(
            _InsightDraft(
                type="fat",
                priority="medium",
                title="Fat intake is running high",
                message=f"Fat is about {excess_fat}g over your goal, which can crowd out other targets.",
                recommendation="Use measured portions of oils/nuts and choose leaner cooking methods for remaining meals.",
            )
        )

    if carbs_goal > 0 and day.carbs_g < carbs_goal * 0.55 and day.meal_count >= 2:
        carb_gap = _round_number(carbs_goal - day.carbs_g)
        insights.append(
            _InsightDraft(
                type="carbs",
                priority="medium",
                title="Carbs are lower than your plan",
                message=f"You're about {carb_gap}g below your carb goal.",
                recommendation="Add quality carbs like fruit, oats, rice, or potatoes near active periods.",
            )
        )

    if day.meal_count >= 2 and not day.has_breakfast:
        insights.append(
            _InsightDraft(
                type="meal_timing",
                priority="medium",
                title="No early fuel logged",
                message="Your first logged intake happened later in the day, which may increase evening hunger.",
                recommendation="Try adding a protein-rich breakfast or early snack tomorrow.",
            )
        )

    if day.calories > 0 and (day.late_night_calories / day.calories) >= 0.35:
        late_share = int(round((day.late_night_calories / day.calories) * 100))
        insights.append(
            _InsightDraft(
                type="meal_timing",
                priority="medium",
                title="Large share of calories came late",
                message=f"About {late_share}% of today's calories were eaten after 8 PM.",
                recommendation="Shift part of dinner calories earlier in the day to smooth hunger and energy.",
            )
        )

    if logging_streak_days >= 4:
        insights.append(
            _InsightDraft(
                type="consistency",
                priority="low",
                title="Strong logging consistency",
                message=f"You've logged meals for {logging_streak_days} consecutive days.",
                recommendation="Keep the streak alive tomorrow with at least two complete meal logs.",
                actionable=False,
            )
        )

    if protein_goal_streak_days >= 3:
        insights.append(
            _InsightDraft(
                type="motivation",
                priority="low",
                title="Protein streak unlocked",
                message=f"You've hit protein goals for {protein_goal_streak_days} days in a row.",
                recommendation="Repeat today's protein structure to extend the streak.",
                actionable=False,
            )
        )

    macro_gaps = {
        "protein_g": _macro_gap(goals, day, "protein_g", day.protein_g),
        "carbs_g": _macro_gap(goals, day, "carbs_g", day.carbs_g),
        "fat_g": _macro_gap(goals, day, "fat_g", day.fat_g),
    }
    largest_gap_macro = max(macro_gaps, key=macro_gaps.get)
    if macro_gaps[largest_gap_macro] > 0:
        goal_context = goal_type or _default_goal_type()
        insights.append(
            _InsightDraft(
                type="recommendation",
                priority="medium",
                title="Smart next-meal adjustment",
                message=f"For your {goal_context.replace('_', ' ')} goal, your biggest remaining macro gap is {largest_gap_macro.replace('_g', '')}.",
                recommendation=_goal_aware_recommendation(largest_gap_macro),
            )
        )

    return insights


def _macro_closeness(consumed: float, goal: float) -> float | None:
    if goal <= 0:
        return None
    return max(0.0, 100.0 - ((abs(consumed - goal) / goal) * 100.0))


def _day_quality_score(day: _DayTotals, goals: dict[str, float]) -> float:
    parts: list[float] = []
    weights: list[float] = []

    calorie_closeness = _macro_closeness(day.calories, goals.get("calories", 0.0))
    if calorie_closeness is not None:
        parts.append(calorie_closeness)
        weights.append(0.4)

    protein_closeness = _macro_closeness(day.protein_g, goals.get("protein_g", 0.0))
    if protein_closeness is not None:
        parts.append(protein_closeness)
        weights.append(0.3)

    carbs_closeness = _macro_closeness(day.carbs_g, goals.get("carbs_g", 0.0))
    if carbs_closeness is not None:
        parts.append(carbs_closeness)
        weights.append(0.15)

    fat_closeness = _macro_closeness(day.fat_g, goals.get("fat_g", 0.0))
    if fat_closeness is not None:
        parts.append(fat_closeness)
        weights.append(0.15)

    if not parts or not weights:
        return 0.0

    weight_sum = sum(weights)
    if weight_sum <= 0:
        return 0.0
    normalized_weights = [weight / weight_sum for weight in weights]
    score = sum(part * weight for part, weight in zip(parts, normalized_weights))
    return max(0.0, min(100.0, score))


def _derive_weekly_trend(day_scores: list[float]) -> str:
    if len(day_scores) < 4:
        return "stable"

    first_count = min(3, len(day_scores))
    last_count = min(3, len(day_scores))

    first_avg = sum(day_scores[:first_count]) / float(first_count)
    last_avg = sum(day_scores[-last_count:]) / float(last_count)
    delta = last_avg - first_avg

    if delta >= 8:
        return "improving"
    if delta <= -8:
        return "needs_attention"
    return "stable"


def _build_weekly_summary_and_metrics(
    *,
    day_map: dict[DateType, _DayTotals],
    goals: dict[str, float],
    week_start: DateType,
    week_end: DateType,
    goal_type: str | None,
) -> tuple[list[WeeklyDailyMetric], WeeklyInsightSummary]:
    metrics: list[WeeklyDailyMetric] = []
    tracked_days: list[_DayTotals] = []
    tracked_day_scores: list[float] = []

    cursor = week_start
    while cursor <= week_end:
        day = day_map.get(cursor, _DayTotals(date=cursor))
        tracked = day.meal_count > 0
        if tracked:
            tracked_days.append(day)
            tracked_day_scores.append(_day_quality_score(day, goals))

        metrics.append(
            WeeklyDailyMetric(
                date=cursor,
                calories=_round_number(day.calories),
                protein_g=_round_number(day.protein_g),
                carbs_g=_round_number(day.carbs_g),
                fat_g=_round_number(day.fat_g),
                meal_count=max(0, int(day.meal_count)),
                calorie_adherence_percent=_closeness_percent(day.calories, goals.get("calories", 0.0)),
                protein_adherence_percent=_closeness_percent(day.protein_g, goals.get("protein_g", 0.0)),
                tracked=tracked,
            )
        )
        cursor += timedelta(days=1)

    if tracked_days:
        avg_calorie_adherence = int(
            round(
                sum(_closeness_percent(day.calories, goals.get("calories", 0.0)) for day in tracked_days)
                / len(tracked_days)
            )
        )
        avg_protein_adherence = int(
            round(
                sum(_closeness_percent(day.protein_g, goals.get("protein_g", 0.0)) for day in tracked_days)
                / len(tracked_days)
            )
        )
        avg_quality_score = sum(tracked_day_scores) / len(tracked_day_scores)
    else:
        avg_calorie_adherence = 0
        avg_protein_adherence = 0
        avg_quality_score = 0.0

    days_tracked = len(tracked_days)
    consistency_score = int(
        round(((days_tracked / 7.0) * 50.0) + ((avg_quality_score / 100.0) * 50.0))
    )
    consistency_score = max(0, min(100, consistency_score))

    best_day: DateType | None = None
    best_day_reason: str | None = None
    if tracked_days:
        best_day_record = max(tracked_days, key=lambda day: _day_quality_score(day, goals))
        best_day = best_day_record.date
        best_day_reason = (
            f"Most balanced day with { _closeness_percent(best_day_record.calories, goals.get('calories', 0.0)) }% calorie adherence "
            f"and { _closeness_percent(best_day_record.protein_g, goals.get('protein_g', 0.0)) }% protein adherence."
        )

    macro_closeness: dict[str, float] = {}
    for macro_name, goal_key in (
        ("calories", "calories"),
        ("protein_g", "protein_g"),
        ("carbs_g", "carbs_g"),
        ("fat_g", "fat_g"),
    ):
        goal_value = goals.get(goal_key, 0.0)
        if goal_value <= 0 or not tracked_days:
            continue
        macro_values: list[float] = []
        for day in tracked_days:
            consumed = getattr(day, goal_key)
            macro_values.append(float(_closeness_percent(consumed, goal_value)))
        if macro_values:
            macro_closeness[macro_name] = sum(macro_values) / len(macro_values)

    weakest_macro = min(macro_closeness, key=macro_closeness.get) if macro_closeness else None

    trend = _derive_weekly_trend(tracked_day_scores)
    if days_tracked == 0:
        improvement_note = "Start with consistent meal logging this week to unlock high-confidence coaching."
    elif trend == "improving":
        improvement_note = "Your nutrition consistency improved through the week—keep repeating your best-day structure."
    elif trend == "needs_attention":
        improvement_note = "Your weekly consistency slipped in later days; pre-plan at least one anchor meal each day."
    else:
        if weakest_macro == "protein_g":
            improvement_note = "Protein adherence is your biggest opportunity this week."
        elif weakest_macro == "carbs_g":
            improvement_note = "Carb distribution was the least consistent this week; tighten portions around active hours."
        elif weakest_macro == "fat_g":
            improvement_note = "Fat intake varied the most this week; measured portions can stabilize your totals."
        else:
            improvement_note = "You're stable this week—small improvements in meal timing can raise adherence further."

    summary = WeeklyInsightSummary(
        week_start=week_start,
        week_end=week_end,
        days_tracked=days_tracked,
        avg_calorie_adherence_percent=avg_calorie_adherence,
        avg_protein_adherence_percent=avg_protein_adherence,
        consistency_score=consistency_score,
        best_day=best_day,
        best_day_reason=best_day_reason,
        weakest_macro=weakest_macro,
        trend=trend,  # type: ignore[arg-type]
        improvement_note=improvement_note,
        goal_type=goal_type,
    )
    return metrics, summary


def _build_weekly_rule_insights(
    *,
    summary: WeeklyInsightSummary,
    goals: dict[str, float],
) -> list[_InsightDraft]:
    insights: list[_InsightDraft] = []

    if summary.days_tracked == 0:
        insights.append(
            _InsightDraft(
                type="warning",
                priority="high",
                title="No tracked days in this window",
                message="I need at least one logged day to generate personalized weekly coaching.",
                recommendation="Log meals for at least 3 days this week to unlock stronger weekly insights.",
            )
        )
        return insights

    if summary.days_tracked < 4:
        insights.append(
            _InsightDraft(
                type="consistency",
                priority="high",
                title="Logging consistency is the top focus",
                message=f"Only {summary.days_tracked}/7 days were tracked, which limits coaching accuracy.",
                recommendation="Aim for at least 5 tracked days next week.",
            )
        )
    elif summary.consistency_score >= 70:
        insights.append(
            _InsightDraft(
                type="consistency",
                priority="low",
                title="Solid weekly consistency",
                message=f"You tracked {summary.days_tracked}/7 days with a consistency score of {summary.consistency_score}.",
                recommendation="Keep this rhythm and tighten one macro for faster progress.",
                actionable=False,
            )
        )

    if summary.avg_calorie_adherence_percent < 70 and goals.get("calories", 0) > 0:
        insights.append(
            _InsightDraft(
                type="calorie_balance",
                priority="medium",
                title="Calorie adherence can improve",
                message=f"Average calorie adherence was {summary.avg_calorie_adherence_percent}%.",
                recommendation="Plan one repeatable meal template for weekdays to reduce intake variability.",
            )
        )
    elif summary.avg_calorie_adherence_percent >= 85 and goals.get("calories", 0) > 0:
        insights.append(
            _InsightDraft(
                type="weekly_summary",
                priority="low",
                title="Calorie adherence was strong",
                message=f"You averaged {summary.avg_calorie_adherence_percent}% calorie adherence this week.",
                recommendation="Maintain this structure and focus on protein quality for next-level progress.",
                actionable=False,
            )
        )

    if summary.weakest_macro == "protein_g":
        insights.append(
            _InsightDraft(
                type="protein",
                priority="medium",
                title="Protein was the weakest macro",
                message="Protein adherence lagged compared with your other targets this week.",
                recommendation="Anchor each main meal with 25–35g protein to improve consistency.",
            )
        )
    elif summary.weakest_macro == "carbs_g":
        insights.append(
            _InsightDraft(
                type="carbs",
                priority="medium",
                title="Carb consistency was uneven",
                message="Carb intake varied significantly day to day this week.",
                recommendation="Keep carb portions more consistent and place larger portions around activity.",
            )
        )
    elif summary.weakest_macro == "fat_g":
        insights.append(
            _InsightDraft(
                type="fat",
                priority="medium",
                title="Fat intake varied most",
                message="Fat targets were the least consistent macro this week.",
                recommendation="Use measured oils, nuts, and dressings to control hidden fat calories.",
            )
        )

    if summary.trend == "improving":
        insights.append(
            _InsightDraft(
                type="motivation",
                priority="low",
                title="Weekly trend is improving",
                message="Your nutrition quality improved from earlier to later in the week.",
                recommendation="Repeat your best-day meal flow as your default template.",
                actionable=False,
            )
        )
    elif summary.trend == "needs_attention":
        insights.append(
            _InsightDraft(
                type="warning",
                priority="medium",
                title="Weekly momentum dipped",
                message="Your later-week nutrition quality dropped versus earlier days.",
                recommendation="Pre-plan dinner and one protein snack for high-risk days.",
            )
        )

    if summary.best_day is not None and summary.best_day_reason:
        insights.append(
            _InsightDraft(
                type="weekly_summary",
                priority="low",
                title=f"Best day: {summary.best_day.isoformat()}",
                message=summary.best_day_reason,
                recommendation="Use this day as your repeatable baseline next week.",
                actionable=False,
            )
        )

    return insights


def _rank_and_dedupe_insights(insights: list[_InsightDraft]) -> list[_InsightDraft]:
    deduped: list[_InsightDraft] = []
    seen: set[str] = set()
    for item in insights:
        key = f"{item.type}:{item.priority}:{item.title.strip().lower()}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    deduped.sort(key=lambda insight: _PRIORITY_RANK[insight.priority], reverse=True)
    return deduped[:MAX_INSIGHTS]


def _ensure_minimum_insights(insights: list[_InsightDraft], *, goal_type: str | None) -> list[_InsightDraft]:
    if len(insights) >= MIN_INSIGHTS:
        return insights

    fillers = [
        _InsightDraft(
            type="recommendation",
            priority="medium",
            title="Action for your next meal",
            message="Use a balanced plate template to improve adherence without overthinking every meal.",
            recommendation="Build each main meal around protein + vegetables + controlled carbs.",
        ),
        _InsightDraft(
            type="motivation",
            priority="low",
            title="Progress compounds with consistency",
            message=f"Daily consistency matters more than perfection for { (goal_type or _default_goal_type()).replace('_', ' ') } goals.",
            recommendation="Keep logging and make one small improvement at your next meal.",
            actionable=False,
        ),
        _InsightDraft(
            type="consistency",
            priority="low",
            title="Use one repeatable anchor meal",
            message="A repeatable breakfast or lunch can stabilize your weekly calorie and macro adherence.",
            recommendation="Pick one balanced meal template and repeat it on your busiest days.",
        ),
    ]

    merged = insights[:]
    for filler in fillers:
        if len(merged) >= MIN_INSIGHTS:
            break
        merged.append(filler)
    return merged


def _finalize_insight_items(drafts: list[_InsightDraft]) -> list[AIInsightItem]:
    now_utc = datetime.now(timezone.utc)
    return [
        AIInsightItem(
            id=f"ins_{uuid4().hex[:12]}",
            type=draft.type,
            priority=draft.priority,
            title=_compact_text(draft.title, max_length=80),
            message=_compact_text(draft.message, max_length=300),
            recommendation=_compact_text(draft.recommendation, max_length=220),
            actionable=draft.actionable,
            created_at=now_utc,
        )
        for draft in drafts
    ]


def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client


def _build_ai_insights_input(
    *,
    mode: str,
    goal_type: str | None,
    context: dict[str, Any],
    rule_insights: list[_InsightDraft],
) -> str:
    compact_rule_insights = [
        {
            "type": insight.type,
            "priority": insight.priority,
            "title": insight.title,
            "message": insight.message,
            "recommendation": insight.recommendation,
            "actionable": insight.actionable,
        }
        for insight in rule_insights
    ]
    prompt_payload = {
        "mode": mode,
        "goal_type": goal_type or _default_goal_type(),
        "context": context,
        "baseline_insights": compact_rule_insights,
    }
    return json.dumps(prompt_payload, ensure_ascii=False)


def _sanitize_ai_candidates(candidates: list[_AIInsightCandidate]) -> list[_InsightDraft]:
    sanitized: list[_InsightDraft] = []
    for candidate in candidates:
        title = _compact_text(candidate.title, max_length=80)
        message = _compact_text(candidate.message, max_length=300)
        recommendation = _compact_text(candidate.recommendation, max_length=220)

        if _contains_medical_language(title, message, recommendation):
            continue
        sanitized.append(
            _InsightDraft(
                type=candidate.type,
                priority=candidate.priority,
                title=title,
                message=message,
                recommendation=recommendation,
                actionable=bool(candidate.actionable),
            )
        )
    return sanitized


async def _generate_ai_refined_insights(
    *,
    mode: str,
    goal_type: str | None,
    context: dict[str, Any],
    rule_insights: list[_InsightDraft],
) -> list[_InsightDraft]:
    client = _get_openai_client()
    prompt_payload = _build_ai_insights_input(
        mode=mode,
        goal_type=goal_type,
        context=context,
        rule_insights=rule_insights,
    )
    system_prompt = (
        "You are a premium nutrition coaching assistant. "
        "Return strict JSON only. Use a supportive, concise, actionable tone. "
        "Never provide medical advice, diagnosis, treatment, or medication guidance. "
        "Keep guidance practical, safe, and non-judgmental."
    )
    user_prompt = (
        "Refine the baseline insights using this user context and return 3-6 high-quality coaching cards. "
        "Preserve critical warnings when relevant. "
        "Use clear, concrete recommendations and avoid generic filler.\n"
        f"{prompt_payload}"
    )

    try:
        response = await asyncio.wait_for(
            client.responses.create(
                model=OPENAI_INSIGHTS_MODEL,
                input=[
                    {
                        "role": "system",
                        "content": [{"type": "input_text", "text": system_prompt}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "input_text", "text": user_prompt}],
                    },
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": f"{mode}_insights",
                        "schema": OPENAI_INSIGHTS_SCHEMA,
                        "strict": True,
                    }
                },
                max_output_tokens=1200,
            ),
            timeout=OPENAI_INSIGHTS_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError("OpenAI insights request timed out.") from exc
    except OpenAIError as exc:
        raise RuntimeError(f"OpenAI insights request failed: {exc}") from exc

    raw_text = (response.output_text or "").strip()
    if not raw_text:
        raise RuntimeError("OpenAI returned an empty insights response.")

    payload = _extract_json_from_model_output(raw_text)
    try:
        structured = _AIInsightEnvelope.model_validate(payload)
    except ValidationError as exc:
        raise RuntimeError("OpenAI returned an invalid insights schema.") from exc

    sanitized = _sanitize_ai_candidates(structured.insights)
    if len(sanitized) < 2:
        raise RuntimeError("OpenAI response did not contain enough safe insights.")
    return sanitized


def _merge_ai_and_rule_insights(
    *,
    ai_insights: list[_InsightDraft],
    rule_insights: list[_InsightDraft],
) -> tuple[list[_InsightDraft], str]:
    merged = ai_insights[:]
    ai_signatures = {(item.type, item.priority) for item in ai_insights}
    missing_critical = [
        item
        for item in rule_insights
        if item.priority == "high" and (item.type, "high") not in ai_signatures
    ]

    source = "ai"
    if missing_critical:
        merged.extend(missing_critical)
        source = "mixed"

    return _rank_and_dedupe_insights(merged), source


def _minimal_safe_fallback_insights(goal_type: str | None) -> list[_InsightDraft]:
    return [
        _InsightDraft(
            type="recommendation",
            priority="medium",
            title="Keep logging to sharpen coaching",
            message="More complete meal logs lead to better insight quality and more specific recommendations.",
            recommendation="Log every meal with realistic portions and ingredients.",
        ),
        _InsightDraft(
            type="motivation",
            priority="low",
            title="Consistency beats perfection",
            message=f"Steady tracking is the fastest path toward { (goal_type or _default_goal_type()).replace('_', ' ') } goals.",
            recommendation="Focus on one actionable improvement for your next meal.",
            actionable=False,
        ),
        _InsightDraft(
            type="consistency",
            priority="low",
            title="One logged day creates momentum",
            message="Build momentum with complete logs today, then extend to the rest of the week.",
            recommendation="Log each meal today and include portions for better coaching precision.",
            actionable=True,
        ),
    ]


async def fetch_ai_insights_today(
    access_token: str,
    *,
    requested_date: str | None,
    timezone_name: str | None,
    user_id: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    target_timezone = _resolve_timezone(timezone_name)
    target_date = _resolve_target_date(requested_date, target_timezone)
    tz_label = _safe_timezone_label(target_timezone)

    cache_key = f"today:{owner_id}:{target_date.isoformat()}:{tz_label}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    goals = await _fetch_latest_goals(access_token, owner_id)
    goal_type = await _fetch_goal_type(access_token, user_id=owner_id)
    goal_type = goal_type or _default_goal_type()

    lookback_start = target_date - timedelta(days=13)
    range_start_local = datetime.combine(lookback_start, time.min, tzinfo=target_timezone)
    range_end_local = datetime.combine(target_date + timedelta(days=1), time.min, tzinfo=target_timezone)
    meals = await _fetch_meals_for_range(
        access_token,
        user_id=owner_id,
        start_utc=_format_utc(range_start_local),
        end_utc=_format_utc(range_end_local),
    )

    day_map = _build_day_totals_map(
        meals=meals,
        target_timezone=target_timezone,
        start_date=lookback_start,
        end_date=target_date,
    )
    today_totals = day_map.get(target_date, _DayTotals(date=target_date))
    logging_streak = _compute_logging_streak(day_map, end_date=target_date)
    protein_streak = _compute_protein_goal_streak(
        day_map,
        end_date=target_date,
        protein_goal=goals.get("protein_g", 0.0),
    )

    progress = {
        "calories_percent": _ratio_percent(today_totals.calories, goals.get("calories", 0.0)),
        "protein_percent": _ratio_percent(today_totals.protein_g, goals.get("protein_g", 0.0)),
        "carbs_percent": _ratio_percent(today_totals.carbs_g, goals.get("carbs_g", 0.0)),
        "fat_percent": _ratio_percent(today_totals.fat_g, goals.get("fat_g", 0.0)),
    }

    late_night_share_percent = (
        int(round((today_totals.late_night_calories / today_totals.calories) * 100))
        if today_totals.calories > 0
        else 0
    )

    summary = DailyInsightSummary(
        goals=goals,
        consumed={
            "calories": _round_number(today_totals.calories),
            "protein_g": _round_number(today_totals.protein_g),
            "carbs_g": _round_number(today_totals.carbs_g),
            "fat_g": _round_number(today_totals.fat_g),
        },
        progress=progress,
        meal_count=today_totals.meal_count,
        calorie_adherence_percent=_closeness_percent(today_totals.calories, goals.get("calories", 0.0)),
        logging_streak_days=logging_streak,
        protein_goal_hit_streak_days=protein_streak,
        late_night_calorie_share_percent=max(0, late_night_share_percent),
        goal_type=goal_type,
    )

    rule_insights = _build_daily_rule_insights(
        day=today_totals,
        goals=goals,
        goal_type=goal_type,
        logging_streak_days=logging_streak,
        protein_goal_streak_days=protein_streak,
    )
    rule_insights = _rank_and_dedupe_insights(rule_insights)
    rule_insights = _ensure_minimum_insights(rule_insights, goal_type=goal_type)

    source = "fallback"
    fallback_reason: str | None = None
    final_drafts = rule_insights

    ai_context = {
        "date": target_date.isoformat(),
        "goals": goals,
        "consumed": summary.consumed,
        "progress": summary.progress,
        "meal_count": summary.meal_count,
        "logging_streak_days": summary.logging_streak_days,
        "protein_goal_hit_streak_days": summary.protein_goal_hit_streak_days,
        "late_night_calorie_share_percent": summary.late_night_calorie_share_percent,
    }

    if not _empty_or_unknown_goal(goals):
        try:
            ai_drafts = await _generate_ai_refined_insights(
                mode="today",
                goal_type=goal_type,
                context=ai_context,
                rule_insights=rule_insights,
            )
            final_drafts, source = _merge_ai_and_rule_insights(ai_insights=ai_drafts, rule_insights=rule_insights)
        except RuntimeError as exc:
            fallback_reason = _compact_text(str(exc), max_length=200)
    else:
        fallback_reason = "Goal targets are not configured yet; using rule-based coaching."

    final_drafts = _rank_and_dedupe_insights(final_drafts)
    final_drafts = _ensure_minimum_insights(final_drafts, goal_type=goal_type)
    if not final_drafts:
        final_drafts = _minimal_safe_fallback_insights(goal_type=goal_type)

    response = AIInsightsTodayResponse(
        success=True,
        date=target_date,
        timezone=tz_label,
        source=source,  # type: ignore[arg-type]
        summary=summary,
        insights=_finalize_insight_items(final_drafts),
        fallback_reason=fallback_reason,
    )

    payload = response.model_dump(mode="json")
    _cache_set(cache_key, payload)
    return payload


async def fetch_ai_insights_weekly(
    access_token: str,
    *,
    requested_date: str | None,
    timezone_name: str | None,
    user_id: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    target_timezone = _resolve_timezone(timezone_name)
    week_end = _resolve_target_date(requested_date, target_timezone)
    week_start = week_end - timedelta(days=6)
    tz_label = _safe_timezone_label(target_timezone)

    cache_key = f"weekly:{owner_id}:{week_start.isoformat()}:{week_end.isoformat()}:{tz_label}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    goals = await _fetch_latest_goals(access_token, owner_id)
    goal_type = await _fetch_goal_type(access_token, user_id=owner_id)
    goal_type = goal_type or _default_goal_type()

    range_start_local = datetime.combine(week_start, time.min, tzinfo=target_timezone)
    range_end_local = datetime.combine(week_end + timedelta(days=1), time.min, tzinfo=target_timezone)
    meals = await _fetch_meals_for_range(
        access_token,
        user_id=owner_id,
        start_utc=_format_utc(range_start_local),
        end_utc=_format_utc(range_end_local),
    )
    day_map = _build_day_totals_map(
        meals=meals,
        target_timezone=target_timezone,
        start_date=week_start,
        end_date=week_end,
    )
    daily_metrics, summary = _build_weekly_summary_and_metrics(
        day_map=day_map,
        goals=goals,
        week_start=week_start,
        week_end=week_end,
        goal_type=goal_type,
    )

    rule_insights = _build_weekly_rule_insights(summary=summary, goals=goals)
    rule_insights = _rank_and_dedupe_insights(rule_insights)
    rule_insights = _ensure_minimum_insights(rule_insights, goal_type=goal_type)

    source = "fallback"
    fallback_reason: str | None = None
    final_drafts = rule_insights

    ai_context = {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "days_tracked": summary.days_tracked,
        "avg_calorie_adherence_percent": summary.avg_calorie_adherence_percent,
        "avg_protein_adherence_percent": summary.avg_protein_adherence_percent,
        "consistency_score": summary.consistency_score,
        "best_day": summary.best_day.isoformat() if summary.best_day else None,
        "weakest_macro": summary.weakest_macro,
        "trend": summary.trend,
        "improvement_note": summary.improvement_note,
    }

    if not _empty_or_unknown_goal(goals):
        try:
            ai_drafts = await _generate_ai_refined_insights(
                mode="weekly",
                goal_type=goal_type,
                context=ai_context,
                rule_insights=rule_insights,
            )
            final_drafts, source = _merge_ai_and_rule_insights(ai_insights=ai_drafts, rule_insights=rule_insights)
        except RuntimeError as exc:
            fallback_reason = _compact_text(str(exc), max_length=200)
    else:
        fallback_reason = "Goal targets are not configured yet; using rule-based coaching."

    final_drafts = _rank_and_dedupe_insights(final_drafts)
    final_drafts = _ensure_minimum_insights(final_drafts, goal_type=goal_type)
    if not final_drafts:
        final_drafts = _minimal_safe_fallback_insights(goal_type=goal_type)

    response = AIInsightsWeeklyResponse(
        success=True,
        timezone=tz_label,
        source=source,  # type: ignore[arg-type]
        summary=summary,
        daily_metrics=daily_metrics,
        insights=_finalize_insight_items(final_drafts),
        fallback_reason=fallback_reason,
    )

    payload = response.model_dump(mode="json")
    _cache_set(cache_key, payload)
    return payload
