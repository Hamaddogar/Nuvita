from __future__ import annotations

from datetime import date as DateType, datetime
from typing import Literal

from pydantic import BaseModel, Field

TrendDirection = Literal["up", "down", "stable"]
WeightUnit = Literal["kg", "lb"]
AnalyticsSummarySource = Literal["ai", "fallback"]
StreakUnit = Literal["days", "weeks"]
AchievementCategory = Literal["consistency", "hydration", "nutrition", "weight", "milestone"]
MacroName = Literal["calories", "protein_g", "carbs_g", "fat_g", "hydration_ml"]


class GoalAdherenceBreakdown(BaseModel):
    calories_percent: int = Field(ge=0, le=100)
    protein_percent: int = Field(ge=0, le=100)
    carbs_percent: int = Field(ge=0, le=100)
    fat_percent: int = Field(ge=0, le=100)
    hydration_percent: int = Field(ge=0, le=100)
    overall_percent: int = Field(ge=0, le=100)


class DailyAnalyticsMetric(BaseModel):
    date: DateType
    calories: float = Field(default=0, ge=0)
    protein_g: float = Field(default=0, ge=0)
    carbs_g: float = Field(default=0, ge=0)
    fat_g: float = Field(default=0, ge=0)
    hydration_ml: int = Field(default=0, ge=0)
    hydration_goal_ml: int = Field(default=0, ge=0)
    calorie_adherence_percent: int = Field(default=0, ge=0, le=100)
    protein_adherence_percent: int = Field(default=0, ge=0, le=100)
    carbs_adherence_percent: int = Field(default=0, ge=0, le=100)
    fat_adherence_percent: int = Field(default=0, ge=0, le=100)
    hydration_adherence_percent: int = Field(default=0, ge=0, le=100)
    weight: float | None = Field(default=None, ge=20, le=400)
    weight_unit: WeightUnit = "kg"
    meal_count: int = Field(default=0, ge=0)
    tracked: bool = False


class WeeklyMacroAverage(BaseModel):
    macro: MacroName
    average: float = Field(default=0, ge=0)
    goal: float = Field(default=0, ge=0)
    adherence_percent: int = Field(default=0, ge=0, le=100)


class WeeklyAnalyticsSummary(BaseModel):
    week_start: DateType
    week_end: DateType
    days_tracked: int = Field(default=0, ge=0, le=7)
    calorie_trend: TrendDirection = "stable"
    weight_trend: TrendDirection = "stable"
    protein_consistency_score: int = Field(default=0, ge=0, le=100)
    hydration_consistency_score: int = Field(default=0, ge=0, le=100)
    goal_adherence: GoalAdherenceBreakdown
    weekly_macro_averages: list[WeeklyMacroAverage]
    weight_change: float | None = None
    weight_goal_progress_percent: int | None = Field(default=None, ge=0, le=100)


class AnalyticsWeeklyResponse(BaseModel):
    success: bool
    timezone: str
    summary: WeeklyAnalyticsSummary
    daily_metrics: list[DailyAnalyticsMetric]


class MonthlyWeekMetric(BaseModel):
    week_start: DateType
    week_end: DateType
    avg_calories: float = Field(default=0, ge=0)
    avg_protein_g: float = Field(default=0, ge=0)
    avg_hydration_ml: float = Field(default=0, ge=0)
    goal_adherence_percent: int = Field(default=0, ge=0, le=100)
    weight_change: float | None = None


class MonthlyAnalyticsSummary(BaseModel):
    period_start: DateType
    period_end: DateType
    days_tracked: int = Field(default=0, ge=0, le=31)
    average_goal_adherence_percent: int = Field(default=0, ge=0, le=100)
    calories_trend: TrendDirection = "stable"
    protein_trend: TrendDirection = "stable"
    hydration_trend: TrendDirection = "stable"
    weight_trend: TrendDirection = "stable"


class AnalyticsMonthlyResponse(BaseModel):
    success: bool
    timezone: str
    summary: MonthlyAnalyticsSummary
    daily_metrics: list[DailyAnalyticsMetric]
    weekly_metrics: list[MonthlyWeekMetric]


class StreakMetric(BaseModel):
    key: Literal["meal_logging", "hydration_goal", "protein_goal", "weight_logging_weeks"]
    label: str
    current: int = Field(default=0, ge=0)
    best: int = Field(default=0, ge=0)
    unit: StreakUnit
    is_active: bool = False


class AnalyticsStreaksResponse(BaseModel):
    success: bool
    as_of_date: DateType
    streaks: list[StreakMetric]


class AchievementMetric(BaseModel):
    id: str
    title: str
    description: str
    category: AchievementCategory
    current_value: float = Field(default=0, ge=0)
    target_value: float = Field(gt=0)
    progress_percent: int = Field(default=0, ge=0, le=100)
    unlocked: bool = False
    unlocked_at: datetime | None = None


class AnalyticsAchievementsResponse(BaseModel):
    success: bool
    generated_at: datetime
    total_unlocked: int = Field(default=0, ge=0)
    achievements: list[AchievementMetric]


class AnalyticsSummaryKeyMetrics(BaseModel):
    days_tracked: int = Field(default=0, ge=0)
    average_goal_adherence_percent: int = Field(default=0, ge=0, le=100)
    logging_streak_days: int = Field(default=0, ge=0)
    hydration_streak_days: int = Field(default=0, ge=0)
    protein_streak_days: int = Field(default=0, ge=0)
    weight_goal_progress_percent: int | None = Field(default=None, ge=0, le=100)


class SmartProgressSummary(BaseModel):
    headline: str = Field(min_length=12, max_length=140)
    wins: list[str] = Field(min_length=1, max_length=4)
    focus_areas: list[str] = Field(min_length=1, max_length=4)
    next_steps: list[str] = Field(min_length=1, max_length=4)
    motivation: str = Field(min_length=12, max_length=180)
    risk_flags: list[str] = Field(default_factory=list, max_length=4)
    confidence_score: int = Field(default=0, ge=0, le=100)


class AnalyticsSummaryResponse(BaseModel):
    success: bool
    source: AnalyticsSummarySource
    timezone: str
    period_start: DateType
    period_end: DateType
    generated_at: datetime
    key_metrics: AnalyticsSummaryKeyMetrics
    streak_highlights: list[StreakMetric]
    summary: SmartProgressSummary
    fallback_reason: str | None = None
