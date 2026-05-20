import { mapApiError } from "@/lib/user-facing-errors";
import type {
  WaterGoalResponse,
  WaterHistoryResponse,
  WaterLogMutationResponse,
  WaterTodayResponse,
  WeightGoalResponse,
  WeightHistoryResponse,
  WeightLogMutationResponse,
  WeightSummaryResponse,
  WeightUnit,
} from "./wellness-types";

const DEFAULT_TIMEOUT_MS = 15_000;

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

function toText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  return cleaned || null;
}

function toWeightUnit(value: unknown): WeightUnit | null {
  return value === "lb" ? "lb" : value === "kg" ? "kg" : null;
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
  method = "GET",
  body,
  signal,
}: {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}) {
  const timeout = withTimeout(signal);
  try {
    const response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: timeout.signal,
    });
    const payload = safeJsonParse(await response.text());

    if (!response.ok) {
      const detail = extractErrorMessage(payload);
      if (detail) {
        throw new Error(mapApiError(detail, "Wellness request failed. Please try again."));
      }
      if (response.status === 401) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      throw new Error("Wellness request failed. Please try again.");
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    if (error instanceof Error) {
      throw new Error(mapApiError(error.message, "Wellness request failed. Please try again."));
    }
    throw new Error("Unexpected wellness request error.");
  } finally {
    timeout.cleanup();
  }
}

function parseWaterLog(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }
  const id = toText(payload.id);
  const amount = toInteger(payload.amount_ml);
  const loggedAt = toText(payload.logged_at);
  const createdAt = toText(payload.created_at);
  if (!id || amount === null || !loggedAt || !createdAt) {
    return null;
  }
  return {
    id,
    amount_ml: Math.max(0, amount),
    logged_at: loggedAt,
    created_at: createdAt,
  };
}

function parseWaterToday(payload: unknown): WaterTodayResponse | null {
  if (!isRecord(payload)) {
    return null;
  }
  if (payload.success !== true || !Array.isArray(payload.logs)) {
    return null;
  }
  const date = toText(payload.date);
  const total = toInteger(payload.today_total_ml);
  const goal = toInteger(payload.goal_ml);
  const remaining = toInteger(payload.remaining_ml);
  const progress = toInteger(payload.progress_percent);
  if (!date || total === null || goal === null || remaining === null || progress === null) {
    return null;
  }
  return {
    success: true,
    date,
    today_total_ml: Math.max(0, total),
    goal_ml: Math.max(0, goal),
    remaining_ml: Math.max(0, remaining),
    progress_percent: Math.max(0, progress),
    logs: payload.logs.map(parseWaterLog).filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}

function parseWaterHistory(payload: unknown): WaterHistoryResponse | null {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.entries) || !Array.isArray(payload.logs)) {
    return null;
  }
  const entries = payload.entries
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const date = toText(entry.date);
      const total = toInteger(entry.total_ml);
      const goal = toInteger(entry.goal_ml);
      const progress = toInteger(entry.progress_percent);
      if (!date || total === null || goal === null || progress === null) {
        return null;
      }
      return {
        date,
        total_ml: Math.max(0, total),
        goal_ml: Math.max(0, goal),
        progress_percent: Math.max(0, progress),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    success: true,
    entries,
    logs: payload.logs.map(parseWaterLog).filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}

function parseWaterMutation(payload: unknown): WaterLogMutationResponse | null {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }
  const log = parseWaterLog(payload.log);
  const total = toInteger(payload.today_total_ml);
  const goal = toInteger(payload.goal_ml);
  const remaining = toInteger(payload.remaining_ml);
  const progress = toInteger(payload.progress_percent);
  if (!log || total === null || goal === null || remaining === null || progress === null) {
    return null;
  }
  return {
    success: true,
    log,
    today_total_ml: Math.max(0, total),
    goal_ml: Math.max(0, goal),
    remaining_ml: Math.max(0, remaining),
    progress_percent: Math.max(0, progress),
  };
}

function parseWeightTrendPoint(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }
  const date = toText(payload.date);
  const weight = toNumber(payload.weight);
  const unit = toWeightUnit(payload.unit);
  if (!date || weight === null || !unit) {
    return null;
  }
  return {
    date,
    weight,
    unit,
  };
}

function parseWeightLog(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }
  const id = toText(payload.id);
  const weight = toNumber(payload.weight);
  const unit = toWeightUnit(payload.unit);
  const weightKg = toNumber(payload.weight_kg);
  const loggedAt = toText(payload.logged_at);
  const createdAt = toText(payload.created_at);
  if (!id || weight === null || weightKg === null || !loggedAt || !createdAt || !unit) {
    return null;
  }
  return {
    id,
    weight,
    unit,
    weight_kg: weightKg,
    notes: toText(payload.notes),
    logged_at: loggedAt,
    created_at: createdAt,
  };
}

function parseWeightSummary(payload: unknown): WeightSummaryResponse | null {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.trend)) {
    return null;
  }
  const unit = toWeightUnit(payload.unit);
  if (!unit) {
    return null;
  }
  const currentWeight = payload.current_weight === null ? null : toNumber(payload.current_weight);
  const targetWeight = payload.target_weight === null ? null : toNumber(payload.target_weight);
  const changeFromStart = payload.change_from_start === null ? null : toNumber(payload.change_from_start);
  const remainingToGoal = payload.remaining_to_goal === null ? null : toNumber(payload.remaining_to_goal);
  const recentChange = payload.recent_change === null ? null : toNumber(payload.recent_change);
  const progress = payload.progress_percent === null ? null : toInteger(payload.progress_percent);

  return {
    success: true,
    current_weight: currentWeight,
    target_weight: targetWeight,
    unit,
    change_from_start: changeFromStart,
    remaining_to_goal: remainingToGoal,
    recent_change: recentChange,
    progress_percent: progress,
    trend: payload.trend
      .map(parseWeightTrendPoint)
      .filter((point): point is NonNullable<typeof point> => Boolean(point)),
  };
}

function parseWeightHistory(payload: unknown): WeightHistoryResponse | null {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.logs) || !Array.isArray(payload.trend)) {
    return null;
  }
  return {
    success: true,
    logs: payload.logs.map(parseWeightLog).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    trend: payload.trend
      .map(parseWeightTrendPoint)
      .filter((point): point is NonNullable<typeof point> => Boolean(point)),
  };
}

function parseWeightMutation(payload: unknown): WeightLogMutationResponse | null {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }
  const log = parseWeightLog(payload.log);
  const summary = parseWeightSummary(payload.summary);
  if (!log || !summary) {
    return null;
  }
  return {
    success: true,
    log,
    summary,
  };
}

function parseWaterGoal(payload: unknown): WaterGoalResponse | null {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }
  const goal = toInteger(payload.goal_ml);
  if (goal === null) {
    return null;
  }
  return {
    success: true,
    goal_ml: Math.max(0, goal),
  };
}

function parseWeightGoal(payload: unknown): WeightGoalResponse | null {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }
  const target = toNumber(payload.target_weight);
  const unit = toWeightUnit(payload.unit);
  if (target === null || !unit) {
    return null;
  }
  return {
    success: true,
    target_weight: target,
    unit,
  };
}

export async function fetchWaterToday(params: { date?: string; timezone?: string }) {
  const query = new URLSearchParams();
  if (params.date) {
    query.set("date", params.date);
  }
  if (params.timezone) {
    query.set("timezone", params.timezone);
  }
  const payload = await requestJson({
    path: `/api/water-logs/today${query.toString() ? `?${query.toString()}` : ""}`,
  });
  const parsed = parseWaterToday(payload);
  if (!parsed) {
    throw new Error("Unexpected hydration summary response.");
  }
  return parsed;
}

export async function fetchWaterHistory(params: { days?: number; timezone?: string }) {
  const query = new URLSearchParams();
  if (params.days) {
    query.set("days", String(params.days));
  }
  if (params.timezone) {
    query.set("timezone", params.timezone);
  }
  const payload = await requestJson({
    path: `/api/water-logs/history${query.toString() ? `?${query.toString()}` : ""}`,
  });
  const parsed = parseWaterHistory(payload);
  if (!parsed) {
    throw new Error("Unexpected hydration history response.");
  }
  return parsed;
}

export async function createWaterLog(params: { amount_ml: number; logged_at?: string }) {
  const payload = await requestJson({
    path: "/api/water-logs",
    method: "POST",
    body: params,
  });
  const parsed = parseWaterMutation(payload);
  if (!parsed) {
    throw new Error("Unexpected water log response.");
  }
  return parsed;
}

export async function updateWaterLog(params: { logId: string; amount_ml: number; logged_at?: string }) {
  const payload = await requestJson({
    path: `/api/water-logs/${encodeURIComponent(params.logId)}`,
    method: "PATCH",
    body: {
      amount_ml: params.amount_ml,
      logged_at: params.logged_at,
    },
  });
  const parsed = parseWaterMutation(payload);
  if (!parsed) {
    throw new Error("Unexpected water log response.");
  }
  return parsed;
}

export async function deleteWaterLog(logId: string) {
  const payload = await requestJson({
    path: `/api/water-logs/${encodeURIComponent(logId)}`,
    method: "DELETE",
  });
  const parsed = parseWaterToday(payload);
  if (!parsed) {
    throw new Error("Unexpected delete water response.");
  }
  return parsed;
}

export async function updateWaterGoal(target_ml: number) {
  const payload = await requestJson({
    path: "/api/water-logs/goal",
    method: "PUT",
    body: { target_ml },
  });
  const parsed = parseWaterGoal(payload);
  if (!parsed) {
    throw new Error("Unexpected water goal response.");
  }
  return parsed;
}

export async function fetchWeightSummary(params: { timezone?: string; unit?: WeightUnit }) {
  const query = new URLSearchParams();
  if (params.timezone) {
    query.set("timezone", params.timezone);
  }
  if (params.unit) {
    query.set("unit", params.unit);
  }
  const payload = await requestJson({
    path: `/api/weight-summary${query.toString() ? `?${query.toString()}` : ""}`,
  });
  const parsed = parseWeightSummary(payload);
  if (!parsed) {
    throw new Error("Unexpected weight summary response.");
  }
  return parsed;
}

export async function fetchWeightHistory(params: { days?: number; timezone?: string; unit?: WeightUnit }) {
  const query = new URLSearchParams();
  if (params.days) {
    query.set("days", String(params.days));
  }
  if (params.timezone) {
    query.set("timezone", params.timezone);
  }
  if (params.unit) {
    query.set("unit", params.unit);
  }
  const payload = await requestJson({
    path: `/api/weight-logs/history${query.toString() ? `?${query.toString()}` : ""}`,
  });
  const parsed = parseWeightHistory(payload);
  if (!parsed) {
    throw new Error("Unexpected weight history response.");
  }
  return parsed;
}

export async function createWeightLog(params: {
  weight: number;
  unit: WeightUnit;
  notes?: string;
  logged_at?: string;
}) {
  const payload = await requestJson({
    path: "/api/weight-logs",
    method: "POST",
    body: params,
  });
  const parsed = parseWeightMutation(payload);
  if (!parsed) {
    throw new Error("Unexpected weight log response.");
  }
  return parsed;
}

export async function updateWeightGoal(params: { target_weight: number; unit: WeightUnit }) {
  const payload = await requestJson({
    path: "/api/weight-logs/goal",
    method: "PUT",
    body: params,
  });
  const parsed = parseWeightGoal(payload);
  if (!parsed) {
    throw new Error("Unexpected weight goal response.");
  }
  return parsed;
}
