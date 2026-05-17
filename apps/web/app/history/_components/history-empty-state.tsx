import Link from "next/link";
import { CalendarX2 } from "lucide-react";

type HistoryEmptyStateProps = {
  dateLabel: string;
};

export function HistoryEmptyState({ dateLabel }: HistoryEmptyStateProps) {
  return (
    <section className="rounded-3xl border border-dashed bg-card p-6 text-center shadow-sm">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
        <CalendarX2 className="h-5 w-5 text-primary" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">No meals logged for {dateLabel}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Scan your meals to build a complete timeline and unlock richer trend insights.
      </p>
      <Link
        href="/scan"
        className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
      >
        Scan a Meal
      </Link>
    </section>
  );
}
