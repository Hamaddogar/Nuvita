import { Flame } from "lucide-react";
import { clampProgress, formatNumber } from "../utils";

type CaloriesProgressCardProps = {
  consumedCalories: number;
  remainingCalories: number;
  calorieGoal: number;
  progressPercent: number;
  mealsCount: number;
};

export function CaloriesProgressCard({
  consumedCalories,
  remainingCalories,
  calorieGoal,
  progressPercent,
  mealsCount,
}: CaloriesProgressCardProps) {
  const visualProgress = clampProgress(progressPercent);
  const overTarget = remainingCalories < 0;
  const absoluteRemaining = Math.abs(remainingCalories);
  const hasGoal = calorieGoal > 0;

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Calories remaining</p>
          <p className={`mt-2 text-4xl font-bold tracking-tight ${overTarget ? "text-red-600" : "text-foreground"}`}>
            {formatNumber(absoluteRemaining)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {overTarget ? "Over target today" : "kcal left for today"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
          <Flame className={`h-3.5 w-3.5 ${overTarget ? "text-red-500" : "text-orange-500"}`} />
          {mealsCount} meal{mealsCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${overTarget ? "bg-red-500" : "bg-primary"}`}
          style={{ width: `${visualProgress}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl border bg-background p-2">
          <p className="text-muted-foreground">Consumed</p>
          <p className="mt-1 font-semibold">{formatNumber(consumedCalories)} kcal</p>
        </div>
        <div className="rounded-xl border bg-background p-2">
          <p className="text-muted-foreground">Goal</p>
          <p className="mt-1 font-semibold">{formatNumber(calorieGoal)} kcal</p>
        </div>
        <div className="rounded-xl border bg-background p-2">
          <p className="text-muted-foreground">Progress</p>
          <p className="mt-1 font-semibold">{Math.round(progressPercent)}%</p>
        </div>
      </div>

      {!hasGoal ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Calorie goal is not set yet. Complete onboarding/profile goals to unlock remaining-target tracking.
        </p>
      ) : null}
    </section>
  );
}
