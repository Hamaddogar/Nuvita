"use client";

import { Loader2, RefreshCw } from "lucide-react";

type DailySummaryHeaderProps = {
  fullName: string | null;
  dateLabel: string;
  isRefreshing: boolean;
  onRefresh: () => void;
};

function getFirstName(fullName: string | null): string {
  if (!fullName) {
    return "Athlete";
  }
  const [firstName] = fullName.trim().split(/\s+/);
  return firstName || "Athlete";
}

export function DailySummaryHeader({
  fullName,
  dateLabel,
  isRefreshing,
  onRefresh,
}: DailySummaryHeaderProps) {
  return (
    <header className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Daily dashboard</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hi, {getFirstName(fullName)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{dateLabel}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1 rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
        >
          {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {isRefreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>
    </header>
  );
}
