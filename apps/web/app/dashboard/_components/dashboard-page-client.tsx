"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { CaloriesProgressCard } from "./calories-progress-card";
import { DailySummaryHeader } from "./daily-summary-header";
import { DashboardEmptyState } from "./dashboard-empty-state";
import { DashboardErrorState } from "./dashboard-error-state";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { MacroProgressGrid } from "./macro-progress-grid";
import { TodayCoachingPreview } from "./today-coaching-preview";
import { TodayMealsList } from "./today-meals-list";
import { useDailySummary } from "../use-daily-summary";
import { formatDashboardDate, getLocalDateISO } from "../utils";

type DashboardPageClientProps = {
  fullName: string | null;
};

function resolveTimezone(): string {
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

export function DashboardPageClient({ fullName }: DashboardPageClientProps) {
  const [requestedDate, setRequestedDate] = useState<string>(() => getLocalDateISO());
  const [timezone, setTimezone] = useState<string>("UTC");

  useEffect(() => {
    setRequestedDate(getLocalDateISO());
    setTimezone(resolveTimezone());
  }, []);

  const { state, refresh } = useDailySummary({
    date: requestedDate,
    timezone,
  });

  const dateLabel = useMemo(() => {
    if (state.status === "success" || state.status === "empty") {
      return formatDashboardDate(state.data.date);
    }
    return formatDashboardDate(requestedDate);
  }, [requestedDate, state]);

  const hasSummary = state.status === "success" || state.status === "empty";

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-md px-4 py-6 pb-24">
        <div className="space-y-4">
          <DailySummaryHeader
            fullName={fullName}
            dateLabel={dateLabel}
            onRefresh={refresh}
            isRefreshing={state.status === "loading"}
          />

          {state.status === "loading" ? <DashboardSkeleton /> : null}

          {state.status === "error" ? <DashboardErrorState message={state.error} onRetry={refresh} /> : null}

          {hasSummary ? (
            <>
              <CaloriesProgressCard
                consumedCalories={state.data.consumed.calories}
                remainingCalories={state.data.remaining.calories}
                calorieGoal={state.data.goals.calories}
                progressPercent={state.data.progress.calories_percent}
                mealsCount={state.data.meals.length}
              />
              <MacroProgressGrid
                goals={state.data.goals}
                consumed={state.data.consumed}
                remaining={state.data.remaining}
                progress={state.data.progress}
              />
              <TodayCoachingPreview date={state.data.date} timezone={timezone} />
              {state.status === "empty" ? (
                <DashboardEmptyState />
              ) : (
                <TodayMealsList meals={state.data.meals} />
              )}
            </>
          ) : null}

          <section className="sticky bottom-20 rounded-2xl border border-emerald-100/80 bg-card/95 p-3 shadow-sm dark:border-slate-800">
            <Link
              href="/scan"
              className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              Scan Meal
            </Link>
          </section>
        </div>
      </main>
      <MobileBottomNav />
    </>
  );
}
