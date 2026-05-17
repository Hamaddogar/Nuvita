"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

type DashboardErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function DashboardErrorState({ message, onRetry }: DashboardErrorStateProps) {
  return (
    <section className="rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-900/60 dark:bg-red-950/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600 dark:text-red-300" />
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Unable to load dashboard</h2>
            <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">{message}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/20"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
    </section>
  );
}
