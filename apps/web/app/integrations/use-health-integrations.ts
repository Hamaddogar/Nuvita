"use client";

import { useCallback, useEffect, useState } from "react";
import {
  connectIntegrationProvider,
  disconnectIntegrationProvider,
  fetchHealthSummary,
  fetchIntegrationsList,
  syncIntegrationProvider,
} from "./integrations-client";
import type {
  AsyncResourceState,
  HealthDataSummaryResponse,
  IntegrationProvider,
  IntegrationsListResponse,
  MutationState,
} from "./types";

type UseHealthIntegrationsParams = {
  date: string;
  timezone: string;
};

const loadingIntegrationsState: AsyncResourceState<IntegrationsListResponse> = {
  status: "loading",
  data: null,
  error: null,
};

const loadingHealthSummaryState: AsyncResourceState<HealthDataSummaryResponse> = {
  status: "loading",
  data: null,
  error: null,
};

const idleMutationState: MutationState = {
  status: "idle",
  provider: null,
  action: null,
  message: null,
  error: null,
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function useHealthIntegrations({ date, timezone }: UseHealthIntegrationsParams) {
  const [integrationsState, setIntegrationsState] =
    useState<AsyncResourceState<IntegrationsListResponse>>(loadingIntegrationsState);
  const [healthSummaryState, setHealthSummaryState] =
    useState<AsyncResourceState<HealthDataSummaryResponse>>(loadingHealthSummaryState);
  const [mutationState, setMutationState] = useState<MutationState>(idleMutationState);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  const clearMutationError = useCallback(() => {
    setMutationState((previous) => (previous.status === "error" ? idleMutationState : previous));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIntegrationsState((previous) =>
      previous.status === "success" ? previous : loadingIntegrationsState
    );
    setHealthSummaryState((previous) =>
      previous.status === "success" ? previous : loadingHealthSummaryState
    );

    void (async () => {
      const [integrationsResult, summaryResult] = await Promise.allSettled([
        fetchIntegrationsList(),
        fetchHealthSummary({ date, timezone }),
      ]);
      if (cancelled) {
        return;
      }

      if (integrationsResult.status === "fulfilled") {
        setIntegrationsState({ status: "success", data: integrationsResult.value, error: null });
      } else {
        setIntegrationsState({
          status: "error",
          data: null,
          error: toErrorMessage(integrationsResult.reason, "Unable to load integrations."),
        });
      }

      if (summaryResult.status === "fulfilled") {
        setHealthSummaryState({ status: "success", data: summaryResult.value, error: null });
      } else {
        setHealthSummaryState({
          status: "error",
          data: null,
          error: toErrorMessage(summaryResult.reason, "Unable to load health summary."),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, timezone, refreshTick]);

  const connectProvider = useCallback(
    async (provider: IntegrationProvider) => {
      setMutationState({
        status: "pending",
        provider,
        action: "connect",
        message: null,
        error: null,
      });
      try {
        const callbackUrl = `${window.location.origin}/api/integrations/${provider}/callback`;
        const response = await connectIntegrationProvider({
          provider,
          redirect_to: callbackUrl,
        });
        if (response.authorization_url) {
          window.location.assign(response.authorization_url);
          return;
        }
        setMutationState({
          status: "success",
          provider,
          action: "connect",
          message: response.message ?? "Provider connection status updated.",
          error: null,
        });
        refresh();
      } catch (error) {
        setMutationState({
          status: "error",
          provider,
          action: "connect",
          message: null,
          error: toErrorMessage(error, "Unable to connect provider."),
        });
      }
    },
    [refresh]
  );

  const syncProvider = useCallback(
    async (provider: IntegrationProvider, days = 7) => {
      setMutationState({
        status: "pending",
        provider,
        action: "sync",
        message: null,
        error: null,
      });
      try {
        const response = await syncIntegrationProvider({ provider, days });
        setMutationState({
          status: "success",
          provider,
          action: "sync",
          message: response.message,
          error: null,
        });
        refresh();
      } catch (error) {
        setMutationState({
          status: "error",
          provider,
          action: "sync",
          message: null,
          error: toErrorMessage(error, "Unable to sync provider."),
        });
      }
    },
    [refresh]
  );

  const disconnectProvider = useCallback(
    async (provider: IntegrationProvider) => {
      setMutationState({
        status: "pending",
        provider,
        action: "disconnect",
        message: null,
        error: null,
      });
      try {
        const response = await disconnectIntegrationProvider(provider);
        setMutationState({
          status: "success",
          provider,
          action: "disconnect",
          message: response.message,
          error: null,
        });
        refresh();
      } catch (error) {
        setMutationState({
          status: "error",
          provider,
          action: "disconnect",
          message: null,
          error: toErrorMessage(error, "Unable to disconnect provider."),
        });
      }
    },
    [refresh]
  );

  return {
    integrationsState,
    healthSummaryState,
    mutationState,
    refresh,
    connectProvider,
    syncProvider,
    disconnectProvider,
    clearMutationError,
  };
}
