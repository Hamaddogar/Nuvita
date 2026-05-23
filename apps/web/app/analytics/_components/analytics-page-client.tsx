"use client";

import Link from "next/link";
import { Loader2, RefreshCw, Sparkles, Trophy, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { NuvitaLogo } from "@/components/nuvita-logo";
import { AnalyticsErrorState } from "./analytics-error-state";
import { AnalyticsSkeleton } from "./analytics-skeleton";
import { useAnalyticsDashboard } from "../use-analytics";
import { formatDateLong, formatDateShort, formatNumber, getLocalDateISO, resolveTimezone, trendClass, trendLabel } from "../utils";
import type { GoalAdherenceBreakdown, WeightUnit } from "../types";

type AnalyticsPageClientProps = {
  fullName: string | null;
};

function firstName(fullName: string | null): string {
  if (!fullName) {
    return "Athlete";
  }
  const [name] = fullName.trim().split(/\s+/);
  return name || "Athlete";
}

function adherenceRows(adherence: GoalAdherenceBreakdown) {
  return [
    { label: "Calories", value: adherence.calories_percent },
    { label: "Protein", value: adherence.protein_percent },
    { label: "Carbs", value: adherence.carbs_percent },
    { label: "Fat", value: adherence.fat_percent },
    { label: "Hydration", value: adherence.hydration_percent },
    { label: "Overall", value: adherence.overall_percent },
  ];
}

function SectionError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-lg border border-red-300 bg-white px-2 py-1 text-xs dark:border-red-700 dark:bg-transparent"
      >
        Retry
      </button>
    </section>
  );
}

export function AnalyticsPageClient({ fullName }: AnalyticsPageClientProps) {
  const [requestedDate, setRequestedDate] = useState<string>(() => getLocalDateISO());
  const [timezone, setTimezone] = useState<string>("UTC");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");

  useEffect(() => {
    setRequestedDate(getLocalDateISO());
    setTimezone(resolveTimezone());
  }, []);

  const {
    weeklyState,
    monthlyState,
    streaksState,
    achievementsState,
    summaryState,
    refresh,
  } = useAnalyticsDashboard({
    date: requestedDate,
    timezone,
    unit: weightUnit,
  });

  const allLoading =
    weeklyState.status === "loading" &&
    monthlyState.status === "loading" &&
    streaksState.status === "loading" &&
    achievementsState.status === "loading" &&
    summaryState.status === "loading";

  const allError =
    weeklyState.status === "error" &&
    monthlyState.status === "error" &&
    streaksState.status === "error" &&
    achievementsState.status === "error" &&
    summaryState.status === "error";

  const isRefreshing =
    weeklyState.status === "loading" ||
    monthlyState.status === "loading" ||
    streaksState.status === "loading" ||
    achievementsState.status === "loading" ||
    summaryState.status === "loading";

  const weeklyData = weeklyState.status === "success" ? weeklyState.data : null;
  const monthlyData = monthlyState.status === "success" ? monthlyState.data : null;
  const streaksData = streaksState.status === "success" ? streaksState.data : null;
  const achievementsData = achievementsState.status === "success" ? achievementsState.data : null;
  const summaryData = summaryState.status === "success" ? summaryState.data : null;

  const selectedDateLabel = useMemo(() => {
    if (weeklyData) {
      return formatDateLong(weeklyData.summary.week_end);
    }
    return formatDateLong(requestedDate);
  }, [weeklyData, requestedDate]);

  const weeklyChartData = useMemo(
    () =>
      weeklyData?.daily_metrics.map((metric) => ({
        label: formatDateShort(metric.date),
        calories: metric.calories,
        protein: metric.protein_g,
      })) || [],
    [weeklyData]
  );

  const monthlyChartData = useMemo(
    () =>
      monthlyData?.daily_metrics.map((metric) => ({
        label: formatDateShort(metric.date),
        hydration: metric.hydration_ml,
        weight: metric.weight,
      })) || [],
    [monthlyData]
  );

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
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Advanced analytics</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hi, {firstName(fullName)}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{selectedDateLabel}</p>
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

          {allLoading ? <AnalyticsSkeleton /> : null}

          {allError ? (
            <AnalyticsErrorState
              message={
                [
                  weeklyState.status === "error" ? weeklyState.error : null,
                  monthlyState.status === "error" ? monthlyState.error : null,
                  streaksState.status === "error" ? streaksState.error : null,
                  achievementsState.status === "error" ? achievementsState.error : null,
                  summaryState.status === "error" ? summaryState.error : null,
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onRetry={refresh}
            />
          ) : null}

          {!allError && weeklyData ? (
            <section className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Weekly adherence</h2>
                <span className="text-xs text-muted-foreground">{weeklyData.summary.days_tracked}/7 tracked</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border bg-background p-2">
                  <p className="text-muted-foreground">Calorie trend</p>
                  <p className={`mt-1 text-sm font-semibold ${trendClass(weeklyData.summary.calorie_trend)}`}>
                    {trendLabel(weeklyData.summary.calorie_trend)}
                  </p>
                </div>
                <div className="rounded-xl border bg-background p-2">
                  <p className="text-muted-foreground">Weight trend</p>
                  <p className={`mt-1 text-sm font-semibold ${trendClass(weeklyData.summary.weight_trend)}`}>
                    {trendLabel(weeklyData.summary.weight_trend)}
                  </p>
                </div>
                <div className="rounded-xl border bg-background p-2">
                  <p className="text-muted-foreground">Protein consistency</p>
                  <p className="mt-1 text-sm font-semibold">{weeklyData.summary.protein_consistency_score}%</p>
                </div>
                <div className="rounded-xl border bg-background p-2">
                  <p className="text-muted-foreground">Hydration consistency</p>
                  <p className="mt-1 text-sm font-semibold">{weeklyData.summary.hydration_consistency_score}%</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {adherenceRows(weeklyData.summary.goal_adherence).map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium">{row.value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, row.value))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!allError && weeklyState.status === "error" ? (
            <SectionError title="Weekly analytics unavailable" message={weeklyState.error} onRetry={refresh} />
          ) : null}

          {!allError && weeklyData ? (
            <section className="rounded-3xl border bg-card p-5 shadow-sm">
              <h2 className="text-base font-semibold">Calorie & protein trend</h2>
              {weeklyChartData.length > 0 ? (
                <div className="mt-4 h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyChartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value, name) => [
                          name === "calories"
                            ? `${formatNumber(Number(value) || 0)} kcal`
                            : `${formatNumber(Number(value) || 0)} g`,
                          name === "calories" ? "Calories" : "Protein",
                        ]}
                      />
                      <Line yAxisId="left" type="monotone" dataKey="calories" stroke="rgb(22 163 74)" strokeWidth={2} dot={{ r: 2 }} />
                      <Line yAxisId="right" type="monotone" dataKey="protein" stroke="rgb(59 130 246)" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No weekly trend data yet.</p>
              )}
            </section>
          ) : null}

          {!allError && monthlyData ? (
            <section className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Hydration & weight trend</h2>
                <div className="inline-flex rounded-xl border bg-background p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setWeightUnit("kg")}
                    className={`rounded-lg px-2 py-1 ${weightUnit === "kg" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeightUnit("lb")}
                    className={`rounded-lg px-2 py-1 ${weightUnit === "lb" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    lb
                  </button>
                </div>
              </div>
              {monthlyChartData.length > 0 ? (
                <div className="mt-4 h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlyChartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value, name) => {
                          if (value === null || value === undefined) {
                            return ["--", name];
                          }
                          const numeric = Number(value);
                          if (!Number.isFinite(numeric)) {
                            return ["--", name];
                          }
                          if (name === "hydration") {
                            return [`${formatNumber(numeric)} ml`, "Hydration"];
                          }
                          return [`${formatNumber(numeric)} ${weightUnit}`, "Weight"];
                        }}
                      />
                      <Bar yAxisId="left" dataKey="hydration" fill="rgb(14 165 233)" radius={[4, 4, 0, 0]} />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="weight"
                        stroke="rgb(124 58 237)"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No monthly hydration/weight trend data yet.</p>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border bg-background p-2">
                  <p className="text-muted-foreground">30-day adherence</p>
                  <p className="mt-1 text-sm font-semibold">{monthlyData.summary.average_goal_adherence_percent}%</p>
                </div>
                <div className="rounded-xl border bg-background p-2">
                  <p className="text-muted-foreground">Tracked days</p>
                  <p className="mt-1 text-sm font-semibold">{monthlyData.summary.days_tracked}</p>
                </div>
              </div>
            </section>
          ) : null}

          {!allError && monthlyState.status === "error" ? (
            <SectionError title="Monthly analytics unavailable" message={monthlyState.error} onRetry={refresh} />
          ) : null}

          {!allError && weeklyData ? (
            <section className="rounded-3xl border bg-card p-5 shadow-sm">
              <h2 className="text-base font-semibold">Weekly macro averages</h2>
              <div className="mt-3 space-y-2">
                {weeklyData.summary.weekly_macro_averages.map((item) => (
                  <div key={item.macro} className="rounded-xl border bg-background p-3">
                    <div className="flex items-center justify-between text-xs">
                      <p className="font-medium capitalize">{item.macro.replace("_", " ")}</p>
                      <p className="text-muted-foreground">{item.adherence_percent}% adherence</p>
                    </div>
                    <p className="mt-1 text-sm">
                      {formatNumber(item.average)} / {formatNumber(item.goal)}{" "}
                      {item.macro === "hydration_ml" ? "ml" : item.macro === "calories" ? "kcal" : "g"}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!allError && streaksData ? (
            <section className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h2 className="text-base font-semibold">Streak indicators</h2>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {streaksData.streaks.map((streak) => (
                  <div key={streak.key} className="rounded-xl border bg-background p-3">
                    <p className="text-muted-foreground">{streak.label}</p>
                    <p className="mt-1 text-sm font-semibold">
                      {streak.current} {streak.unit}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Best: {streak.best}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!allError && streaksState.status === "error" ? (
            <SectionError title="Streak analytics unavailable" message={streaksState.error} onRetry={refresh} />
          ) : null}

          {!allError && achievementsData ? (
            <section className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <h2 className="text-base font-semibold">Achievements</h2>
                </div>
                <span className="text-xs text-muted-foreground">{achievementsData.total_unlocked} unlocked</span>
              </div>
              <div className="mt-3 space-y-2">
                {achievementsData.achievements.map((achievement) => (
                  <article key={achievement.id} className="rounded-xl border bg-background p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{achievement.title}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                          achievement.unlocked
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300"
                        }`}
                      >
                        {achievement.unlocked ? "Unlocked" : `${achievement.progress_percent}%`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{achievement.description}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {!allError && achievementsState.status === "error" ? (
            <SectionError title="Achievements unavailable" message={achievementsState.error} onRetry={refresh} />
          ) : null}

          {!allError && summaryData ? (
            <section className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <h2 className="text-base font-semibold">Smart progress summary</h2>
                </div>
                <span className="text-xs text-muted-foreground">{summaryData.summary.confidence_score}% confidence</span>
              </div>

              {summaryData.source === "fallback" ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300">
                  Using resilient fallback summary while AI is temporarily unavailable.
                  {summaryData.fallback_reason ? <p className="mt-1 opacity-90">{summaryData.fallback_reason}</p> : null}
                </div>
              ) : null}

              <p className="mt-3 text-sm font-medium">{summaryData.summary.headline}</p>

              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Wins</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {summaryData.summary.wins.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Focus areas</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {summaryData.summary.focus_areas.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Next steps</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {summaryData.summary.next_steps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <p className="rounded-xl border bg-background p-3 text-sm">{summaryData.summary.motivation}</p>
              </div>
            </section>
          ) : null}

          {!allError && summaryState.status === "error" ? (
            <SectionError title="Smart summary unavailable" message={summaryState.error} onRetry={refresh} />
          ) : null}

          <section className="sticky bottom-20 rounded-2xl border border-emerald-100/80 bg-card/95 p-3 shadow-sm dark:border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/scan"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
              >
                Scan Meal
              </Link>
              <Link
                href="/insights"
                className="inline-flex items-center justify-center rounded-xl border bg-background px-4 py-3 text-sm font-medium hover:bg-muted"
              >
                AI Coach
              </Link>
            </div>
          </section>
        </div>
      </main>
      <MobileBottomNav />
    </>
  );
}
