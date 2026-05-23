import { mapApiError } from "@/lib/user-facing-errors";
import type {
  AchievementMetric,
  AnalyticsAchievementsResponse,
  AnalyticsMonthlyResponse,
  AnalyticsStreaksResponse,
  AnalyticsSummaryResponse,
  AnalyticsWeeklyResponse,
  GoalAdherenceBreakdown,
  StreakMetric,
  WeeklyMacroAverage,
  WeightUnit,
} from "./types";

const DEFAULT_TIMEOUT_MS = 18_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeJsonParse(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { detail: raw || "Unexpected response body." };
  }
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  return cleaned || null;
}

function toNullableText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toText(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toInteger(value: unknown): number | null {
  const numeric = toNumber(value);
  if (numeric === null) {
    return null;
  }
  return Math.round(numeric);
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null;
  }
  return value;
}

function toWeightUnit(value: unknown): WeightUnit | null {
  return value === "lb" ? "lb" : value === "kg" ? "kg" : null;
}

function toTrend(value: unknown): "up" | "down" | "stable" | null {
  return value === "up" || value === "down" || value === "stable" ? value : null;
}

function isWeeklyMacro(value: string): value is WeeklyMacroAverage["macro"] {
  return (
    value === "calories" ||
    value === "protein_g" ||
    value === "carbs_g" ||
    value === "fat_g" ||
    value === "hydration_ml"
  );
}

function isStreakKey(value: string): value is StreakMetric["key"] {
  return (
    value === "meal_logging" ||
    value === "hydration_goal" ||
    value === "protein_goal" ||
    value === "weight_logging_weeks"
  );
}

function isStreakUnit(value: string): value is StreakMetric["unit"] {
  return value === "days" || value === "weeks";
}

function isAchievementCategory(value: string): value is AchievementMetric["category"] {
  return (
    value === "consistency" ||
    value === "hydration" ||
    value === "nutrition" ||
    value === "weight" ||
    value === "milestone"
  );
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }
  return null;
}

function withTimeout(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      window.clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", abortFromParent);
      }
    },
  };
}

async function requestJson({
  path,
  signal,
}: {
  path: string;
  signal?: AbortSignal;
}) {
  const timeout = withTimeout(signal);
  try {
    const response = await fetch(path, {
      method: "GET",
      cache: "no-store",
      signal: timeout.signal,
    });
    const payload = safeJsonParse(await response.text());

    if (!response.ok) {
      const detail = extractErrorMessage(payload);
      if (detail) {
        throw new Error(mapApiError(detail, "Unable to load analytics right now."));
      }
      if (response.status === 401) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      throw new Error("Unable to load analytics right now.");
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Analytics request timed out. Please try again.");
    }
    if (error instanceof Error) {
      throw new Error(mapApiError(error.message, "Unable to load analytics right now."));
    }
    throw new Error("Unexpected analytics request error.");
  } finally {
    timeout.cleanup();
  }
}

function parseGoalAdherence(value: unknown): GoalAdherenceBreakdown | null {
  if (!isRecord(value)) {
    return null;
  }
  const calories = toInteger(value.calories_percent);
  const protein = toInteger(value.protein_percent);
  const carbs = toInteger(value.carbs_percent);
  const fat = toInteger(value.fat_percent);
  const hydration = toInteger(value.hydration_percent);
  const overall = toInteger(value.overall_percent);
  if (
    calories === null ||
    protein === null ||
    carbs === null ||
    fat === null ||
    hydration === null ||
    overall === null
  ) {
    return null;
  }
  return {
    calories_percent: calories,
    protein_percent: protein,
    carbs_percent: carbs,
    fat_percent: fat,
    hydration_percent: hydration,
    overall_percent: overall,
  };
}

function parseDailyMetric(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const date = toText(value.date);
  const calories = toNumber(value.calories);
  const protein = toNumber(value.protein_g);
  const carbs = toNumber(value.carbs_g);
  const fat = toNumber(value.fat_g);
  const hydration = toInteger(value.hydration_ml);
  const hydrationGoal = toInteger(value.hydration_goal_ml);
  const calorieAdherence = toInteger(value.calorie_adherence_percent);
  const proteinAdherence = toInteger(value.protein_adherence_percent);
  const carbsAdherence = toInteger(value.carbs_adherence_percent);
  const fatAdherence = toInteger(value.fat_adherence_percent);
  const hydrationAdherence = toInteger(value.hydration_adherence_percent);
  const weight = value.weight === null ? null : toNumber(value.weight);
  const weightUnit = toWeightUnit(value.weight_unit);
  const mealCount = toInteger(value.meal_count);
  const tracked = toBoolean(value.tracked);
  if (
    !date ||
    calories === null ||
    protein === null ||
    carbs === null ||
    fat === null ||
    hydration === null ||
    hydrationGoal === null ||
    calorieAdherence === null ||
    proteinAdherence === null ||
    carbsAdherence === null ||
    fatAdherence === null ||
    hydrationAdherence === null ||
    (value.weight !== null && weight === null) ||
    !weightUnit ||
    mealCount === null ||
    tracked === null
  ) {
    return null;
  }
  return {
    date,
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    hydration_ml: Math.max(0, hydration),
    hydration_goal_ml: Math.max(0, hydrationGoal),
    calorie_adherence_percent: Math.max(0, calorieAdherence),
    protein_adherence_percent: Math.max(0, proteinAdherence),
    carbs_adherence_percent: Math.max(0, carbsAdherence),
    fat_adherence_percent: Math.max(0, fatAdherence),
    hydration_adherence_percent: Math.max(0, hydrationAdherence),
    weight,
    weight_unit: weightUnit,
    meal_count: Math.max(0, mealCount),
    tracked,
  };
}

function parseWeekly(payload: unknown): AnalyticsWeeklyResponse | null {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.daily_metrics) || !isRecord(payload.summary)) {
    return null;
  }
  const timezone = toText(payload.timezone);
  const summary = payload.summary;
  const weekStart = toText(summary.week_start);
  const weekEnd = toText(summary.week_end);
  const daysTracked = toInteger(summary.days_tracked);
  const calorieTrend = toTrend(summary.calorie_trend);
  const weightTrend = toTrend(summary.weight_trend);
  const proteinConsistency = toInteger(summary.protein_consistency_score);
  const hydrationConsistency = toInteger(summary.hydration_consistency_score);
  const goalAdherence = parseGoalAdherence(summary.goal_adherence);
  const weightChange = summary.weight_change === null ? null : toNumber(summary.weight_change);
  const weightGoalProgress =
    summary.weight_goal_progress_percent === null ? null : toInteger(summary.weight_goal_progress_percent);

  const weeklyMacroAverages = Array.isArray(summary.weekly_macro_averages)
    ? summary.weekly_macro_averages
        .map((item) => {
          if (!isRecord(item)) {
            return null;
          }
          const macro = toText(item.macro);
          const average = toNumber(item.average);
          const goal = toNumber(item.goal);
          const adherence = toInteger(item.adherence_percent);
          if (!macro || average === null || goal === null || adherence === null) {
            return null;
          }
          if (!isWeeklyMacro(macro)) {
            return null;
          }
          return {
            macro,
            average,
            goal,
            adherence_percent: Math.max(0, adherence),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  if (
    !timezone ||
    !weekStart ||
    !weekEnd ||
    daysTracked === null ||
    !calorieTrend ||
    !weightTrend ||
    proteinConsistency === null ||
    hydrationConsistency === null ||
    !goalAdherence
  ) {
    return null;
  }

  return {
    success: true,
    timezone,
    summary: {
      week_start: weekStart,
      week_end: weekEnd,
      days_tracked: Math.max(0, daysTracked),
      calorie_trend: calorieTrend,
      weight_trend: weightTrend,
      protein_consistency_score: Math.max(0, proteinConsistency),
      hydration_consistency_score: Math.max(0, hydrationConsistency),
      goal_adherence: goalAdherence,
      weekly_macro_averages: weeklyMacroAverages,
      weight_change: weightChange,
      weight_goal_progress_percent: weightGoalProgress,
    },
    daily_metrics: payload.daily_metrics
      .map(parseDailyMetric)
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}

function parseMonthly(payload: unknown): AnalyticsMonthlyResponse | null {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    !Array.isArray(payload.daily_metrics) ||
    !Array.isArray(payload.weekly_metrics) ||
    !isRecord(payload.summary)
  ) {
    return null;
  }
  const timezone = toText(payload.timezone);
  const summary = payload.summary;
  const periodStart = toText(summary.period_start);
  const periodEnd = toText(summary.period_end);
  const daysTracked = toInteger(summary.days_tracked);
  const avgGoalAdherence = toInteger(summary.average_goal_adherence_percent);
  const caloriesTrend = toTrend(summary.calories_trend);
  const proteinTrend = toTrend(summary.protein_trend);
  const hydrationTrend = toTrend(summary.hydration_trend);
  const weightTrend = toTrend(summary.weight_trend);

  const weeklyMetrics = payload.weekly_metrics
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const weekStart = toText(item.week_start);
      const weekEnd = toText(item.week_end);
      const avgCalories = toNumber(item.avg_calories);
      const avgProtein = toNumber(item.avg_protein_g);
      const avgHydration = toNumber(item.avg_hydration_ml);
      const adherence = toInteger(item.goal_adherence_percent);
      const weightChange = item.weight_change === null ? null : toNumber(item.weight_change);
      if (
        !weekStart ||
        !weekEnd ||
        avgCalories === null ||
        avgProtein === null ||
        avgHydration === null ||
        adherence === null
      ) {
        return null;
      }
      return {
        week_start: weekStart,
        week_end: weekEnd,
        avg_calories: avgCalories,
        avg_protein_g: avgProtein,
        avg_hydration_ml: avgHydration,
        goal_adherence_percent: Math.max(0, adherence),
        weight_change: weightChange,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (
    !timezone ||
    !periodStart ||
    !periodEnd ||
    daysTracked === null ||
    avgGoalAdherence === null ||
    !caloriesTrend ||
    !proteinTrend ||
    !hydrationTrend ||
    !weightTrend
  ) {
    return null;
  }

  return {
    success: true,
    timezone,
    summary: {
      period_start: periodStart,
      period_end: periodEnd,
      days_tracked: Math.max(0, daysTracked),
      average_goal_adherence_percent: Math.max(0, avgGoalAdherence),
      calories_trend: caloriesTrend,
      protein_trend: proteinTrend,
      hydration_trend: hydrationTrend,
      weight_trend: weightTrend,
    },
    daily_metrics: payload.daily_metrics
      .map(parseDailyMetric)
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    weekly_metrics: weeklyMetrics,
  };
}

function parseStreaks(payload: unknown): AnalyticsStreaksResponse | null {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.streaks)) {
    return null;
  }
  const asOfDate = toText(payload.as_of_date);
  if (!asOfDate) {
    return null;
  }
  const streaks = payload.streaks
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const key = toText(item.key);
      const label = toText(item.label);
      const current = toInteger(item.current);
      const best = toInteger(item.best);
      const unit = toText(item.unit);
      const isActive = toBoolean(item.is_active);
      if (!key || !label || current === null || best === null || !unit || isActive === null) {
        return null;
      }
      if (!isStreakKey(key) || !isStreakUnit(unit)) {
        return null;
      }
      return {
        key,
        label,
        current: Math.max(0, current),
        best: Math.max(0, best),
        unit,
        is_active: isActive,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    success: true,
    as_of_date: asOfDate,
    streaks,
  };
}

function parseAchievements(payload: unknown): AnalyticsAchievementsResponse | null {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.achievements)) {
    return null;
  }
  const generatedAt = toText(payload.generated_at);
  const totalUnlocked = toInteger(payload.total_unlocked);
  if (!generatedAt || totalUnlocked === null) {
    return null;
  }
  const achievements = payload.achievements
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const id = toText(item.id);
      const title = toText(item.title);
      const description = toText(item.description);
      const category = toText(item.category);
      const currentValue = toNumber(item.current_value);
      const targetValue = toNumber(item.target_value);
      const progressPercent = toInteger(item.progress_percent);
      const unlocked = toBoolean(item.unlocked);
      const unlockedAt = toNullableText(item.unlocked_at);
      if (
        !id ||
        !title ||
        !description ||
        !category ||
        currentValue === null ||
        targetValue === null ||
        progressPercent === null ||
        unlocked === null
      ) {
        return null;
      }
      if (!isAchievementCategory(category)) {
        return null;
      }
      return {
        id,
        title,
        description,
        category,
        current_value: currentValue,
        target_value: targetValue,
        progress_percent: Math.max(0, progressPercent),
        unlocked,
        unlocked_at: unlockedAt,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    success: true,
    generated_at: generatedAt,
    total_unlocked: Math.max(0, totalUnlocked),
    achievements,
  };
}

function parseSummary(payload: unknown): AnalyticsSummaryResponse | null {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.key_metrics) || !isRecord(payload.summary)) {
    return null;
  }
  const source = toText(payload.source);
  const timezone = toText(payload.timezone);
  const periodStart = toText(payload.period_start);
  const periodEnd = toText(payload.period_end);
  const generatedAt = toText(payload.generated_at);
  const fallbackReason = toNullableText(payload.fallback_reason);
  const keyMetrics = payload.key_metrics;
  const summary = payload.summary;

  const daysTracked = toInteger(keyMetrics.days_tracked);
  const avgGoal = toInteger(keyMetrics.average_goal_adherence_percent);
  const loggingStreak = toInteger(keyMetrics.logging_streak_days);
  const hydrationStreak = toInteger(keyMetrics.hydration_streak_days);
  const proteinStreak = toInteger(keyMetrics.protein_streak_days);
  const weightGoalProgress =
    keyMetrics.weight_goal_progress_percent === null ? null : toInteger(keyMetrics.weight_goal_progress_percent);

  const headline = toText(summary.headline);
  const motivation = toText(summary.motivation);
  const confidence = toInteger(summary.confidence_score);
  const wins = Array.isArray(summary.wins) ? summary.wins.map(toText).filter((item): item is string => Boolean(item)) : [];
  const focusAreas = Array.isArray(summary.focus_areas)
    ? summary.focus_areas.map(toText).filter((item): item is string => Boolean(item))
    : [];
  const nextSteps = Array.isArray(summary.next_steps)
    ? summary.next_steps.map(toText).filter((item): item is string => Boolean(item))
    : [];
  const riskFlags = Array.isArray(summary.risk_flags)
    ? summary.risk_flags.map(toText).filter((item): item is string => Boolean(item))
    : [];

  const streakHighlights = Array.isArray(payload.streak_highlights)
    ? payload.streak_highlights
        .map((item) => parseStreaks({ success: true, as_of_date: "1970-01-01", streaks: [item] })?.streaks[0] ?? null)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  if (
    !source ||
    (source !== "ai" && source !== "fallback") ||
    !timezone ||
    !periodStart ||
    !periodEnd ||
    !generatedAt ||
    daysTracked === null ||
    avgGoal === null ||
    loggingStreak === null ||
    hydrationStreak === null ||
    proteinStreak === null ||
    !headline ||
    !motivation ||
    confidence === null
  ) {
    return null;
  }

  return {
    success: true,
    source,
    timezone,
    period_start: periodStart,
    period_end: periodEnd,
    generated_at: generatedAt,
    key_metrics: {
      days_tracked: Math.max(0, daysTracked),
      average_goal_adherence_percent: Math.max(0, avgGoal),
      logging_streak_days: Math.max(0, loggingStreak),
      hydration_streak_days: Math.max(0, hydrationStreak),
      protein_streak_days: Math.max(0, proteinStreak),
      weight_goal_progress_percent: weightGoalProgress,
    },
    streak_highlights: streakHighlights,
    summary: {
      headline,
      wins,
      focus_areas: focusAreas,
      next_steps: nextSteps,
      motivation,
      risk_flags: riskFlags,
      confidence_score: Math.max(0, confidence),
    },
    fallback_reason: fallbackReason,
  };
}

type BaseParams = {
  date: string;
  timezone: string;
  unit: WeightUnit;
};

function queryWithUnit(params: BaseParams) {
  return new URLSearchParams({
    date: params.date,
    timezone: params.timezone,
    unit: params.unit,
  }).toString();
}

export async function fetchAnalyticsWeekly(params: BaseParams) {
  const payload = await requestJson({ path: `/api/analytics/weekly?${queryWithUnit(params)}` });
  const parsed = parseWeekly(payload);
  if (!parsed) {
    throw new Error("Unexpected weekly analytics response.");
  }
  return parsed;
}

export async function fetchAnalyticsMonthly(params: BaseParams) {
  const payload = await requestJson({ path: `/api/analytics/monthly?${queryWithUnit(params)}` });
  const parsed = parseMonthly(payload);
  if (!parsed) {
    throw new Error("Unexpected monthly analytics response.");
  }
  return parsed;
}

export async function fetchAnalyticsStreaks(params: Omit<BaseParams, "unit">) {
  const query = new URLSearchParams({
    date: params.date,
    timezone: params.timezone,
  }).toString();
  const payload = await requestJson({ path: `/api/analytics/streaks?${query}` });
  const parsed = parseStreaks(payload);
  if (!parsed) {
    throw new Error("Unexpected streak analytics response.");
  }
  return parsed;
}

export async function fetchAnalyticsAchievements(params: BaseParams) {
  const payload = await requestJson({ path: `/api/analytics/achievements?${queryWithUnit(params)}` });
  const parsed = parseAchievements(payload);
  if (!parsed) {
    throw new Error("Unexpected achievements analytics response.");
  }
  return parsed;
}

export async function fetchAnalyticsSummary(params: BaseParams) {
  const payload = await requestJson({ path: `/api/analytics/summary?${queryWithUnit(params)}` });
  const parsed = parseSummary(payload);
  if (!parsed) {
    throw new Error("Unexpected analytics summary response.");
  }
  return parsed;
}
