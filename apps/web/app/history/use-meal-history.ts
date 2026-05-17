"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMealHistory } from "./fetch-meal-history";
import type { MealHistoryState } from "./types";

type UseMealHistoryParams = {
  date: string;
  timezone: string;
};

const loadingState: MealHistoryState = {
  status: "loading",
  data: null,
  error: null,
};

export function useMealHistory({ date, timezone }: UseMealHistoryParams) {
  const [state, setState] = useState<MealHistoryState>(loadingState);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState(loadingState);

    void (async () => {
      try {
        const data = await fetchMealHistory({ date, timezone });
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
        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Unexpected meal history error. Please retry.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, timezone, refreshTick]);

  useEffect(() => {
    const handleFocus = () => {
      refresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return {
    state,
    refresh,
  };
}
