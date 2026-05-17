export function DashboardSkeleton() {
  return (
    <section className="space-y-4 animate-pulse">
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="mt-3 h-10 w-32 rounded bg-muted" />
        <div className="mt-4 h-2 w-full rounded bg-muted" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="h-14 rounded-xl bg-muted" />
          <div className="h-14 rounded-xl bg-muted" />
          <div className="h-14 rounded-xl bg-muted" />
        </div>
      </div>

      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="mt-3 space-y-3">
          <div className="h-20 rounded-2xl bg-muted" />
          <div className="h-20 rounded-2xl bg-muted" />
          <div className="h-20 rounded-2xl bg-muted" />
        </div>
      </div>

      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="h-5 w-28 rounded bg-muted" />
        <div className="mt-3 space-y-3">
          <div className="h-24 rounded-2xl bg-muted" />
          <div className="h-24 rounded-2xl bg-muted" />
        </div>
      </div>
    </section>
  );
}
