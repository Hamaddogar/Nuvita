import type { AIInsightItem, InsightSource } from "../types";
import { CoachingCard } from "./coaching-card";
import { NutritionWarningCard } from "./nutrition-warning-card";

type InsightsFeedProps = {
  insights: AIInsightItem[];
  source: InsightSource;
  fallbackReason: string | null;
};

function SourceBanner({ source, fallbackReason }: { source: InsightSource; fallbackReason: string | null }) {
  if (source === "ai") {
    return null;
  }

  if (source === "fallback") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300">
        <p className="font-medium">Using reliable fallback coaching while AI is unavailable.</p>
        {fallbackReason ? <p className="mt-1 text-xs opacity-90">{fallbackReason}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300">
      <p className="font-medium">Using mixed AI + rule-based coaching for complete coverage.</p>
      {fallbackReason ? <p className="mt-1 text-xs opacity-90">{fallbackReason}</p> : null}
    </div>
  );
}

export function InsightsFeed({ insights, source, fallbackReason }: InsightsFeedProps) {
  return (
    <section className="space-y-3 rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Today&apos;s coaching</h2>
        <span className="text-xs text-muted-foreground">{insights.length} cards</span>
      </div>

      <SourceBanner source={source} fallbackReason={fallbackReason} />

      <div className="space-y-3">
        {insights.map((insight) =>
          insight.priority === "high" || insight.type === "warning" ? (
            <NutritionWarningCard key={insight.id} insight={insight} />
          ) : (
            <CoachingCard key={insight.id} insight={insight} />
          )
        )}
      </div>
    </section>
  );
}
