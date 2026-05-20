"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWaterHistory } from "./wellness-client";
import type { AsyncResourceState, WaterHistoryResponse } from "./wellness-types";

const initialState: AsyncResourceState<WaterHistoryResponse> = {
  status: "loading",
  data: null,
  error: null,
};
const LOAD_MAX_RETRIES = 4;
const LOAD_RETRY_DELAY_MS = 1_500;

type UseWaterTrackingParams = {
  timezone: string;
  days?: number;
};

export function useWaterTracking({ timezone, days = 14 }: UseWaterTrackingParams) {
  const [state, setState] = useState<AsyncResourceState<WaterHistoryResponse>>(initialState);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    setState((previous) => {
      if (previous.status === "success" || previous.status === "empty") {
        return previous;
      }
      return initialState;
    });
    const load = async (attempt: number) => {
      try {
        const payload = await fetchWaterHistory({ timezone, days });
        if (cancelled) {
          return;
        }
        setState(
          payload.logs.length === 0
            ? {
                status: "empty",
                data: payload,
                error: null,
              }
            : {
                status: "success",
                data: payload,
                error: null,
              }
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (attempt < LOAD_MAX_RETRIES) {
          retryTimer = window.setTimeout(() => {
            if (!cancelled) {
              void load(attempt + 1);
            }
          }, LOAD_RETRY_DELAY_MS * (attempt + 1));
          return;
        }
        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Unable to load hydration history.",
        });
      }
    };
    void load(0);

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [days, refreshTick, timezone]);

  return {
    state,
    refresh,
  };
}
