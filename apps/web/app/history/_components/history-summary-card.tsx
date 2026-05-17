import type { MealHistoryGoals, MealHistoryProgress, MealHistoryRemaining, MealHistorySummary } from "../types";
import { clampProgress, formatNumber } from "../utils";

type HistorySummaryCardProps = {
  summary: MealHistorySummary;
  goals: MealHistoryGoals;
  remaining: MealHistoryRemaining;
  progress: MealHistoryProgress;
};

const macroConfig = [
  {
    summaryKey: "total_protein_g",
    goalKey: "protein_g",
    remainingKey: "protein_g",
    progressKey: "protein_percent",
    label: "Protein",
    colorClass: "bg-emerald-500",
  },
  {
    summaryKey: "total_carbs_g",
    goalKey: "carbs_g",
    remainingKey: "carbs_g",
    progressKey: "carbs_percent",
    label: "Carbs",
    colorClass: "bg-blue-500",
  },
  {
    summaryKey: "total_fat_g",
    goalKey: "fat_g",
    remainingKey: "fat_g",
    progressKey: "fat_percent",
    label: "Fat",
    colorClass: "bg-amber-500",
  },
] as const;

export function HistorySummaryCard({ summary, goals, remaining, progress }: HistorySummaryCardProps) {
  const calorieProgress = clampProgress(progress.calories_percent);
  const calorieOverTarget = remaining.calories < 0;

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Daily nutrition summary</p>
          <p className="mt-2 text-4xl font-bold tracking-tight">{formatNumber(summary.total_calories)}</p>
          <p className="mt-1 text-sm text-muted-foreground">kcal consumed • {summary.meal_count} meals logged</p>
        </div>
        <span className="inline-flex rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
          Goal {formatNumber(goals.calories)} kcal
        </span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${calorieOverTarget ? "bg-red-500" : "bg-primary"}`}
          style={{ width: `${calorieProgress}%` }}
        />
      </div>
      <p className={`mt-2 text-xs ${calorieOverTarget ? "text-red-600" : "text-muted-foreground"}`}>
        {calorieOverTarget
          ? `${formatNumber(Math.abs(remaining.calories))} kcal over your target`
          : `${formatNumber(remaining.calories)} kcal left`}
      </p>

      <div className="mt-4 grid gap-2">
        {macroConfig.map((macro) => {
          const consumedValue = summary[macro.summaryKey];
          const goalValue = goals[macro.goalKey];
          const remainingValue = remaining[macro.remainingKey];
          const progressValue = progress[macro.progressKey];
          const overTarget = remainingValue < 0;

          return (
            <article key={macro.label} className="rounded-2xl border bg-background p-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium">{macro.label}</span>
                <span className="text-muted-foreground">{Math.round(progressValue)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${overTarget ? "bg-red-500" : macro.colorClass}`}
                  style={{ width: `${clampProgress(progressValue)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">
                  {formatNumber(consumedValue)}g / {formatNumber(goalValue)}g
                </span>
                <span className={overTarget ? "font-medium text-red-600" : "text-muted-foreground"}>
                  {overTarget ? `+${formatNumber(Math.abs(remainingValue))}g over` : `${formatNumber(remainingValue)}g left`}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
