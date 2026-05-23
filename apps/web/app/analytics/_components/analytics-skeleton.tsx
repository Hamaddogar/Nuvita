export function AnalyticsSkeleton() {
  return (
    <section className="space-y-3 animate-pulse">
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="mt-3 h-8 w-52 rounded bg-muted" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="h-16 rounded-xl bg-muted" />
          <div className="h-16 rounded-xl bg-muted" />
          <div className="h-16 rounded-xl bg-muted" />
          <div className="h-16 rounded-xl bg-muted" />
        </div>
      </div>
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="h-5 w-48 rounded bg-muted" />
        <div className="mt-3 h-48 rounded-2xl bg-muted" />
      </div>
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="mt-3 space-y-2">
          <div className="h-10 rounded-xl bg-muted" />
          <div className="h-10 rounded-xl bg-muted" />
          <div className="h-10 rounded-xl bg-muted" />
        </div>
      </div>
    </section>
  );
}
