import Link from "next/link";

export function InsightsEmptyState() {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold">No coaching cards yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Log at least one meal to unlock personalized daily and weekly AI nutrition coaching.
      </p>
      <div className="mt-4">
        <Link
          href="/scan"
          className="inline-flex items-center justify-center rounded-xl border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Scan your next meal
        </Link>
      </div>
    </section>
  );
}
