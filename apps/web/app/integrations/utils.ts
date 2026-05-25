import type { IntegrationProvider, IntegrationStatus } from "./types";

export function resolveTimezone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const normalized = resolved && resolved.trim() ? resolved.trim() : "UTC";
    if (normalized.toUpperCase() === "UTC") {
      return "UTC";
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: normalized });
      return normalized;
    } catch {
      return "UTC";
    }
  } catch {
    return "UTC";
  }
}

export function getLocalDateISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatDateTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function providerDisplayName(provider: IntegrationProvider): string {
  if (provider === "apple_health") {
    return "Apple Health";
  }
  if (provider === "google_fit") {
    return "Google Fit";
  }
  if (provider === "health_connect") {
    return "Health Connect";
  }
  return "Fitbit";
}

export function statusLabel(status: IntegrationStatus): string {
  if (status === "sync_success") {
    return "Synced";
  }
  if (status === "sync_error") {
    return "Sync error";
  }
  if (status === "permission_required") {
    return "Permission required";
  }
  if (status === "native_required") {
    return "Native app required";
  }
  if (status === "connected") {
    return "Connected";
  }
  if (status === "connecting") {
    return "Connecting";
  }
  if (status === "syncing") {
    return "Syncing";
  }
  return "Disconnected";
}

export function statusBadgeClasses(status: IntegrationStatus): string {
  if (status === "connected" || status === "sync_success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300";
  }
  if (status === "syncing" || status === "connecting") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300";
  }
  if (status === "sync_error" || status === "permission_required") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300";
  }
  if (status === "native_required") {
    return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/30 dark:text-violet-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300";
}

export function formatMetricNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

export function formatDistanceKm(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) {
    return "0";
  }
  return formatMetricNumber(meters / 1000, 1);
}
