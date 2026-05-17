"use client";

import { useEffect } from "react";
import { Clock3, Loader2, RotateCcw, X } from "lucide-react";
import type { MealDetailState } from "../types";
import { formatMealTime, formatNumber, toTitleCaseMealType } from "../utils";

type MealDetailSheetProps = {
  mealId: string | null;
  state: MealDetailState;
  onClose: () => void;
  onRetry: () => void;
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatSourceLabel(source: string): string {
  return source
    .split("_")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : ""))
    .join(" ")
    .trim();
}

export function MealDetailSheet({ mealId, state, onClose, onRetry }: MealDetailSheetProps) {
  const isOpen = Boolean(mealId);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const isLoading = state.status === "idle" || state.status === "loading";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Meal details"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[88vh] w-full max-w-md overflow-hidden rounded-t-3xl border bg-background shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-center justify-between border-b bg-card px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {state.status === "success" ? state.data.meal.meal_name : "Meal details"}
            </h2>
            {state.status === "success" ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {toTitleCaseMealType(state.data.meal.meal_type)} • {formatDate(state.data.meal.eaten_at)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-background hover:bg-muted"
            aria-label="Close meal details"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[calc(88vh-4.5rem)] space-y-4 overflow-y-auto p-5">
          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-28 rounded-2xl bg-muted" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-16 rounded-xl bg-muted" />
                <div className="h-16 rounded-xl bg-muted" />
                <div className="h-16 rounded-xl bg-muted" />
                <div className="h-16 rounded-xl bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-2xl bg-muted" />
                <div className="h-20 rounded-2xl bg-muted" />
                <div className="h-20 rounded-2xl bg-muted" />
              </div>
            </div>
          ) : null}

          {state.status === "error" ? (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">{state.error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/20"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
            </section>
          ) : null}

          {state.status === "success" ? (
            <>
              {state.data.meal.image_url ? (
                <div
                  className="h-36 rounded-2xl border bg-cover bg-center"
                  style={{ backgroundImage: `url(${state.data.meal.image_url})` }}
                />
              ) : null}

              <section className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatMealTime(state.data.meal.eaten_at)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {state.data.items.length} item{state.data.items.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-muted-foreground">Cal</p>
                    <p className="mt-1 text-sm font-semibold">{formatNumber(state.data.meal.total_calories)}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-muted-foreground">P</p>
                    <p className="mt-1 text-sm font-semibold">{formatNumber(state.data.meal.total_protein_g)}g</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-muted-foreground">C</p>
                    <p className="mt-1 text-sm font-semibold">{formatNumber(state.data.meal.total_carbs_g)}g</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-muted-foreground">F</p>
                    <p className="mt-1 text-sm font-semibold">{formatNumber(state.data.meal.total_fat_g)}g</p>
                  </div>
                </div>

                {state.data.meal.notes ? (
                  <p className="mt-3 rounded-xl border bg-background p-2 text-xs text-muted-foreground">
                    {state.data.meal.notes}
                  </p>
                ) : null}
              </section>

              <section className="rounded-2xl border bg-card p-4">
                <h3 className="text-sm font-semibold">Items</h3>

                {state.data.items.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">No item-level details were stored for this meal.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {state.data.items.map((item) => (
                      <article key={item.id} className="rounded-xl border bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {item.portion_description || "Portion not specified"}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                            {formatSourceLabel(item.nutrition_source)}
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-lg border bg-card p-2">
                            <p className="text-muted-foreground">Calories</p>
                            <p className="mt-0.5 font-semibold">{formatNumber(item.calories)}</p>
                          </div>
                          <div className="rounded-lg border bg-card p-2">
                            <p className="text-muted-foreground">Protein</p>
                            <p className="mt-0.5 font-semibold">{formatNumber(item.protein_g)}g</p>
                          </div>
                          <div className="rounded-lg border bg-card p-2">
                            <p className="text-muted-foreground">Carbs</p>
                            <p className="mt-0.5 font-semibold">{formatNumber(item.carbs_g)}g</p>
                          </div>
                          <div className="rounded-lg border bg-card p-2">
                            <p className="text-muted-foreground">Fat</p>
                            <p className="mt-0.5 font-semibold">{formatNumber(item.fat_g)}g</p>
                          </div>
                        </div>

                        {(item.category || item.estimated_weight_g !== null || item.notes) ? (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {item.category ? `${item.category}` : "Unknown category"}
                            {item.estimated_weight_g !== null ? ` • ${formatNumber(item.estimated_weight_g)}g` : ""}
                            {item.notes ? ` • ${item.notes}` : ""}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading details
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
