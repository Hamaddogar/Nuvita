"use client";

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
    <header className="rounded-3xl border bg-card p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Premium history</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Meal timeline</h1>
      <p className="mt-1 text-sm text-muted-foreground">Review your daily nutrition trends, {getFirstName(fullName)}.</p>
    </header>
  );
}
