"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { HistoryDateNavigator } from "./history-date-navigator";
import { HistoryEmptyState } from "./history-empty-state";
import { HistoryErrorState } from "./history-error-state";
import { HistoryHeader } from "./history-header";
import { HistoryMealsList } from "./history-meals-list";
import { HistorySkeleton } from "./history-skeleton";
import { HistorySummaryCard } from "./history-summary-card";
import { MealDetailSheet } from "./meal-detail-sheet";
import { useMealDetail } from "../use-meal-detail";
import { useMealHistory } from "../use-meal-history";
import { formatHistoryDate, getLocalDateISO, shiftDateISO } from "../utils";

type HistoryPageClientProps = {
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

export function HistoryPageClient({ fullName }: HistoryPageClientProps) {
  const [requestedDate, setRequestedDate] = useState<string>(() => getLocalDateISO());
  const [timezone, setTimezone] = useState<string>("UTC");
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);

  useEffect(() => {
    setRequestedDate(getLocalDateISO());
    setTimezone(resolveTimezone());
  }, []);

  const { state, refresh } = useMealHistory({
    date: requestedDate,
    timezone,
  });

  const { state: mealDetailState, refresh: refreshMealDetail } = useMealDetail({
    mealId: selectedMealId,
  });

  useEffect(() => {
    setSelectedMealId(null);
  }, [requestedDate]);

  const activeDate = useMemo(() => {
    if (state.status === "success" || state.status === "empty") {
      return state.data.date;
    }
    return requestedDate;
  }, [requestedDate, state]);

  const dateLabel = useMemo(() => formatHistoryDate(activeDate), [activeDate]);
  const todayDate = getLocalDateISO();
  const isToday = requestedDate === todayDate;
  const canGoNext = requestedDate < todayDate;

  const goToPreviousDate = useCallback(() => {
    setRequestedDate((previous) => shiftDateISO(previous, -1));
  }, []);

  const goToNextDate = useCallback(() => {
    setRequestedDate((previous) => {
      const nextDate = shiftDateISO(previous, 1);
      const latestDate = getLocalDateISO();
      return nextDate > latestDate ? latestDate : nextDate;
    });
  }, []);

  const goToToday = useCallback(() => {
    setRequestedDate(getLocalDateISO());
  }, []);

  const summaryData = state.status === "success" || state.status === "empty" ? state.data : null;

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-md px-4 py-6 pb-24">
        <div className="space-y-4">
          <HistoryHeader fullName={fullName} />

          <HistoryDateNavigator
            dateLabel={dateLabel}
            isToday={isToday}
            canGoNext={canGoNext}
            isLoading={state.status === "loading"}
            onPrevious={goToPreviousDate}
            onNext={goToNextDate}
            onToday={goToToday}
            onRefresh={refresh}
          />

          {state.status === "loading" ? <HistorySkeleton /> : null}
          {state.status === "error" ? <HistoryErrorState message={state.error} onRetry={refresh} /> : null}

          {summaryData ? (
            <>
              <HistorySummaryCard
                summary={summaryData.summary}
                goals={summaryData.goals}
                remaining={summaryData.remaining}
                progress={summaryData.progress}
              />

              {state.status === "empty" ? (
                <HistoryEmptyState dateLabel={dateLabel} />
              ) : (
                <HistoryMealsList meals={summaryData.meals} onSelectMeal={setSelectedMealId} />
              )}
            </>
          ) : null}

          <section className="sticky bottom-20 rounded-2xl border border-emerald-100/80 bg-card/95 p-3 shadow-sm dark:border-slate-800">
            <Link
              href="/scan"
              className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              Scan New Meal
            </Link>
          </section>
        </div>

        <MealDetailSheet
          mealId={selectedMealId}
          state={mealDetailState}
          onClose={() => setSelectedMealId(null)}
          onRetry={refreshMealDetail}
        />
      </main>
      <MobileBottomNav />
    </>
  );
}
