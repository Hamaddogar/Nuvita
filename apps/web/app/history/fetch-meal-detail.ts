import type { MealDetailItem, MealDetailMeal, MealDetailResponse } from "./types";
import { mapApiError } from "@/lib/user-facing-errors";

const DEFAULT_TIMEOUT_MS = 20_000;

type FetchMealDetailParams = {
  mealId: string;
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
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => (isRecord(entry) && typeof entry.msg === "string" ? entry.msg.trim() : null))
      .filter((value): value is string => Boolean(value));
    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  return null;
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

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function readMeal(value: unknown): MealDetailMeal | null {
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

  if (!id || !mealName || !mealType || !eatenAt || calories === null || protein === null || carbs === null || fat === null) {
    return null;
  }

  return {
    id,
    meal_name: mealName,
    meal_type: mealType,
    eaten_at: eatenAt,
    notes: readNullableText(value.notes),
    image_url: readNullableText(value.image_url),
    total_calories: calories,
    total_protein_g: protein,
    total_carbs_g: carbs,
    total_fat_g: fat,
  };
}

function readItem(value: unknown): MealDetailItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readText(value.id);
  const name = readText(value.name);
  const calories = readNumber(value.calories);
  const protein = readNumber(value.protein_g);
  const carbs = readNumber(value.carbs_g);
  const fat = readNumber(value.fat_g);
  const confidence = readText(value.confidence);
  const source = readText(value.nutrition_source);

  if (!id || !name || calories === null || protein === null || carbs === null || fat === null || !confidence || !source) {
    return null;
  }

  const estimatedWeight = readNumber(value.estimated_weight_g);

  return {
    id,
    name,
    category: readNullableText(value.category),
    portion_description: readNullableText(value.portion_description),
    estimated_weight_g: estimatedWeight,
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    confidence,
    nutrition_source: source,
    notes: readNullableText(value.notes),
  };
}

function readMealDetail(payload: unknown): MealDetailResponse | null {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }

  const meal = readMeal(payload.meal);
  const items = payload.items;

  if (!meal || !Array.isArray(items)) {
    return null;
  }

  const normalizedItems = items.map(readItem).filter((item): item is MealDetailItem => Boolean(item));

  return {
    success: true,
    meal,
    items: normalizedItems,
  };
}

export async function fetchMealDetail({
  mealId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FetchMealDetailParams): Promise<MealDetailResponse> {
  const normalizedMealId = mealId.trim();
  if (!normalizedMealId) {
    throw new Error("Meal ID is required.");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`/api/meals/${encodeURIComponent(normalizedMealId)}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    const rawBody = await response.text();
    const payload = safeJsonParse(rawBody);

    if (!response.ok) {
      const message = extractErrorMessage(payload);
      if (message) {
        throw new Error(mapApiError(message, "Unable to load meal details right now."));
      }
      if (response.status === 401) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (response.status === 404) {
        throw new Error("Meal details are no longer available for this entry.");
      }
      if (response.status >= 500) {
        throw new Error("Meal detail service is unavailable right now. Please try again.");
      }
      throw new Error("Unable to load meal details. Please retry.");
    }

    const detail = readMealDetail(payload);
    if (!detail) {
      throw new Error("Malformed meal detail response. Please retry.");
    }

    return detail;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Meal detail request timed out. Please retry.");
    }
    if (error instanceof Error) {
      throw new Error(mapApiError(error.message, "Unable to load meal details right now."));
    }
    throw new Error("Unexpected meal detail error. Please retry.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}
