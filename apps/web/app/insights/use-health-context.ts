"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchHealthSummary } from "@/app/integrations/integrations-client";
import type { AsyncResourceState, HealthDataSummaryResponse } from "@/app/integrations/types";

type UseHealthContextParams = {
  date: string;
  timezone: string;
};

const loadingState: AsyncResourceState<HealthDataSummaryResponse> = {
  status: "loading",
  data: null,
  error: null,
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to load wearable context.";
}

export function useHealthContext({ date, timezone }: UseHealthContextParams) {
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
        const summary = await fetchHealthSummary({ date, timezone });
        if (cancelled) {
          return;
        }
        setState({
          status: "success",
          data: summary,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState({
          status: "error",
          data: null,
          error: toErrorMessage(error),
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
