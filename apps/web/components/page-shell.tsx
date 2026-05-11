import Link from "next/link";
import type { ReactNode } from "react";

export function PageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-8">
      <header className="mb-6 rounded-3xl border bg-card p-5 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </header>
      <section className="rounded-3xl border bg-card p-5 shadow-sm">
        {children ?? (
          <p className="text-sm text-muted-foreground">
            This page is scaffolded and ready for feature implementation.
          </p>
        )}
      </section>
      <nav className="mt-6 grid grid-cols-3 gap-2 text-center text-xs">
        <Link className="rounded-xl border p-2 hover:bg-muted" href="/dashboard">
          Dashboard
        </Link>
        <Link className="rounded-xl border p-2 hover:bg-muted" href="/scan">
          Scan
        </Link>
        <Link className="rounded-xl border p-2 hover:bg-muted" href="/profile">
          Profile
        </Link>
      </nav>
    </main>
  );
}
