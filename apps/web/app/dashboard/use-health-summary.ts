"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchHealthSummary } from "@/app/integrations/integrations-client";
import type { AsyncResourceState, HealthDataSummaryResponse } from "@/app/integrations/types";

type UseHealthSummaryParams = {
  date: string;
  timezone: string;
};

const loadingState: AsyncResourceState<HealthDataSummaryResponse> = {
  status: "loading",
  data: null,
  error: null,
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function useHealthSummary({ date, timezone }: UseHealthSummaryParams) {
  const [state, setState] = useState<AsyncResourceState<HealthDataSummaryResponse>>(loadingState);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => (previous.status === "success" ? previous : loadingState));

    void (async () => {
      try {
        const payload = await fetchHealthSummary({ date, timezone });
        if (cancelled) {
          return;
        }
        setState({
          status: "success",
          data: payload,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState({
          status: "error",
          data: null,
          error: toErrorMessage(error, "Unable to load synced health metrics."),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, timezone, refreshTick]);

  return {
    state,
    refresh,
  };
}
