import Link from "next/link";
import { Activity, Flame, Footprints, RefreshCw } from "lucide-react";
import type { AsyncResourceState, HealthDataSummaryResponse } from "@/app/integrations/types";
import { formatDistanceKm, formatMetricNumber, providerDisplayName, statusLabel } from "@/app/integrations/utils";

type HealthSyncCardProps = {
  state: AsyncResourceState<HealthDataSummaryResponse>;
  onRefresh: () => void;
};

function connectedProviderCount(data: HealthDataSummaryResponse) {
  return data.integration_status.filter(
    (entry) => entry.status !== "disconnected" && entry.status !== "native_required"
  ).length;
}

export function HealthSyncCard({ state, onRefresh }: HealthSyncCardProps) {
  const data = state.status === "success" ? state.data : null;

  if (state.status === "loading" && !data) {
    return (
      <section className="rounded-3xl border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">Loading wearable summary...</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
        <p>{state.error}</p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-2 rounded-lg border border-red-300 bg-white px-2 py-1 text-xs dark:border-red-700 dark:bg-transparent"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const activeProviders = connectedProviderCount(data);

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Wearable sync</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {activeProviders > 0
          ? `${activeProviders} provider${activeProviders === 1 ? "" : "s"} connected`
          : "No active web-connected providers yet"}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl border bg-background p-2">
          <p className="inline-flex items-center gap-1 text-muted-foreground">
            <Footprints className="h-3.5 w-3.5" />
            Steps
          </p>
          <p className="mt-1 text-sm font-semibold">{formatMetricNumber(data.steps_today)}</p>
        </div>
        <div className="rounded-xl border bg-background p-2">
          <p className="inline-flex items-center gap-1 text-muted-foreground">
            <Flame className="h-3.5 w-3.5" />
            kcal
          </p>
          <p className="mt-1 text-sm font-semibold">{formatMetricNumber(data.active_calories_today)}</p>
        </div>
        <div className="rounded-xl border bg-background p-2">
          <p className="inline-flex items-center gap-1 text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            km
          </p>
          <p className="mt-1 text-sm font-semibold">{formatDistanceKm(data.distance_meters_today)}</p>
        </div>
      </div>

      {data.latest_weight ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Latest weight {formatMetricNumber(data.latest_weight.weight, 1)} {data.latest_weight.unit} from{" "}
          {providerDisplayName(data.latest_weight.provider)}.
        </p>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">
        {data.integration_status.map((entry) => `${providerDisplayName(entry.provider)}: ${statusLabel(entry.status)}`).join(" • ")}
      </p>

      <Link href="/integrations" className="mt-3 inline-flex rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
        Manage integrations
      </Link>
    </section>
  );
}
