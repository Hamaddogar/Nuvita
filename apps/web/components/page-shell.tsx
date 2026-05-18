import type { ReactNode } from "react";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { NuvitaLogo } from "@/components/nuvita-logo";

export function PageShell({
  title,
  description,
  showBottomNav = true,
  children,
}: {
  title: string;
  description: string;
  showBottomNav?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 pb-24">
        <header className="mb-4 rounded-3xl border border-emerald-100/80 bg-card/95 p-5 shadow-sm dark:border-slate-800">
          <div className="mb-3">
            <NuvitaLogo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </header>
        <section className="rounded-3xl border border-emerald-100/80 bg-card/95 p-5 shadow-sm dark:border-slate-800">
          {children ?? (
            <p className="text-sm text-muted-foreground">
              This page is scaffolded and ready for feature implementation.
            </p>
          )}
        </section>
      </main>
      {showBottomNav ? <MobileBottomNav /> : null}
    </>
  );
}
