"use client";

import { CheckCircle2 } from "lucide-react";
import Image from "next/image";
import type { AnalyzeImageResponse } from "../types";

type AnalysisResultCardProps = {
  result: AnalyzeImageResponse;
  previewUrl: string | null;
};

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, "") : "0";
}

function confidencePercent(confidence: number): string {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;
}

export function AnalysisResultCard({ result, previewUrl }: AnalysisResultCardProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Analysis complete</h2>
        </div>

        {previewUrl ? (
          <div className="mt-3 overflow-hidden rounded-xl border bg-background">
            <div className="relative h-44 w-full sm:h-56">
              <Image
                src={previewUrl}
                alt="Analyzed meal"
                fill
                unoptimized
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-cover"
              />
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border bg-background p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Calories</p>
            <p className="mt-1 text-lg font-semibold">{formatNumber(result.total.calories)}</p>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Protein</p>
            <p className="mt-1 text-lg font-semibold">{formatNumber(result.total.protein_g)}g</p>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Carbs</p>
            <p className="mt-1 text-lg font-semibold">{formatNumber(result.total.carbs_g)}g</p>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fat</p>
            <p className="mt-1 text-lg font-semibold">{formatNumber(result.total.fat_g)}g</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {result.detected_foods.map((food, index) => (
          <article key={`${food.name}-${index}`} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">{food.name}</h3>
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium">
                Confidence {confidencePercent(food.confidence)}
              </span>
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              Portion: {food.quantity_estimate || "Not specified"} • Grams: {food.estimated_grams ?? "N/A"}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <p className="rounded-lg border bg-background px-2 py-1">
                Calories: <span className="font-medium">{formatNumber(food.calories)}</span>
              </p>
              <p className="rounded-lg border bg-background px-2 py-1">
                Protein: <span className="font-medium">{formatNumber(food.protein_g)}g</span>
              </p>
              <p className="rounded-lg border bg-background px-2 py-1">
                Carbs: <span className="font-medium">{formatNumber(food.carbs_g)}g</span>
              </p>
              <p className="rounded-lg border bg-background px-2 py-1">
                Fat: <span className="font-medium">{formatNumber(food.fat_g)}g</span>
              </p>
            </div>

            {food.usda_match ? (
              <p className="mt-2 text-xs text-muted-foreground">
                USDA match: {food.usda_match.description} (FDC: {food.usda_match.fdc_id})
              </p>
            ) : null}
          </article>
        ))}
      </div>

      {result.notes.length > 0 ? (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Notes</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
            {result.notes.map((note, index) => (
              <li key={`${note}-${index}`}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
