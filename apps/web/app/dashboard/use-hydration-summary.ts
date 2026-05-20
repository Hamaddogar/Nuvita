"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createWaterLog,
  deleteWaterLog,
  fetchWaterToday,
  updateWaterGoal,
  updateWaterLog,
} from "./wellness-client";
import type { AsyncResourceState, MutationState, WaterTodayResponse } from "./wellness-types";

const initialState: AsyncResourceState<WaterTodayResponse> = {
  status: "loading",
  data: null,
  error: null,
};

const initialMutationState: MutationState = {
  status: "idle",
  error: null,
};
const LOAD_MAX_RETRIES = 4;
const LOAD_RETRY_DELAY_MS = 1_500;

type UseHydrationSummaryParams = {
  timezone: string;
  date?: string;
};

export function useHydrationSummary({ timezone, date }: UseHydrationSummaryParams) {
  const [state, setState] = useState<AsyncResourceState<WaterTodayResponse>>(initialState);
  const [mutationState, setMutationState] = useState<MutationState>(initialMutationState);
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
        const payload = await fetchWaterToday({ timezone, date });
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
          error: error instanceof Error ? error.message : "Unable to load hydration summary.",
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

  const runMutation = useCallback(
    async (task: () => Promise<void>) => {
      setMutationState({ status: "pending", error: null });
      try {
        await task();
        setMutationState(initialMutationState);
        refresh();
        return true;
      } catch (error) {
        setMutationState({
          status: "error",
          error: error instanceof Error ? error.message : "Hydration update failed.",
        });
        return false;
      }
    },
    [refresh]
  );

  const addWater = useCallback(
    async (amountMl: number) =>
      runMutation(async () => {
        await createWaterLog({ amount_ml: amountMl });
      }),
    [runMutation]
  );

  const editWaterLog = useCallback(
    async (logId: string, amountMl: number) =>
      runMutation(async () => {
        await updateWaterLog({
          logId,
          amount_ml: amountMl,
        });
      }),
    [runMutation]
  );

  const removeWaterLog = useCallback(
    async (logId: string) =>
      runMutation(async () => {
        await deleteWaterLog(logId);
      }),
    [runMutation]
  );

  const saveHydrationGoal = useCallback(
    async (targetMl: number) =>
      runMutation(async () => {
        await updateWaterGoal(targetMl);
      }),
    [runMutation]
  );

  const clearMutationError = useCallback(() => {
    setMutationState(initialMutationState);
  }, []);

  return {
    state,
    mutationState,
    refresh,
    addWater,
    editWaterLog,
    removeWaterLog,
    saveHydrationGoal,
    clearMutationError,
  };
}
