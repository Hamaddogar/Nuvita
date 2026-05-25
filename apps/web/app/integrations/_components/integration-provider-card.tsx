import { Link2, RefreshCw, Unplug } from "lucide-react";
import type { IntegrationProviderCard as IntegrationProviderCardType, MutationState } from "../types";
import { formatDateTime, statusBadgeClasses, statusLabel } from "../utils";

type IntegrationProviderCardProps = {
  integration: IntegrationProviderCardType;
  mutationState: MutationState;
  onConnect: (provider: IntegrationProviderCardType["provider"]) => void;
  onSync: (provider: IntegrationProviderCardType["provider"]) => void;
  onDisconnect: (provider: IntegrationProviderCardType["provider"]) => void;
};

function canSync(status: IntegrationProviderCardType["status"]) {
  return status === "connected" || status === "sync_success" || status === "sync_error";
}

function canDisconnect(status: IntegrationProviderCardType["status"]) {
  return status === "connected" || status === "sync_success" || status === "sync_error" || status === "permission_required";
}

function canConnect(integration: IntegrationProviderCardType) {
  if (!integration.supports_web_oauth || integration.requires_native_app) {
    return false;
  }
  return integration.status === "disconnected" || integration.status === "sync_error" || integration.status === "permission_required";
}

export function IntegrationProviderCard({
  integration,
  mutationState,
  onConnect,
  onSync,
  onDisconnect,
}: IntegrationProviderCardProps) {
  const isBusy = mutationState.status === "pending" && mutationState.provider === integration.provider;
  const connectedAtLabel = formatDateTime(integration.connected_at);
  const lastSyncedLabel = formatDateTime(integration.last_synced_at);

  return (
    <article className="rounded-3xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{integration.display_name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{integration.supports_web_oauth ? "Web OAuth supported" : "Web OAuth unavailable"}</p>
        </div>
        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium uppercase ${statusBadgeClasses(integration.status)}`}>
          {statusLabel(integration.status)}
        </span>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {integration.message || "Sync activity and body metrics to enrich coaching context."}
      </p>

      {integration.data_types.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {integration.data_types.map((type) => (
            <span key={type} className="rounded-full border bg-background px-2 py-1 text-[10px] uppercase text-muted-foreground">
              {type.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border bg-background p-2">
          <dt className="text-muted-foreground">Connected</dt>
          <dd className="mt-1 font-medium">{connectedAtLabel ?? "--"}</dd>
        </div>
        <div className="rounded-xl border bg-background p-2">
          <dt className="text-muted-foreground">Last sync</dt>
          <dd className="mt-1 font-medium">{lastSyncedLabel ?? "--"}</dd>
        </div>
      </dl>

      {integration.permissions.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Granted: {integration.permissions.join(", ")}</p>
      ) : null}

      {integration.last_error ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300">
          {integration.last_error}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {canConnect(integration) ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onConnect(integration.provider)}
            className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Link2 className="h-3.5 w-3.5" />
            {isBusy && mutationState.action === "connect" ? "Connecting..." : "Connect"}
          </button>
        ) : null}

        {canSync(integration.status) ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onSync(integration.provider)}
            className="inline-flex items-center gap-1 rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isBusy && mutationState.action === "sync" ? "animate-spin" : ""}`} />
            {isBusy && mutationState.action === "sync" ? "Syncing..." : "Sync"}
          </button>
        ) : null}

        {canDisconnect(integration.status) ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              if (window.confirm(`Disconnect ${integration.display_name}? You can reconnect anytime.`)) {
                onDisconnect(integration.provider);
              }
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
          >
            <Unplug className="h-3.5 w-3.5" />
            {isBusy && mutationState.action === "disconnect" ? "Disconnecting..." : "Disconnect"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
