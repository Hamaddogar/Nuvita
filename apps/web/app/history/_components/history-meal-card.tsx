import { Camera, ChevronRight, Clock3 } from "lucide-react";
import type { MealHistoryEntry } from "../types";
import { formatMealTime, formatNumber, toTitleCaseMealType } from "../utils";

type HistoryMealCardProps = {
  meal: MealHistoryEntry;
  onSelect: (mealId: string) => void;
};

export function HistoryMealCard({ meal, onSelect }: HistoryMealCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(meal.id)}
      className="w-full rounded-2xl border bg-background p-4 text-left transition hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{meal.meal_name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {toTitleCaseMealType(meal.meal_type)} • {meal.item_count} item{meal.item_count === 1 ? "" : "s"}
          </p>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {formatMealTime(meal.eaten_at)}
        </span>
        {meal.image_url ? (
          <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
            <Camera className="h-3.5 w-3.5" />
            Photo
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
        <div className="rounded-lg border bg-card p-2">
          <p className="text-muted-foreground">Cal</p>
          <p className="mt-1 text-sm font-semibold">{formatNumber(meal.total_calories)}</p>
        </div>
        <div className="rounded-lg border bg-card p-2">
          <p className="text-muted-foreground">P</p>
          <p className="mt-1 text-sm font-semibold">{formatNumber(meal.total_protein_g)}g</p>
        </div>
        <div className="rounded-lg border bg-card p-2">
          <p className="text-muted-foreground">C</p>
          <p className="mt-1 text-sm font-semibold">{formatNumber(meal.total_carbs_g)}g</p>
        </div>
        <div className="rounded-lg border bg-card p-2">
          <p className="text-muted-foreground">F</p>
          <p className="mt-1 text-sm font-semibold">{formatNumber(meal.total_fat_g)}g</p>
        </div>
      </div>
    </button>
  );
}
