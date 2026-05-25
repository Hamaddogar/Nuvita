import { Activity, Flame, Footprints, HeartPulse, Moon, Scale } from "lucide-react";
import type { AsyncResourceState, HealthDataSummaryResponse } from "../types";
import { formatDateTime, formatDistanceKm, formatMetricNumber, providerDisplayName, statusBadgeClasses, statusLabel } from "../utils";

type IntegrationsHealthSummaryCardProps = {
  state: AsyncResourceState<HealthDataSummaryResponse>;
  onRefresh: () => void;
};

export function IntegrationsHealthSummaryCard({ state, onRefresh }: IntegrationsHealthSummaryCardProps) {
  const data = state.status === "success" ? state.data : null;

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Health data summary</p>
          <h2 className="mt-1 text-base font-semibold">Synced wearable snapshot</h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      {state.status === "loading" && !data ? <p className="mt-4 text-sm text-muted-foreground">Loading synced metrics...</p> : null}

      {state.status === "error" ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {state.error}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border bg-background p-3">
              <p className="inline-flex items-center gap-1 text-muted-foreground">
                <Footprints className="h-3.5 w-3.5" />
                Steps
              </p>
              <p className="mt-1 text-sm font-semibold">{formatMetricNumber(data.steps_today)}</p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="inline-flex items-center gap-1 text-muted-foreground">
                <Flame className="h-3.5 w-3.5" />
                Active kcal
              </p>
              <p className="mt-1 text-sm font-semibold">{formatMetricNumber(data.active_calories_today, 0)}</p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="inline-flex items-center gap-1 text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                Distance (km)
              </p>
              <p className="mt-1 text-sm font-semibold">{formatDistanceKm(data.distance_meters_today)}</p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="inline-flex items-center gap-1 text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                Exercise (min)
              </p>
              <p className="mt-1 text-sm font-semibold">{formatMetricNumber(data.exercise_minutes_today)}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border bg-background p-2">
              <p className="text-muted-foreground">Workouts (week)</p>
              <p className="mt-1 text-sm font-semibold">{formatMetricNumber(data.workouts_this_week)}</p>
            </div>
            <div className="rounded-xl border bg-background p-2">
              <p className="inline-flex items-center gap-1 text-muted-foreground">
                <Moon className="h-3.5 w-3.5" />
                Sleep (min)
              </p>
              <p className="mt-1 text-sm font-semibold">{data.sleep_duration_minutes === null ? "--" : formatMetricNumber(data.sleep_duration_minutes)}</p>
            </div>
            <div className="rounded-xl border bg-background p-2">
              <p className="inline-flex items-center gap-1 text-muted-foreground">
                <HeartPulse className="h-3.5 w-3.5" />
                Resting HR
              </p>
              <p className="mt-1 text-sm font-semibold">
                {data.resting_heart_rate_bpm === null ? "--" : `${formatMetricNumber(data.resting_heart_rate_bpm)} bpm`}
              </p>
            </div>
          </div>

          {data.latest_weight ? (
            <div className="mt-3 rounded-2xl border bg-background p-3 text-xs">
              <p className="inline-flex items-center gap-1 text-muted-foreground">
                <Scale className="h-3.5 w-3.5" />
                Latest synced weight
              </p>
              <p className="mt-1 text-sm font-semibold">
                {formatMetricNumber(data.latest_weight.weight, 1)} {data.latest_weight.unit}
              </p>
              <p className="mt-1 text-muted-foreground">
                {providerDisplayName(data.latest_weight.provider)} • {formatDateTime(data.latest_weight.recorded_at) ?? data.latest_weight.recorded_at}
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1">
            {data.integration_status.map((entry) => (
              <span
                key={entry.provider}
                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium uppercase ${statusBadgeClasses(entry.status)}`}
              >
                {providerDisplayName(entry.provider)} · {statusLabel(entry.status)}
              </span>
            ))}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Synced metrics support activity-aware coaching and are informational only, not medical guidance.
          </p>
        </>
      ) : null}
    </section>
  );
}
