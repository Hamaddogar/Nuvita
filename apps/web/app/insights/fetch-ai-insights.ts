import type {
  AIInsightItem,
  AIInsightsTodayResponse,
  AIInsightsWeeklyResponse,
  InsightPriority,
  InsightSource,
  InsightType,
} from "./types";

const DEFAULT_TIMEOUT_MS = 20_000;

type FetchInsightsParams = {
  date: string;
  timezone: string;
  timeoutMs?: number;
};

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

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function readText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return value.trim();
}

function readNullableText(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return readText(value);
}

function readInsightType(value: unknown): InsightType | null {
  const candidate = readText(value);
  if (!candidate) {
    return null;
  }
  const allowed: InsightType[] = [
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
  ];
  return allowed.includes(candidate as InsightType) ? (candidate as InsightType) : null;
}

function readInsightPriority(value: unknown): InsightPriority | null {
  const candidate = readText(value);
  if (!candidate) {
    return null;
  }
  const allowed: InsightPriority[] = ["high", "medium", "low"];
  return allowed.includes(candidate as InsightPriority) ? (candidate as InsightPriority) : null;
}

function readInsightSource(value: unknown): InsightSource | null {
  const candidate = readText(value);
  if (!candidate) {
    return null;
  }
  const allowed: InsightSource[] = ["ai", "fallback", "mixed"];
  return allowed.includes(candidate as InsightSource) ? (candidate as InsightSource) : null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null;
  }
  return value;
}

function readInsightItem(value: unknown): AIInsightItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readText(value.id);
  const type = readInsightType(value.type);
  const priority = readInsightPriority(value.priority);
  const title = readText(value.title);
  const message = readText(value.message);
  const recommendation = readText(value.recommendation);
  const actionable = readBoolean(value.actionable);
  const createdAt = readText(value.created_at);

  if (!id || !type || !priority || !title || !message || !recommendation || actionable === null || !createdAt) {
    return null;
  }

  return {
    id,
    type,
    priority,
    title,
    message,
    recommendation,
    actionable,
    created_at: createdAt,
  };
}

function readMacroBlock(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const calories = readNumber(value.calories);
  const protein = readNumber(value.protein_g);
  const carbs = readNumber(value.carbs_g);
  const fat = readNumber(value.fat_g);

  if (calories === null || protein === null || carbs === null || fat === null) {
    return null;
  }
  return {
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
  };
}

function readProgress(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const calories = readNumber(value.calories_percent);
  const protein = readNumber(value.protein_percent);
  const carbs = readNumber(value.carbs_percent);
  const fat = readNumber(value.fat_percent);

  if (calories === null || protein === null || carbs === null || fat === null) {
    return null;
  }
  return {
    calories_percent: calories,
    protein_percent: protein,
    carbs_percent: carbs,
    fat_percent: fat,
  };
}

function readTodayInsights(payload: unknown): AIInsightsTodayResponse | null {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }

  const date = readText(payload.date);
  const timezone = readText(payload.timezone);
  const source = readInsightSource(payload.source);
  const fallbackReason = readNullableText(payload.fallback_reason);
  const summary = payload.summary;
  const insights = payload.insights;

  if (!date || !timezone || !source || !isRecord(summary) || !Array.isArray(insights)) {
    return null;
  }

  const goals = readMacroBlock(summary.goals);
  const consumed = readMacroBlock(summary.consumed);
  const progress = readProgress(summary.progress);
  const mealCount = readNumber(summary.meal_count);
  const calorieAdherence = readNumber(summary.calorie_adherence_percent);
  const loggingStreak = readNumber(summary.logging_streak_days);
  const proteinStreak = readNumber(summary.protein_goal_hit_streak_days);
  const lateShare = readNumber(summary.late_night_calorie_share_percent);
  const goalType = readNullableText(summary.goal_type);

  if (
    !goals ||
    !consumed ||
    !progress ||
    mealCount === null ||
    calorieAdherence === null ||
    loggingStreak === null ||
    proteinStreak === null ||
    lateShare === null
  ) {
    return null;
  }

  const normalizedInsights = insights.map(readInsightItem).filter((item): item is AIInsightItem => Boolean(item));

  return {
    success: true,
    date,
    timezone,
    source,
    summary: {
      goals,
      consumed,
      progress,
      meal_count: Math.max(0, Math.round(mealCount)),
      calorie_adherence_percent: Math.max(0, Math.round(calorieAdherence)),
      logging_streak_days: Math.max(0, Math.round(loggingStreak)),
      protein_goal_hit_streak_days: Math.max(0, Math.round(proteinStreak)),
      late_night_calorie_share_percent: Math.max(0, Math.round(lateShare)),
      goal_type: goalType,
    },
    insights: normalizedInsights,
    fallback_reason: fallbackReason,
  };
}

function readWeeklyInsights(payload: unknown): AIInsightsWeeklyResponse | null {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }

  const timezone = readText(payload.timezone);
  const source = readInsightSource(payload.source);
  const fallbackReason = readNullableText(payload.fallback_reason);
  const summary = payload.summary;
  const dailyMetrics = payload.daily_metrics;
  const insights = payload.insights;

  if (!timezone || !source || !isRecord(summary) || !Array.isArray(dailyMetrics) || !Array.isArray(insights)) {
    return null;
  }

  const weekStart = readText(summary.week_start);
  const weekEnd = readText(summary.week_end);
  const daysTracked = readNumber(summary.days_tracked);
  const avgCalorieAdherence = readNumber(summary.avg_calorie_adherence_percent);
  const avgProteinAdherence = readNumber(summary.avg_protein_adherence_percent);
  const consistencyScore = readNumber(summary.consistency_score);
  const bestDay = readNullableText(summary.best_day);
  const bestDayReason = readNullableText(summary.best_day_reason);
  const weakestMacro = readNullableText(summary.weakest_macro);
  const trend = readText(summary.trend);
  const improvementNote = readText(summary.improvement_note);
  const goalType = readNullableText(summary.goal_type);

  if (
    !weekStart ||
    !weekEnd ||
    daysTracked === null ||
    avgCalorieAdherence === null ||
    avgProteinAdherence === null ||
    consistencyScore === null ||
    !trend ||
    !improvementNote
  ) {
    return null;
  }

  const normalizedMetrics = dailyMetrics
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const date = readText(entry.date);
      const calories = readNumber(entry.calories);
      const protein = readNumber(entry.protein_g);
      const carbs = readNumber(entry.carbs_g);
      const fat = readNumber(entry.fat_g);
      const mealCount = readNumber(entry.meal_count);
      const calorieAdherence = readNumber(entry.calorie_adherence_percent);
      const proteinAdherence = readNumber(entry.protein_adherence_percent);
      const tracked = readBoolean(entry.tracked);

      if (
        !date ||
        calories === null ||
        protein === null ||
        carbs === null ||
        fat === null ||
        mealCount === null ||
        calorieAdherence === null ||
        proteinAdherence === null ||
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
        meal_count: Math.max(0, Math.round(mealCount)),
        calorie_adherence_percent: Math.max(0, Math.round(calorieAdherence)),
        protein_adherence_percent: Math.max(0, Math.round(proteinAdherence)),
        tracked,
      };
    })
    .filter((item): item is AIInsightsWeeklyResponse["daily_metrics"][number] => Boolean(item));

  const normalizedInsights = insights.map(readInsightItem).filter((item): item is AIInsightItem => Boolean(item));

  const normalizedTrend =
    trend === "improving" || trend === "stable" || trend === "needs_attention" ? trend : null;
  const normalizedWeakestMacro =
    weakestMacro === "calories" ||
    weakestMacro === "protein_g" ||
    weakestMacro === "carbs_g" ||
    weakestMacro === "fat_g"
      ? weakestMacro
      : null;

  if (!normalizedTrend) {
    return null;
  }

  return {
    success: true,
    timezone,
    source,
    summary: {
      week_start: weekStart,
      week_end: weekEnd,
      days_tracked: Math.max(0, Math.round(daysTracked)),
      avg_calorie_adherence_percent: Math.max(0, Math.round(avgCalorieAdherence)),
      avg_protein_adherence_percent: Math.max(0, Math.round(avgProteinAdherence)),
      consistency_score: Math.max(0, Math.round(consistencyScore)),
      best_day: bestDay,
      best_day_reason: bestDayReason,
      weakest_macro: normalizedWeakestMacro,
      trend: normalizedTrend,
      improvement_note: improvementNote,
      goal_type: goalType,
    },
    daily_metrics: normalizedMetrics,
    insights: normalizedInsights,
    fallback_reason: fallbackReason,
  };
}

async function fetchInsights<T>({
  path,
  date,
  timezone,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  parser,
}: FetchInsightsParams & {
  path: string;
  parser: (payload: unknown) => T | null;
}): Promise<T> {
  const query = new URLSearchParams({ date, timezone }).toString();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${path}?${query}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    const rawBody = await response.text();
    const payload = safeJsonParse(rawBody);

    if (!response.ok) {
      const message = extractErrorMessage(payload);
      if (message) {
        throw new Error(message);
      }
      if (response.status === 401) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (response.status === 422 || response.status === 400) {
        throw new Error("Invalid date/timezone input for insights. Please retry.");
      }
      if (response.status >= 500) {
        throw new Error("Insights service is unavailable right now. Please try again.");
      }
      throw new Error("Unable to load AI insights. Please retry.");
    }

    const parsed = parser(payload);
    if (!parsed) {
      throw new Error("Malformed insights response. Please retry.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Insights request timed out. Please retry.");
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unexpected insights error. Please retry.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function fetchAIInsightsToday({
  date,
  timezone,
  timeoutMs,
}: FetchInsightsParams): Promise<AIInsightsTodayResponse> {
  return fetchInsights({
    path: "/api/ai-insights/today",
    date,
    timezone,
    timeoutMs,
    parser: readTodayInsights,
  });
}

export function fetchAIInsightsWeekly({
  date,
  timezone,
  timeoutMs,
}: FetchInsightsParams): Promise<AIInsightsWeeklyResponse> {
  return fetchInsights({
    path: "/api/ai-insights/weekly",
    date,
    timezone,
    timeoutMs,
    parser: readWeeklyInsights,
  });
}
