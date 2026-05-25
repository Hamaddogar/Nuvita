"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchDailySummary } from "./fetch-daily-summary";
import type { DailySummaryState } from "./types";

type UseDailySummaryParams = {
  date: string;
  timezone: string;
};
const LOAD_MAX_RETRIES = 2;
const LOAD_RETRY_DELAY_MS = 1_200;

const initialState: DailySummaryState = {
  status: "loading",
  data: null,
  error: null,
};

export function useDailySummary({ date, timezone }: UseDailySummaryParams) {
  const [state, setState] = useState<DailySummaryState>(initialState);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
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
        const data = await fetchDailySummary({ date, timezone });
        if (cancelled) {
          return;
        }

        setState(
          data.meals.length === 0
            ? {
                status: "empty",
                data,
                error: null,
              }
            : {
                status: "success",
                data,
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
        const errorMessage = error instanceof Error ? error.message : "Unexpected dashboard error. Please retry.";
        setState((previous) => {
          if (previous.status === "success" || previous.status === "empty") {
            return previous;
          }
          return {
            status: "error",
            data: null,
            error: errorMessage,
          };
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
  }, [date, timezone, refreshTick]);

  return {
    state,
    refresh,
  };
}
