"use client";

import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { useAIInsightsToday } from "@/app/insights/use-ai-insights";

type TodayCoachingPreviewProps = {
  date: string;
  timezone: string;
};

export function TodayCoachingPreview({ date, timezone }: TodayCoachingPreviewProps) {
  const { state, refresh } = useAIInsightsToday({ date, timezone });
  const data = state.status === "loading" || state.status === "error" ? null : state.data;
  const previewInsights = data ? data.insights.slice(0, 2) : [];

  if (!data && state.status === "loading") {
    return (
      <section className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-28 rounded bg-muted" />
          <div className="h-14 rounded-xl bg-muted" />
          <div className="h-14 rounded-xl bg-muted" />
        </div>
      </section>
    );
  }

  if (!data && state.status === "error") {
    return (
      <section className="rounded-3xl border bg-card p-5 shadow-sm">
        <div>
          <p className="text-sm font-semibold">Coaching preview is syncing</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Personalized coaching will appear automatically once data sync completes.
          </p>
          <button
            type="button"
            onClick={refresh}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!data || previewInsights.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border bg-background">
            {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          </span>
          <h2 className="text-base font-semibold">Today&apos;s coaching</h2>
        </div>
        <Link href="/insights" className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </div>

      {data.source !== "ai" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {data.source === "fallback"
            ? "Using resilient fallback coaching."
            : "Using mixed AI + fallback coaching for complete coverage."}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {previewInsights.map((insight) => (
          <article key={insight.id} className="rounded-xl border bg-background p-3">
            <p className="text-sm font-medium">{insight.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{insight.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
