import type { MealHistoryEntry } from "../types";
import { HistoryMealCard } from "./history-meal-card";

type HistoryMealsListProps = {
  meals: MealHistoryEntry[];
  onSelectMeal: (mealId: string) => void;
};

export function HistoryMealsList({ meals, onSelectMeal }: HistoryMealsListProps) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Meals</h2>
        <p className="text-xs text-muted-foreground">
          {meals.length} entr{meals.length === 1 ? "y" : "ies"}
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {meals.map((meal) => (
          <HistoryMealCard key={meal.id} meal={meal} onSelect={onSelectMeal} />
        ))}
      </div>
    </section>
  );
}
