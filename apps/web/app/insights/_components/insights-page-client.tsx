"use client";

import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { NuvitaLogo } from "@/components/nuvita-logo";
import { AIInsightSkeleton } from "./ai-insight-skeleton";
import { HealthContextCard } from "./health-context-card";
import { InsightsEmptyState } from "./insights-empty-state";
import { InsightsErrorState } from "./insights-error-state";
import { InsightsFeed } from "./insights-feed";
import { WeeklySummaryCard } from "./weekly-summary-card";
import { useAIInsightsToday, useAIInsightsWeekly } from "../use-ai-insights";
import { useHealthContext } from "../use-health-context";
import { formatInsightsDate, getLocalDateISO, humanizeGoalType, resolveTimezone } from "../utils";

type InsightsPageClientProps = {
  fullName: string | null;
};

function firstName(fullName: string | null): string {
  if (!fullName) {
    return "Athlete";
  }
  const [name] = fullName.trim().split(/\s+/);
  return name || "Athlete";
}

export function InsightsPageClient({ fullName }: InsightsPageClientProps) {
  const [requestedDate, setRequestedDate] = useState<string>(() => getLocalDateISO());
  const [timezone, setTimezone] = useState<string>("UTC");

  useEffect(() => {
    setRequestedDate(getLocalDateISO());
    setTimezone(resolveTimezone());
  }, []);

  const { state: todayState, refresh: refreshToday } = useAIInsightsToday({
    date: requestedDate,
    timezone,
  });
  const { state: weeklyState, refresh: refreshWeekly } = useAIInsightsWeekly({
    date: requestedDate,
    timezone,
  });
  const { state: healthContextState, refresh: refreshHealthContext } = useHealthContext({
    date: requestedDate,
    timezone,
  });

  const refresh = useCallback(() => {
    refreshToday();
    refreshWeekly();
    refreshHealthContext();
  }, [refreshHealthContext, refreshToday, refreshWeekly]);

  const todayData = todayState.status === "error" || todayState.status === "loading" ? null : todayState.data;
  const weeklyData = weeklyState.status === "error" || weeklyState.status === "loading" ? null : weeklyState.data;

  const dateLabel = useMemo(() => {
    if (todayData) {
      return formatInsightsDate(todayData.date);
    }
    return formatInsightsDate(requestedDate);
  }, [todayData, requestedDate]);

  const goalTypeLabel = todayData ? humanizeGoalType(todayData.summary.goal_type) : "general wellness";
  const bothLoading = !todayData && !weeklyData && todayState.status === "loading" && weeklyState.status === "loading";
  const bothError = todayState.status === "error" && weeklyState.status === "error";
  const isRefreshing =
    todayState.status === "loading" ||
    weeklyState.status === "loading" ||
    healthContextState.status === "loading";

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-md px-4 py-6 pb-24">
        <div className="space-y-4">
          <header className="rounded-3xl border border-emerald-100/80 bg-card/95 p-5 shadow-sm dark:border-slate-800">
            <div className="mb-3">
              <NuvitaLogo />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">AI insights & coaching</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hi, {firstName(fullName)}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dateLabel} • Goal: {goalTypeLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={refresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1 rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {isRefreshing ? "Refreshing" : "Refresh"}
              </button>
            </div>
          </header>

          {bothLoading ? <AIInsightSkeleton /> : null}

          {bothError ? (
            <InsightsErrorState
              message={`${todayState.error || "Unable to load today insights."} ${weeklyState.error || ""}`.trim()}
              onRetry={refresh}
            />
          ) : null}

          {!bothError && weeklyData ? <WeeklySummaryCard summary={weeklyData.summary} /> : null}

          {!bothError ? <HealthContextCard state={healthContextState} /> : null}

          {!bothError && todayData ? (
            todayData.insights.length === 0 ? (
              <InsightsEmptyState />
            ) : (
              <InsightsFeed
                insights={todayData.insights}
                source={todayData.source}
                fallbackReason={todayData.fallback_reason}
              />
            )
          ) : null}

          {!bothError && !todayData && todayState.status === "error" ? (
            <InsightsErrorState message={todayState.error} onRetry={refreshToday} />
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
