"use client";

import { Heart, Plus } from "lucide-react";
import type { FoodCatalogItem } from "../food-catalog-types";
import { getFoodSourceLabel } from "../food-catalog-utils";
import { cn } from "@/lib/utils";

type FoodCatalogCardProps = {
  food: FoodCatalogItem;
  onQuickAdd: (food: FoodCatalogItem) => void;
  onSaveFavorite: (food: FoodCatalogItem) => void;
  favoritePending: boolean;
  isFavorite: boolean;
  compact?: boolean;
};

function formatMacro(value: number): string {
  return `${Math.round(Math.max(0, value))}`;
}

export function FoodCatalogCard({
  food,
  onQuickAdd,
  onSaveFavorite,
  favoritePending,
  isFavorite,
  compact = false,
}: FoodCatalogCardProps) {
  return (
    <article className={cn("rounded-2xl border bg-card p-3 shadow-sm", compact ? "space-y-2" : "space-y-3")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{food.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[food.brand, food.serving_size].filter(Boolean).join(" • ")}
          </p>
        </div>
        <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {getFoodSourceLabel(food.source)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 rounded-xl bg-background p-2 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">kcal</p>
          <p className="text-xs font-semibold">{formatMacro(food.calories)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">P</p>
          <p className="text-xs font-semibold">{formatMacro(food.protein_g)}g</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">C</p>
          <p className="text-xs font-semibold">{formatMacro(food.carbs_g)}g</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">F</p>
          <p className="text-xs font-semibold">{formatMacro(food.fat_g)}g</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onQuickAdd(food)}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Quick add
        </button>
        <button
          type="button"
          onClick={() => onSaveFavorite(food)}
          disabled={favoritePending || isFavorite}
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium",
            isFavorite ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-background",
            favoritePending ? "cursor-not-allowed opacity-60" : ""
          )}
        >
          <Heart className={cn("h-3.5 w-3.5", isFavorite ? "fill-current" : "")} />
          {isFavorite ? "Saved" : favoritePending ? "Saving..." : "Favorite"}
        </button>
      </div>
    </article>
  );
}
