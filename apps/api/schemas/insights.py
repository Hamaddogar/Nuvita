from __future__ import annotations

from datetime import date as DateType, datetime
from typing import Literal

from pydantic import BaseModel, Field

InsightPriority = Literal["high", "medium", "low"]
InsightType = Literal[
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
]
InsightSource = Literal["ai", "fallback", "mixed"]
WeakestMacro = Literal["calories", "protein_g", "carbs_g", "fat_g"]
WeeklyTrend = Literal["improving", "stable", "needs_attention"]


class AIInsightItem(BaseModel):
    id: str
    type: InsightType
    priority: InsightPriority
    title: str = Field(min_length=3, max_length=80)
    message: str = Field(min_length=12, max_length=300)
    recommendation: str = Field(min_length=6, max_length=220)
    actionable: bool = True
    created_at: datetime


class DailyInsightSummary(BaseModel):
    goals: dict[str, float]
    consumed: dict[str, float]
    progress: dict[str, int]
    meal_count: int = Field(default=0, ge=0)
    calorie_adherence_percent: int = Field(default=0, ge=0)
    logging_streak_days: int = Field(default=0, ge=0)
    protein_goal_hit_streak_days: int = Field(default=0, ge=0)
    late_night_calorie_share_percent: int = Field(default=0, ge=0)
    goal_type: str | None = None


class AIInsightsTodayResponse(BaseModel):
    success: bool
    date: DateType
    timezone: str
    source: InsightSource
    summary: DailyInsightSummary
    insights: list[AIInsightItem]
    fallback_reason: str | None = None


class WeeklyDailyMetric(BaseModel):
    date: DateType
    calories: float = Field(default=0, ge=0)
    protein_g: float = Field(default=0, ge=0)
    carbs_g: float = Field(default=0, ge=0)
    fat_g: float = Field(default=0, ge=0)
    meal_count: int = Field(default=0, ge=0)
    calorie_adherence_percent: int = Field(default=0, ge=0)
    protein_adherence_percent: int = Field(default=0, ge=0)
    tracked: bool = False


class WeeklyInsightSummary(BaseModel):
    week_start: DateType
    week_end: DateType
    days_tracked: int = Field(default=0, ge=0, le=7)
    avg_calorie_adherence_percent: int = Field(default=0, ge=0)
    avg_protein_adherence_percent: int = Field(default=0, ge=0)
    consistency_score: int = Field(default=0, ge=0, le=100)
    best_day: DateType | None = None
    best_day_reason: str | None = None
    weakest_macro: WeakestMacro | None = None
    trend: WeeklyTrend = "stable"
    improvement_note: str = Field(min_length=8, max_length=240)
    goal_type: str | None = None


class AIInsightsWeeklyResponse(BaseModel):
    success: bool
    timezone: str
    source: InsightSource
    summary: WeeklyInsightSummary
    daily_metrics: list[WeeklyDailyMetric]
    insights: list[AIInsightItem]
    fallback_reason: str | None = None
