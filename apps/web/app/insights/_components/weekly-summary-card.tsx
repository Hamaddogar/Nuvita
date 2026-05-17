import { BarChart3, CalendarDays, Target, TrendingUp } from "lucide-react";
import type { WeeklyInsightSummary } from "../types";

type WeeklySummaryCardProps = {
  summary: WeeklyInsightSummary;
};

function trendBadgeClass(trend: WeeklyInsightSummary["trend"]) {
  if (trend === "improving") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300";
  }
  if (trend === "needs_attention") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300";
}

function weakestMacroLabel(value: WeeklyInsightSummary["weakest_macro"]) {
  if (value === "protein_g") {
    return "Protein";
  }
  if (value === "carbs_g") {
    return "Carbs";
  }
  if (value === "fat_g") {
    return "Fat";
  }
  if (value === "calories") {
    return "Calories";
  }
  return "N/A";
}

export function WeeklySummaryCard({ summary }: WeeklySummaryCardProps) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Weekly summary</p>
          <h2 className="mt-1 text-lg font-semibold">Progress snapshot</h2>
        </div>
        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium uppercase ${trendBadgeClass(summary.trend)}`}>
          {summary.trend.replace("_", " ")}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border bg-background p-3">
          <p className="inline-flex items-center gap-1 text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Days tracked
          </p>
          <p className="mt-1 text-sm font-semibold">{summary.days_tracked}/7</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <p className="inline-flex items-center gap-1 text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" />
            Consistency
          </p>
          <p className="mt-1 text-sm font-semibold">{summary.consistency_score}%</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <p className="inline-flex items-center gap-1 text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            Calorie adherence
          </p>
          <p className="mt-1 text-sm font-semibold">{summary.avg_calorie_adherence_percent}%</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <p className="inline-flex items-center gap-1 text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Weakest macro
          </p>
          <p className="mt-1 text-sm font-semibold">{weakestMacroLabel(summary.weakest_macro)}</p>
        </div>
      </div>

      {summary.best_day_reason ? (
        <div className="mt-4 rounded-2xl border bg-background p-3">
          <p className="text-xs font-medium text-muted-foreground">Best day insight</p>
          <p className="mt-1 text-sm">{summary.best_day_reason}</p>
        </div>
      ) : null}

      <div className="mt-3 rounded-2xl border bg-background p-3">
        <p className="text-xs font-medium text-muted-foreground">Improvement focus</p>
        <p className="mt-1 text-sm">{summary.improvement_note}</p>
      </div>
    </section>
  );
}
