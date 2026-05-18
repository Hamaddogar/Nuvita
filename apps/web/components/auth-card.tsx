import type { ReactNode } from "react";
import { NuvitaLogo } from "@/components/nuvita-logo";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
      <section className="w-full rounded-3xl border border-emerald-100/80 bg-card/95 p-6 shadow-sm backdrop-blur dark:border-slate-800">
        <NuvitaLogo className="mb-4" />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6 space-y-4">{children}</div>
      </section>
    </main>
  );
}
