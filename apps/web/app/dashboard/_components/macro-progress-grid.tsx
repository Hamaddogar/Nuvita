import type { DailyConsumedTotals, DailyGoalTargets, DailyProgress, DailyRemainingTotals } from "../types";
import { clampProgress, formatNumber } from "../utils";

type MacroProgressGridProps = {
  goals: DailyGoalTargets;
  consumed: DailyConsumedTotals;
  remaining: DailyRemainingTotals;
  progress: DailyProgress;
};

const macroConfig = [
  {
    key: "protein_g",
    label: "Protein",
    progressKey: "protein_percent",
    colorClass: "bg-emerald-500",
  },
  {
    key: "carbs_g",
    label: "Carbs",
    progressKey: "carbs_percent",
    colorClass: "bg-blue-500",
  },
  {
    key: "fat_g",
    label: "Fat",
    progressKey: "fat_percent",
    colorClass: "bg-amber-500",
  },
] as const;

export function MacroProgressGrid({ goals, consumed, remaining, progress }: MacroProgressGridProps) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold">Macro progress</h2>
      <div className="mt-3 grid gap-3">
        {macroConfig.map((macro) => {
          const consumedValue = consumed[macro.key];
          const goalValue = goals[macro.key];
          const remainingValue = remaining[macro.key];
          const progressValue = progress[macro.progressKey];
          const visualProgress = clampProgress(progressValue);
          const overTarget = remainingValue < 0;

          return (
            <article key={macro.key} className="rounded-2xl border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{macro.label}</p>
                <p className="text-xs text-muted-foreground">{Math.round(progressValue)}%</p>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${overTarget ? "bg-red-500" : macro.colorClass}`}
                  style={{ width: `${visualProgress}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-xs">
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
