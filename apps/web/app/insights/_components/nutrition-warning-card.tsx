import { AlertTriangle } from "lucide-react";
import type { AIInsightItem } from "../types";

type NutritionWarningCardProps = {
  insight: AIInsightItem;
};

export function NutritionWarningCard({ insight }: NutritionWarningCardProps) {
  return (
    <article className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900/70 dark:bg-red-950/30">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-300" />
        <div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{insight.title}</p>
          <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">{insight.message}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-900/20 dark:text-red-300">
        <p className="text-xs font-medium uppercase tracking-wide">Action now</p>
        <p className="mt-1">{insight.recommendation}</p>
      </div>
    </article>
  );
}
