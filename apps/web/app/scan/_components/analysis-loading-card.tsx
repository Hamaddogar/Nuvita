"use client";

import { Loader2, Sparkles } from "lucide-react";

export function AnalysisLoadingCard() {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <h2 className="text-sm font-semibold">Analyzing your meal...</h2>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Detecting foods, estimating portion sizes, and calculating macros.
      </p>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
      </div>

      <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <p className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Food detection
        </p>
        <p className="rounded-lg border bg-background px-2 py-1">Portion estimation</p>
        <p className="rounded-lg border bg-background px-2 py-1">Macro calculation</p>
      </div>
    </section>
  );
}
