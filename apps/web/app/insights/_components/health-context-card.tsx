import Link from "next/link";
import { Activity, HeartPulse, Moon } from "lucide-react";
import type { AsyncResourceState, HealthDataSummaryResponse } from "@/app/integrations/types";
import { formatDistanceKm, formatMetricNumber, providerDisplayName } from "@/app/integrations/utils";

type HealthContextCardProps = {
  state: AsyncResourceState<HealthDataSummaryResponse>;
};

function connectedProviders(data: HealthDataSummaryResponse) {
  return data.integration_status.filter(
    (entry) => entry.status !== "disconnected" && entry.status !== "native_required"
  );
}

export function HealthContextCard({ state }: HealthContextCardProps) {
  const data = state.status === "success" ? state.data : null;

  if (state.status === "loading" && !data) {
    return (
      <section className="rounded-3xl border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">Loading wearable context...</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="rounded-3xl border bg-card p-5 text-sm text-muted-foreground shadow-sm">
        Wearable context is temporarily unavailable. Coaching is still based on nutrition logs.
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const activeProviders = connectedProviders(data);
  if (activeProviders.length === 0) {
    return (
      <section className="rounded-3xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold">Wearable context</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Fitbit to enrich coaching with steps, workouts, and recovery context.
        </p>
        <Link href="/integrations" className="mt-3 inline-flex rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
          Open integrations
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Wearable context</h2>
        <span className="text-xs text-muted-foreground">
          {activeProviders.map((entry) => providerDisplayName(entry.provider)).join(", ")}
        </span>
      </div>

      <ul className="mt-3 space-y-2 text-sm">
        <li className="rounded-xl border bg-background p-3">
          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Activity signals
          </p>
          <p className="mt-1">
            {formatMetricNumber(data.steps_today)} steps • {formatMetricNumber(data.exercise_minutes_today)} active minutes •{" "}
            {formatMetricNumber(data.active_calories_today)} active kcal • {formatDistanceKm(data.distance_meters_today)} km
          </p>
        </li>

        {data.sleep_duration_minutes !== null ? (
          <li className="rounded-xl border bg-background p-3">
            <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
              <Moon className="h-3.5 w-3.5" />
              Recovery
            </p>
            <p className="mt-1">
              Sleep duration {formatMetricNumber(data.sleep_duration_minutes)} minutes
              {data.resting_heart_rate_bpm !== null
                ? ` • resting HR ${formatMetricNumber(data.resting_heart_rate_bpm)} bpm`
                : ""}
            </p>
          </li>
        ) : null}

        {data.resting_heart_rate_bpm !== null && data.sleep_duration_minutes === null ? (
          <li className="rounded-xl border bg-background p-3">
            <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
              <HeartPulse className="h-3.5 w-3.5" />
              Heart rate
            </p>
            <p className="mt-1">Resting HR {formatMetricNumber(data.resting_heart_rate_bpm)} bpm</p>
          </li>
        ) : null}

        {data.latest_weight ? (
          <li className="rounded-xl border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Weight context</p>
            <p className="mt-1">
              Latest synced weight {formatMetricNumber(data.latest_weight.weight, 1)} {data.latest_weight.unit}
            </p>
          </li>
        ) : null}
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">
        Context lines support habit coaching and are not medical assessment or diagnosis.
      </p>
    </section>
  );
}
