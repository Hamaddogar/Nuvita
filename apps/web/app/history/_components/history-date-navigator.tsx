"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";

type HistoryDateNavigatorProps = {
  dateLabel: string;
  isToday: boolean;
  canGoNext: boolean;
  isLoading: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefresh: () => void;
};

export function HistoryDateNavigator({
  dateLabel,
  isToday,
  canGoNext,
  isLoading,
  onPrevious,
  onNext,
  onToday,
  onRefresh,
}: HistoryDateNavigatorProps) {
  return (
    <section className="rounded-3xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={isLoading}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-background hover:bg-muted disabled:opacity-60"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <div className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {dateLabel}
          </div>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext || isLoading}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-background hover:bg-muted disabled:opacity-60"
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onToday}
          disabled={isToday || isLoading}
          className="inline-flex items-center justify-center rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-1 rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {isLoading ? "Refreshing" : "Refresh"}
        </button>
      </div>
    </section>
  );
}
