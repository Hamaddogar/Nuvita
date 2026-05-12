"use client";

import { Gauge, Sparkles } from "lucide-react";
import type { MacroTotals } from "../meal-confirmation-types";

type MacroSummaryCardProps = {
  totals: MacroTotals;
  itemCount: number;
  averageConfidence: number;
};

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, "") : "0";
}

export function MacroSummaryCard({ totals, itemCount, averageConfidence }: MacroSummaryCardProps) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-primary" />
          Meal nutrition summary
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI confidence {Math.round(averageConfidence * 100)}%
        </div>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {itemCount} item{itemCount === 1 ? "" : "s"} included.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Calories</p>
          <p className="mt-1 text-lg font-semibold">{formatNumber(totals.calories)}</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Protein</p>
          <p className="mt-1 text-lg font-semibold">{formatNumber(totals.protein_g)}g</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Carbs</p>
          <p className="mt-1 text-lg font-semibold">{formatNumber(totals.carbs_g)}g</p>
        </div>
        <div className="rounded-xl border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fat</p>
          <p className="mt-1 text-lg font-semibold">{formatNumber(totals.fat_g)}g</p>
        </div>
      </div>
    </section>
  );
}
