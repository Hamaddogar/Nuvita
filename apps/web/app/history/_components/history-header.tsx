"use client";
import { NuvitaLogo } from "@/components/nuvita-logo";

type HistoryHeaderProps = {
  fullName: string | null;
};

function getFirstName(fullName: string | null): string {
  if (!fullName) {
    return "Athlete";
  }
  const [firstName] = fullName.trim().split(/\s+/);
  return firstName || "Athlete";
}

export function HistoryHeader({ fullName }: HistoryHeaderProps) {
  return (
    <header className="rounded-3xl border border-emerald-100/80 bg-card/95 p-5 shadow-sm dark:border-slate-800">
      <div className="mb-3">
        <NuvitaLogo />
      </div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Premium history</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Meal timeline</h1>
      <p className="mt-1 text-sm text-muted-foreground">Review your daily nutrition trends, {getFirstName(fullName)}.</p>
    </header>
  );
}
