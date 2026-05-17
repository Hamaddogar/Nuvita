"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMealDetail } from "./fetch-meal-detail";
import type { MealDetailState } from "./types";

type UseMealDetailParams = {
  mealId: string | null;
};

const idleState: MealDetailState = {
  status: "idle",
  data: null,
  error: null,
};

const loadingState: MealDetailState = {
  status: "loading",
  data: null,
  error: null,
};

export function useMealDetail({ mealId }: UseMealDetailParams) {
  const [state, setState] = useState<MealDetailState>(idleState);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    if (!mealId) {
      return;
    }
    setRefreshTick((prev) => prev + 1);
  }, [mealId]);

  useEffect(() => {
    if (!mealId) {
      setState(idleState);
      return;
    }

    let cancelled = false;
    setState(loadingState);

    void (async () => {
      try {
        const data = await fetchMealDetail({ mealId });
        if (cancelled) {
          return;
        }
        setState({
          status: "success",
          data,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Unexpected meal detail error. Please retry.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mealId, refreshTick]);

  return {
    state,
    refresh,
  };
}
