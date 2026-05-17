import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Clock3,
  Flame,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { AIInsightItem, InsightType } from "../types";
import { priorityBadgeClasses, typeLabel } from "../utils";
import { RecommendationChip } from "./recommendation-chip";

type CoachingCardProps = {
  insight: AIInsightItem;
};

function iconForType(type: InsightType) {
  switch (type) {
    case "calorie_balance":
      return Flame;
    case "meal_timing":
      return Clock3;
    case "consistency":
      return CalendarDays;
    case "recommendation":
      return Sparkles;
    case "motivation":
      return TrendingUp;
    case "warning":
      return AlertTriangle;
    case "weekly_summary":
      return BarChart3;
    default:
      return Activity;
  }
}

export function CoachingCard({ insight }: CoachingCardProps) {
  const InsightIcon = iconForType(insight.type);
  const recommendationLabel = insight.actionable ? "Actionable" : "Keep doing this";

  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-background">
            <InsightIcon className="h-4 w-4 text-muted-foreground" />
          </span>
          <div>
            <p className="text-sm font-semibold">{insight.title}</p>
            <p className="text-[11px] text-muted-foreground">{typeLabel(insight.type)}</p>
          </div>
        </div>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${priorityBadgeClasses(insight.priority)}`}
        >
          {insight.priority}
        </span>
      </div>

      <p className="mt-3 text-sm text-foreground/90">{insight.message}</p>

      <div className="mt-3 rounded-xl border bg-background p-3">
        <p className="text-xs font-medium text-muted-foreground">Recommendation</p>
        <p className="mt-1 text-sm">{insight.recommendation}</p>
      </div>

      <div className="mt-3">
        <RecommendationChip label={recommendationLabel} />
      </div>
    </article>
  );
}
