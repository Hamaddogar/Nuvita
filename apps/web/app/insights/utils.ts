import type { InsightPriority, InsightType } from "./types";

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

export function formatInsightsDate(dateValue: string): string {
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

export function humanizeGoalType(goalType: string | null): string {
  if (!goalType) {
    return "general wellness";
  }
  return goalType.replace(/_/g, " ");
}

export function priorityBadgeClasses(priority: InsightPriority): string {
  if (priority === "high") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300";
  }
  if (priority === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300";
}

export function typeLabel(type: InsightType): string {
  const labels: Record<InsightType, string> = {
    calorie_balance: "Calories",
    protein: "Protein",
    carbs: "Carbs",
    fat: "Fat",
    meal_timing: "Timing",
    consistency: "Consistency",
    recommendation: "Recommendation",
    motivation: "Momentum",
    warning: "Warning",
    weekly_summary: "Weekly",
  };
  return labels[type];
}
