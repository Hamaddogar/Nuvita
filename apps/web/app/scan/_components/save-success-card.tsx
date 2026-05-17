"use client";

import Link from "next/link";
import { CheckCircle2, Sparkles } from "lucide-react";
import type { MealSaveResponse } from "../save-meal-client";

type SaveSuccessCardProps = {
  savedMeal: MealSaveResponse;
  onLogAnotherMeal: () => void;
};

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, "") : "0";
}

export function SaveSuccessCard({ savedMeal, onLogAnotherMeal }: SaveSuccessCardProps) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
        <div>
          <h2 className="text-base font-semibold">Meal saved successfully</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {savedMeal.meal.meal_name} • {savedMeal.items.length} item{savedMeal.items.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Calories</p>
          <p className="mt-1 text-lg font-semibold">{formatNumber(savedMeal.totals.calories)}</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Protein</p>
          <p className="mt-1 text-lg font-semibold">{formatNumber(savedMeal.totals.protein_g)}g</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Carbs</p>
          <p className="mt-1 text-lg font-semibold">{formatNumber(savedMeal.totals.carbs_g)}g</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fat</p>
          <p className="mt-1 text-lg font-semibold">{formatNumber(savedMeal.totals.fat_g)}g</p>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="inline-flex items-center gap-1 font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Saved meal ID: {savedMeal.meal_id}
        </p>
        <p className="mt-1">Your dashboard totals now update from saved meals.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          href="/dashboard"
          className="rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground"
        >
          View Dashboard
        </Link>
        <button
          type="button"
          onClick={onLogAnotherMeal}
          className="rounded-xl border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted"
        >
          Log Another Meal
        </button>
      </div>
    </section>
  );
}
