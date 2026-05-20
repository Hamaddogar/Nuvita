import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "../utils";
import type { AsyncResourceState, WeightTrackingSnapshot } from "../wellness-types";

type WeightTrendCardProps = {
  state: AsyncResourceState<WeightTrackingSnapshot>;
  onRefresh: () => void;
};

type TrendDatum = {
  label: string;
  weight: number;
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

export function WeightTrendCard({ state, onRefresh }: WeightTrendCardProps) {
  const hasData = state.status === "success" || state.status === "empty";
  const snapshot = hasData ? state.data : null;
  const summary = snapshot?.summary ?? null;
  const trend = summary?.trend ?? [];
  const unit = summary?.unit ?? "kg";

  const chartData: TrendDatum[] = trend.map((point) => ({
    label: formatLabel(point.date),
    weight: point.weight,
  }));

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Weight trend</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      {state.status === "loading" ? <p className="mt-4 text-sm text-muted-foreground">Loading weight trend...</p> : null}

      {state.status === "error" ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <p>{state.error}</p>
        </div>
      ) : null}

      {hasData ? (
        chartData.length > 0 ? (
          <div className="mt-4 h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => `${formatNumber(value)} ${unit}`} />
                {summary?.target_weight ? (
                  <ReferenceLine
                    y={summary.target_weight}
                    stroke="rgb(168 85 247)"
                    strokeDasharray="4 4"
                    label={{ value: "Goal", position: "insideTopRight", fill: "rgb(168 85 247)", fontSize: 10 }}
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="rgb(124 58 237)"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Log your first weight entry to unlock trend insights.</p>
        )
      ) : null}
    </section>
  );
}
