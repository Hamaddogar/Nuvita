import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "../utils";
import type { AsyncResourceState, WaterHistoryResponse } from "../wellness-types";

type HydrationTrendCardProps = {
  state: AsyncResourceState<WaterHistoryResponse>;
  onRefresh: () => void;
};

type TrendDatum = {
  label: string;
  total: number;
  goal: number;
};

function formatLabel(dateValue: string) {
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function HydrationTrendCard({ state, onRefresh }: HydrationTrendCardProps) {
  const hasData = state.status === "success" || state.status === "empty";
  const chartData: TrendDatum[] = hasData
    ? state.data.entries.map((entry) => ({
        label: formatLabel(entry.date),
        total: entry.total_ml,
        goal: entry.goal_ml,
      }))
    : [];

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">14-day hydration trend</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      {state.status === "loading" ? <p className="mt-4 text-sm text-muted-foreground">Loading hydration trend...</p> : null}

      {state.status === "error" ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <p>{state.error}</p>
        </div>
      ) : null}

      {hasData ? (
        chartData.length > 0 ? (
          <div className="mt-4 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${formatNumber(value)} ml`,
                    name === "goal" ? "Goal" : "Intake",
                  ]}
                />
                <Bar dataKey="goal" fill="rgb(186 230 253)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="total" fill="rgb(14 165 233)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No hydration history yet.</p>
        )
      ) : null}
    </section>
  );
}
