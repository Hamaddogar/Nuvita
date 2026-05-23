import type { TrendDirection } from "./types";

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

export function formatDateShort(dateValue: string): string {
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatDateLong(dateValue: string): string {
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function trendLabel(value: TrendDirection): string {
  if (value === "up") {
    return "Up";
  }
  if (value === "down") {
    return "Down";
  }
  return "Stable";
}

export function trendClass(value: TrendDirection): string {
  if (value === "up") {
    return "text-emerald-600 dark:text-emerald-300";
  }
  if (value === "down") {
    return "text-amber-600 dark:text-amber-300";
  }
  return "text-muted-foreground";
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return value.toFixed(1).replace(/\.0$/, "");
}
