import type { DailyMealSummary } from "../types";
import { MealSummaryCard } from "./meal-summary-card";

type TodayMealsListProps = {
  meals: DailyMealSummary[];
};

export function TodayMealsList({ meals }: TodayMealsListProps) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Today&apos;s meals</h2>
        <p className="text-xs text-muted-foreground">
          {meals.length} entr{meals.length === 1 ? "y" : "ies"}
        </p>
      </div>
      <div className="mt-3 space-y-3">
        {meals.map((meal) => (
          <MealSummaryCard key={meal.id} meal={meal} />
        ))}
      </div>
    </section>
  );
}
