import type {
  DailyConsumedTotals,
  DailyGoalTargets,
  DailyMealSummary,
  DailyProgress,
  DailyRemainingTotals,
  DailySummaryResponse,
} from "./types";
import { mapApiError } from "@/lib/user-facing-errors";

const DEFAULT_TIMEOUT_MS = 20_000;

type FetchDailySummaryParams = {
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

function readMacroBlock(value: unknown): DailyGoalTargets | DailyConsumedTotals | DailyRemainingTotals | null {
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

function readProgress(value: unknown): DailyProgress | null {
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

function readMeal(value: unknown): DailyMealSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readText(value.id);
  const mealName = readText(value.meal_name);
  const mealType = readText(value.meal_type);
  const eatenAt = readText(value.eaten_at);
  const calories = readNumber(value.total_calories);
  const protein = readNumber(value.total_protein_g);
  const carbs = readNumber(value.total_carbs_g);
  const fat = readNumber(value.total_fat_g);
  const itemCount = readNumber(value.item_count);

  if (
    !id ||
    !mealName ||
    !mealType ||
    !eatenAt ||
    calories === null ||
    protein === null ||
    carbs === null ||
    fat === null ||
    itemCount === null
  ) {
    return null;
  }

  return {
    id,
    meal_name: mealName,
    meal_type: mealType,
    eaten_at: eatenAt,
    total_calories: calories,
    total_protein_g: protein,
    total_carbs_g: carbs,
    total_fat_g: fat,
    item_count: Math.max(0, Math.round(itemCount)),
  };
}

function readDailySummary(payload: unknown): DailySummaryResponse | null {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }

  const date = readText(payload.date);
  const goals = readMacroBlock(payload.goals);
  const consumed = readMacroBlock(payload.consumed);
  const remaining = readMacroBlock(payload.remaining);
  const progress = readProgress(payload.progress);
  const meals = payload.meals;

  if (!date || !goals || !consumed || !remaining || !progress || !Array.isArray(meals)) {
    return null;
  }

  const normalizedMeals = meals.map(readMeal).filter((meal): meal is DailyMealSummary => Boolean(meal));

  return {
    success: true,
    date,
    goals,
    consumed,
    remaining,
    progress,
    meals: normalizedMeals,
  };
}

export async function fetchDailySummary({
  date,
  timezone,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FetchDailySummaryParams): Promise<DailySummaryResponse> {
  const query = new URLSearchParams({ date, timezone }).toString();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`/api/daily-summary?${query}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    const rawBody = await response.text();
    const payload = safeJsonParse(rawBody);

    if (!response.ok) {
      const message = extractErrorMessage(payload);
      if (message) {
        throw new Error(mapApiError(message, "Unable to load your dashboard right now."));
      }
      if (response.status === 401) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (response.status === 422 || response.status === 400) {
        throw new Error("Invalid date/timezone input. Please retry.");
      }
      if (response.status >= 500) {
        throw new Error("Dashboard service is unavailable right now. Please try again.");
      }
      throw new Error("Unable to load dashboard summary. Please retry.");
    }

    const summary = readDailySummary(payload);
    if (!summary) {
      throw new Error("Malformed dashboard response. Please retry.");
    }
    return summary;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Dashboard request timed out. Please retry.");
    }
    if (error instanceof Error) {
      throw new Error(mapApiError(error.message, "Unable to load your dashboard right now."));
    }
    throw new Error("Unexpected dashboard error. Please retry.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}
