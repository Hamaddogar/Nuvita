import { mapApiError } from "@/lib/user-facing-errors";
import type {
  HealthDataSummaryResponse,
  IntegrationConnectResponse,
  IntegrationDisconnectResponse,
  IntegrationProvider,
  IntegrationsListResponse,
  IntegrationStatus,
  IntegrationStatusSnapshot,
  IntegrationSyncCounts,
  IntegrationSyncResponse,
  LatestWeightRecord,
} from "./types";
import { providerDisplayName } from "./utils";

const DEFAULT_TIMEOUT_MS = 18_000;

const PROVIDER_ORDER: IntegrationProvider[] = ["fitbit", "apple_health", "google_fit", "health_connect"];

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

function toBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null;
  }
  return value;
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

function isProvider(value: unknown): value is IntegrationProvider {
  return value === "fitbit" || value === "apple_health" || value === "google_fit" || value === "health_connect";
}

function isStatus(value: unknown): value is IntegrationStatus {
  return (
    value === "disconnected" ||
    value === "connecting" ||
    value === "connected" ||
    value === "syncing" ||
    value === "sync_success" ||
    value === "sync_error" ||
    value === "permission_required" ||
    value === "native_required"
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
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
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
      globalThis.clearTimeout(timeoutId);
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
  method?: "GET" | "POST";
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
        throw new Error(mapApiError(detail, "Unable to complete integration request."));
      }
      if (response.status === 401) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      throw new Error("Unable to complete integration request.");
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    if (error instanceof Error) {
      throw new Error(mapApiError(error.message, "Unable to complete integration request."));
    }
    throw new Error("Unexpected integration request error.");
  } finally {
    timeout.cleanup();
  }
}

function parseIntegrationStatusSnapshot(value: unknown): IntegrationStatusSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const provider = value.provider;
  const status = value.status;
  if (!isProvider(provider) || !isStatus(status)) {
    return null;
  }
  return {
    provider,
    status,
    last_synced_at: toNullableText(value.last_synced_at),
  };
}

function parseLatestWeight(value: unknown): LatestWeightRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const provider = value.provider;
  const weight = toNumber(value.weight);
  const unit = value.unit;
  const recordedAt = toText(value.recorded_at);
  if (!isProvider(provider) || weight === null || (unit !== "kg" && unit !== "lb") || !recordedAt) {
    return null;
  }
  return {
    provider,
    weight,
    unit,
    body_fat_percentage: value.body_fat_percentage === null ? null : toNumber(value.body_fat_percentage),
    recorded_at: recordedAt,
  };
}

function parseSyncCounts(value: unknown): IntegrationSyncCounts | null {
  if (!isRecord(value)) {
    return null;
  }
  const activity = toInteger(value.activity_records);
  const body = toInteger(value.body_records);
  const sleep = toInteger(value.sleep_records);
  const heart = toInteger(value.heart_records);
  if (activity === null || body === null || sleep === null || heart === null) {
    return null;
  }
  return {
    activity_records: Math.max(0, activity),
    body_records: Math.max(0, body),
    sleep_records: Math.max(0, sleep),
    heart_records: Math.max(0, heart),
  };
}

function parseIntegrationsList(payload: unknown): IntegrationsListResponse | null {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.integrations)) {
    return null;
  }
  const integrations = payload.integrations
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const provider = item.provider;
      const status = item.status;
      const supportsWebOauth = toBoolean(item.supports_web_oauth);
      const requiresNativeApp = toBoolean(item.requires_native_app);
      if (!isProvider(provider) || !isStatus(status) || supportsWebOauth === null || requiresNativeApp === null) {
        return null;
      }
      const dataTypes = Array.isArray(item.data_types)
        ? item.data_types.map(toText).filter((value): value is string => Boolean(value))
        : [];
      const permissions = Array.isArray(item.permissions)
        ? item.permissions.map(toText).filter((value): value is string => Boolean(value))
        : [];
      return {
        provider,
        display_name: toText(item.display_name) || providerDisplayName(provider),
        status,
        supports_web_oauth: supportsWebOauth,
        requires_native_app: requiresNativeApp,
        data_types: dataTypes,
        permissions,
        connected_at: toNullableText(item.connected_at),
        last_synced_at: toNullableText(item.last_synced_at),
        last_error: toNullableText(item.last_error),
        message: toNullableText(item.message),
      };
    })
    .filter((item): item is IntegrationsListResponse["integrations"][number] => Boolean(item))
    .sort((left, right) => PROVIDER_ORDER.indexOf(left.provider) - PROVIDER_ORDER.indexOf(right.provider));
  return {
    success: true,
    integrations,
  };
}

function parseConnectResponse(payload: unknown): IntegrationConnectResponse | null {
  if (!isRecord(payload)) {
    return null;
  }
  const provider = payload.provider;
  const status = payload.status;
  if (!isProvider(provider) || !isStatus(status)) {
    return null;
  }
  return {
    success: payload.success === true,
    provider,
    status,
    authorization_url: toNullableText(payload.authorization_url),
    message: toNullableText(payload.message),
    state_expires_at: toNullableText(payload.state_expires_at),
  };
}

function parseSyncResponse(payload: unknown): IntegrationSyncResponse | null {
  if (!isRecord(payload)) {
    return null;
  }
  const provider = payload.provider;
  const status = payload.status;
  const message = toText(payload.message);
  const syncedCounts = parseSyncCounts(payload.synced_counts);
  if (!isProvider(provider) || !isStatus(status) || !message || !syncedCounts) {
    return null;
  }
  return {
    success: payload.success === true,
    provider,
    status,
    message,
    synced_counts: syncedCounts,
    last_synced_at: toNullableText(payload.last_synced_at),
  };
}

function parseDisconnectResponse(payload: unknown): IntegrationDisconnectResponse | null {
  if (!isRecord(payload)) {
    return null;
  }
  const provider = payload.provider;
  const status = payload.status;
  const message = toText(payload.message);
  if (!isProvider(provider) || !isStatus(status) || !message) {
    return null;
  }
  return {
    success: payload.success === true,
    provider,
    status,
    message,
  };
}

function parseHealthSummary(payload: unknown): HealthDataSummaryResponse | null {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.integration_status)) {
    return null;
  }
  const date = toText(payload.date);
  const timezone = toText(payload.timezone);
  const steps = toInteger(payload.steps_today);
  const activeCalories = toNumber(payload.active_calories_today);
  const distanceMeters = toNumber(payload.distance_meters_today);
  const exerciseMinutes = toInteger(payload.exercise_minutes_today);
  const workoutsWeek = toInteger(payload.workouts_this_week);
  if (
    !date ||
    !timezone ||
    steps === null ||
    activeCalories === null ||
    distanceMeters === null ||
    exerciseMinutes === null ||
    workoutsWeek === null
  ) {
    return null;
  }

  const integrationStatus = payload.integration_status
    .map(parseIntegrationStatusSnapshot)
    .filter((item): item is IntegrationStatusSnapshot => Boolean(item));

  const sleepDurationMinutes =
    payload.sleep_duration_minutes === null ? null : toInteger(payload.sleep_duration_minutes);
  const restingHeartRateBpm =
    payload.resting_heart_rate_bpm === null ? null : toInteger(payload.resting_heart_rate_bpm);
  if (
    payload.sleep_duration_minutes !== null &&
    payload.sleep_duration_minutes !== undefined &&
    sleepDurationMinutes === null
  ) {
    return null;
  }
  if (
    payload.resting_heart_rate_bpm !== null &&
    payload.resting_heart_rate_bpm !== undefined &&
    restingHeartRateBpm === null
  ) {
    return null;
  }

  return {
    success: true,
    date,
    timezone,
    steps_today: Math.max(0, steps),
    active_calories_today: Math.max(0, activeCalories),
    distance_meters_today: Math.max(0, distanceMeters),
    exercise_minutes_today: Math.max(0, exerciseMinutes),
    workouts_this_week: Math.max(0, workoutsWeek),
    latest_weight: parseLatestWeight(payload.latest_weight),
    sleep_duration_minutes: sleepDurationMinutes === null ? null : Math.max(0, sleepDurationMinutes),
    resting_heart_rate_bpm: restingHeartRateBpm === null ? null : Math.max(0, restingHeartRateBpm),
    integration_status: integrationStatus,
  };
}

export async function fetchIntegrationsList(): Promise<IntegrationsListResponse> {
  const payload = await requestJson({ path: "/api/integrations", method: "GET" });
  const parsed = parseIntegrationsList(payload);
  if (!parsed) {
    throw new Error("Unexpected integrations response.");
  }
  return parsed;
}

export async function connectIntegrationProvider(params: {
  provider: IntegrationProvider;
  redirect_to?: string;
}): Promise<IntegrationConnectResponse> {
  const payload = await requestJson({
    path: `/api/integrations/${encodeURIComponent(params.provider)}/connect`,
    method: "POST",
    body: params.redirect_to ? { redirect_to: params.redirect_to } : {},
  });
  const parsed = parseConnectResponse(payload);
  if (!parsed) {
    throw new Error("Unexpected integration connect response.");
  }
  return parsed;
}

export async function syncIntegrationProvider(params: {
  provider: IntegrationProvider;
  days?: number;
}): Promise<IntegrationSyncResponse> {
  const payload = await requestJson({
    path: `/api/integrations/${encodeURIComponent(params.provider)}/sync`,
    method: "POST",
    body: params.days ? { days: params.days } : {},
  });
  const parsed = parseSyncResponse(payload);
  if (!parsed) {
    throw new Error("Unexpected integration sync response.");
  }
  return parsed;
}

export async function disconnectIntegrationProvider(provider: IntegrationProvider): Promise<IntegrationDisconnectResponse> {
  const payload = await requestJson({
    path: `/api/integrations/${encodeURIComponent(provider)}/disconnect`,
    method: "POST",
  });
  const parsed = parseDisconnectResponse(payload);
  if (!parsed) {
    throw new Error("Unexpected integration disconnect response.");
  }
  return parsed;
}

export async function fetchHealthSummary(params: {
  date?: string;
  timezone?: string;
}): Promise<HealthDataSummaryResponse> {
  const query = new URLSearchParams();
  if (params.date) {
    query.set("date", params.date);
  }
  if (params.timezone) {
    query.set("timezone", params.timezone);
  }
  const payload = await requestJson({
    path: `/api/health-data/summary${query.toString() ? `?${query.toString()}` : ""}`,
    method: "GET",
  });
  const parsed = parseHealthSummary(payload);
  if (!parsed) {
    throw new Error("Unexpected health summary response.");
  }
  return parsed;
}
