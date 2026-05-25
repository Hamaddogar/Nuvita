"use client";

import Link from "next/link";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { NuvitaLogo } from "@/components/nuvita-logo";
import { IntegrationProviderCard } from "./integration-provider-card";
import { IntegrationsHealthSummaryCard } from "./integrations-health-summary-card";
import { useHealthIntegrations } from "../use-health-integrations";
import { getLocalDateISO, providerDisplayName, resolveTimezone, statusLabel } from "../utils";
import type { IntegrationProvider, IntegrationStatus } from "../types";

type IntegrationsPageClientProps = {
  fullName: string | null;
  callbackProvider: string | null;
  callbackStatus: string | null;
  callbackMessage: string | null;
};

function firstName(fullName: string | null): string {
  if (!fullName) {
    return "Athlete";
  }
  const [name] = fullName.trim().split(/\s+/);
  return name || "Athlete";
}

function callbackBannerClass(status: string | null): string {
  if (status === "error" || status === "auth_required") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300";
  }
  if (status === "sync_error" || status === "permission_required") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300";
}

function toProvider(value: string | null): IntegrationProvider | null {
  if (value === "fitbit" || value === "apple_health" || value === "google_fit" || value === "health_connect") {
    return value;
  }
  return null;
}

function toStatus(value: string | null): IntegrationStatus | null {
  if (
    value === "disconnected" ||
    value === "connecting" ||
    value === "connected" ||
    value === "syncing" ||
    value === "sync_success" ||
    value === "sync_error" ||
    value === "permission_required" ||
    value === "native_required"
  ) {
    return value;
  }
  return null;
}

export function IntegrationsPageClient({
  fullName,
  callbackProvider,
  callbackStatus,
  callbackMessage,
}: IntegrationsPageClientProps) {
  const [requestedDate, setRequestedDate] = useState<string>(() => getLocalDateISO());
  const [timezone, setTimezone] = useState<string>("UTC");

  useEffect(() => {
    setRequestedDate(getLocalDateISO());
    setTimezone(resolveTimezone());
  }, []);

  const {
    integrationsState,
    healthSummaryState,
    mutationState,
    refresh,
    connectProvider,
    syncProvider,
    disconnectProvider,
    clearMutationError,
  } = useHealthIntegrations({
    date: requestedDate,
    timezone,
  });

  const isRefreshing =
    integrationsState.status === "loading" ||
    healthSummaryState.status === "loading" ||
    mutationState.status === "pending";

  const callbackTitle = useMemo(() => {
    if (!callbackStatus) {
      return null;
    }
    const provider = toProvider(callbackProvider);
    const normalizedStatus = toStatus(callbackStatus);
    if (provider && normalizedStatus) {
      return `${providerDisplayName(provider)} ${statusLabel(normalizedStatus)}`;
    }
    if (callbackStatus === "auth_required") {
      return "Sign in required";
    }
    if (callbackStatus === "error") {
      return "Integration callback failed";
    }
    return "Integration callback complete";
  }, [callbackProvider, callbackStatus]);

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-md px-4 py-6 pb-24">
        <div className="space-y-4">
          <header className="rounded-3xl border border-emerald-100/80 bg-card/95 p-5 shadow-sm dark:border-slate-800">
            <div className="mb-3">
              <NuvitaLogo />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Wearable integrations</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hi, {firstName(fullName)}</h1>
                <p className="mt-1 text-sm text-muted-foreground">Connect Fitbit and sync activity context for smarter coaching.</p>
              </div>
              <button
                type="button"
                onClick={refresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1 rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {isRefreshing ? "Refreshing" : "Refresh"}
              </button>
            </div>
          </header>

          {callbackStatus ? (
            <section className={`rounded-2xl border p-3 text-sm ${callbackBannerClass(callbackStatus)}`}>
              <p className="font-medium">{callbackTitle}</p>
              {callbackMessage ? <p className="mt-1 text-xs opacity-90">{callbackMessage}</p> : null}
            </section>
          ) : null}

          {mutationState.status === "success" ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300">
              <p className="font-medium">
                {mutationState.action === "connect"
                  ? "Connection updated"
                  : mutationState.action === "sync"
                    ? "Sync completed"
                    : "Disconnected successfully"}
              </p>
              {mutationState.message ? <p className="mt-1 text-xs opacity-90">{mutationState.message}</p> : null}
            </section>
          ) : null}

          {mutationState.status === "error" ? (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">Integration action failed</p>
                  <p className="mt-1 text-xs opacity-90">{mutationState.error}</p>
                </div>
                <button
                  type="button"
                  onClick={clearMutationError}
                  className="rounded-lg border border-red-300 bg-white px-2 py-1 text-[10px] dark:border-red-700 dark:bg-transparent"
                >
                  Dismiss
                </button>
              </div>
            </section>
          ) : null}

          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Privacy and safety</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  OAuth tokens are stored encrypted, used only for sync, and can be revoked anytime. Synced metrics are wellness context only—not medical advice.
                </p>
              </div>
            </div>
          </section>

          <IntegrationsHealthSummaryCard state={healthSummaryState} onRefresh={refresh} />

          {integrationsState.status === "loading" && !integrationsState.data ? (
            <section className="rounded-3xl border bg-card p-5 text-sm text-muted-foreground shadow-sm">
              Loading integration providers...
            </section>
          ) : null}

          {integrationsState.status === "error" ? (
            <section className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              <p>{integrationsState.error}</p>
              <button
                type="button"
                onClick={refresh}
                className="mt-2 rounded-lg border border-red-300 bg-white px-2 py-1 text-xs dark:border-red-700 dark:bg-transparent"
              >
                Retry
              </button>
            </section>
          ) : null}

          {integrationsState.status === "success" ? (
            <section className="space-y-3">
              {integrationsState.data.integrations.map((integration) => (
                <IntegrationProviderCard
                  key={integration.provider}
                  integration={integration}
                  mutationState={mutationState}
                  onConnect={connectProvider}
                  onSync={syncProvider}
                  onDisconnect={disconnectProvider}
                />
              ))}
            </section>
          ) : null}

          <section className="sticky bottom-20 rounded-2xl border border-emerald-100/80 bg-card/95 p-3 shadow-sm dark:border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl border bg-background px-4 py-3 text-sm font-medium hover:bg-muted"
              >
                Dashboard
              </Link>
              <Link
                href="/insights"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
              >
                Coaching
              </Link>
            </div>
          </section>
        </div>
      </main>
      <MobileBottomNav />
    </>
  );
}
