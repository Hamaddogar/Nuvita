"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { CaloriesProgressCard } from "./calories-progress-card";
import { DailySummaryHeader } from "./daily-summary-header";
import { DashboardEmptyState } from "./dashboard-empty-state";
import { DashboardErrorState } from "./dashboard-error-state";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { HydrationCard } from "./hydration-card";
import { HydrationTrendCard } from "./hydration-trend-card";
import { MacroProgressGrid } from "./macro-progress-grid";
import { TodayCoachingPreview } from "./today-coaching-preview";
import { TodayMealsList } from "./today-meals-list";
import { WeightTrackingCard } from "./weight-tracking-card";
import { WeightTrendCard } from "./weight-trend-card";
import { useDailySummary } from "../use-daily-summary";
import { useHydrationSummary } from "../use-hydration-summary";
import { useWaterTracking } from "../use-water-tracking";
import { useWeightTracking } from "../use-weight-tracking";
import { formatDashboardDate, getLocalDateISO } from "../utils";
import type { WeightUnit } from "../wellness-types";

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
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");

  useEffect(() => {
    setRequestedDate(getLocalDateISO());
    setTimezone(resolveTimezone());
  }, []);

  const dailySummary = useDailySummary({
    date: requestedDate,
    timezone,
  });
  const hydrationSummary = useHydrationSummary({
    date: requestedDate,
    timezone,
  });
  const hydrationTrend = useWaterTracking({
    timezone,
    days: 14,
  });
  const weightTracking = useWeightTracking({
    timezone,
    unit: weightUnit,
    days: 90,
  });

  const refreshAll = () => {
    dailySummary.refresh();
    hydrationSummary.refresh();
    hydrationTrend.refresh();
    weightTracking.refresh();
  };

  const dateLabel = useMemo(() => {
    if (dailySummary.state.status === "success" || dailySummary.state.status === "empty") {
      return formatDashboardDate(dailySummary.state.data.date);
    }
    return formatDashboardDate(requestedDate);
  }, [dailySummary.state, requestedDate]);

  const hasSummary = dailySummary.state.status === "success" || dailySummary.state.status === "empty";
  const dailySummaryData = hasSummary ? dailySummary.state.data : null;
  const isRefreshing =
    dailySummary.state.status === "loading" ||
    hydrationSummary.state.status === "loading" ||
    hydrationTrend.state.status === "loading" ||
    weightTracking.state.status === "loading";

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-md px-4 py-6 pb-24">
        <div className="space-y-4">
          <DailySummaryHeader
            fullName={fullName}
            dateLabel={dateLabel}
            onRefresh={refreshAll}
            isRefreshing={isRefreshing}
          />

          {dailySummary.state.status === "loading" ? <DashboardSkeleton /> : null}

          {dailySummary.state.status === "error" ? (
            <DashboardErrorState message={dailySummary.state.error} onRetry={dailySummary.refresh} />
          ) : null}

          {dailySummaryData ? (
            <>
              <CaloriesProgressCard
                consumedCalories={dailySummaryData.consumed.calories}
                remainingCalories={dailySummaryData.remaining.calories}
                calorieGoal={dailySummaryData.goals.calories}
                progressPercent={dailySummaryData.progress.calories_percent}
                mealsCount={dailySummaryData.meals.length}
              />
              <MacroProgressGrid
                goals={dailySummaryData.goals}
                consumed={dailySummaryData.consumed}
                remaining={dailySummaryData.remaining}
                progress={dailySummaryData.progress}
              />
              <HydrationCard
                state={hydrationSummary.state}
                mutationState={hydrationSummary.mutationState}
                onRefresh={() => {
                  hydrationSummary.refresh();
                  hydrationTrend.refresh();
                }}
                onAddWater={async (amountMl) => {
                  const success = await hydrationSummary.addWater(amountMl);
                  if (success) {
                    hydrationTrend.refresh();
                  }
                  return success;
                }}
                onEditWaterLog={async (logId, amountMl) => {
                  const success = await hydrationSummary.editWaterLog(logId, amountMl);
                  if (success) {
                    hydrationTrend.refresh();
                  }
                  return success;
                }}
                onRemoveWaterLog={async (logId) => {
                  const success = await hydrationSummary.removeWaterLog(logId);
                  if (success) {
                    hydrationTrend.refresh();
                  }
                  return success;
                }}
                onSaveGoal={async (goalMl) => {
                  const success = await hydrationSummary.saveHydrationGoal(goalMl);
                  if (success) {
                    hydrationTrend.refresh();
                  }
                  return success;
                }}
                onClearMutationError={hydrationSummary.clearMutationError}
              />
              <HydrationTrendCard state={hydrationTrend.state} onRefresh={hydrationTrend.refresh} />
              <WeightTrackingCard
                state={weightTracking.state}
                mutationState={weightTracking.mutationState}
                selectedUnit={weightUnit}
                onChangeUnit={setWeightUnit}
                onRefresh={weightTracking.refresh}
                onAddWeightLog={weightTracking.addWeightLog}
                onSaveWeightGoal={weightTracking.saveWeightGoal}
                onClearMutationError={weightTracking.clearMutationError}
              />
              <WeightTrendCard state={weightTracking.state} onRefresh={weightTracking.refresh} />
              <TodayCoachingPreview date={dailySummaryData.date} timezone={timezone} />
              {dailySummary.state.status === "empty" ? (
                <DashboardEmptyState />
              ) : (
                <TodayMealsList meals={dailySummaryData.meals} />
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
