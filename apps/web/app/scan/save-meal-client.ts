import type { ConfirmedMeal, ConfirmedMealItem, MacroTotals } from "./meal-confirmation-types";

export type MealSaveResponse = {
  success: boolean;
  meal_id: string;
  meal: {
    id: string;
    user_id: string;
    meal_name: string;
    meal_type: string;
    eaten_at: string;
    notes: string | null;
  };
  items: ConfirmedMealItem[];
  totals: MacroTotals;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
      .map((entry) => (isRecord(entry) && typeof entry.msg === "string" ? entry.msg : null))
      .filter((entry): entry is string => Boolean(entry));
    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  return null;
}

function toFriendlySaveMessage(detail: string): string {
  const normalized = detail.toLowerCase();
  if (
    normalized.includes("create_meal_with_items")
    || (normalized.includes("schema cache") && normalized.includes("function"))
  ) {
    return "Meal save setup is incomplete on the database. Run the Step 4 Supabase SQL migration, then retry.";
  }
  return detail;
}

function safeJsonParse(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { detail: raw || "Unexpected response body." };
  }
}

function isMealSaveResponse(payload: unknown): payload is MealSaveResponse {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    payload.success === true &&
    typeof payload.meal_id === "string" &&
    isRecord(payload.meal) &&
    Array.isArray(payload.items) &&
    isRecord(payload.totals)
  );
}

export async function saveMeal(payload: ConfirmedMeal): Promise<MealSaveResponse> {
  const response = await fetch("/api/meals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const rawBody = await response.text();
  const parsed = safeJsonParse(rawBody);

  if (!response.ok) {
    const detail = extractErrorMessage(parsed);
    if (detail) {
      throw new Error(toFriendlySaveMessage(detail));
    }

    if (response.status === 401) {
      throw new Error("Your session has expired. Please log in again and retry.");
    }
    if (response.status === 422 || response.status === 400) {
      throw new Error("Meal data is invalid. Please review your edits and try again.");
    }
    if (response.status >= 500) {
      throw new Error("Meal service is unavailable right now. Please try again.");
    }
    throw new Error("Failed to save meal. Please retry.");
  }

  if (!isMealSaveResponse(parsed)) {
    throw new Error("Unexpected save response. Please retry.");
  }

  return parsed;
}
