"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createWeightLog,
  fetchWeightHistory,
  fetchWeightSummary,
  updateWeightGoal,
} from "./wellness-client";
import type {
  AsyncResourceState,
  MutationState,
  WeightTrackingSnapshot,
  WeightUnit,
} from "./wellness-types";

type UseWeightTrackingParams = {
  timezone: string;
  unit: WeightUnit;
  days?: number;
};

const initialState: AsyncResourceState<WeightTrackingSnapshot> = {
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

export function useWeightTracking({ timezone, unit, days = 90 }: UseWeightTrackingParams) {
  const [state, setState] = useState<AsyncResourceState<WeightTrackingSnapshot>>(initialState);
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
        const [summary, history] = await Promise.all([
          fetchWeightSummary({ timezone, unit }),
          fetchWeightHistory({ timezone, unit, days }),
        ]);
        if (cancelled) {
          return;
        }
        const data = { summary, history };
        setState(
          history.logs.length === 0
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
        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Unable to load weight tracking.",
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
  }, [days, refreshTick, timezone, unit]);

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
          error: error instanceof Error ? error.message : "Weight update failed.",
        });
        return false;
      }
    },
    [refresh]
  );

  const addWeightLog = useCallback(
    async (params: {
      weight: number;
      unit?: WeightUnit;
      notes?: string;
      logged_at?: string;
    }) =>
      runMutation(async () => {
        await createWeightLog({
          weight: params.weight,
          unit: params.unit ?? unit,
          notes: params.notes,
          logged_at: params.logged_at,
        });
      }),
    [runMutation, unit]
  );

  const saveWeightGoal = useCallback(
    async (params: { target_weight: number; unit?: WeightUnit }) =>
      runMutation(async () => {
        await updateWeightGoal({
          target_weight: params.target_weight,
          unit: params.unit ?? unit,
        });
      }),
    [runMutation, unit]
  );

  const clearMutationError = useCallback(() => {
    setMutationState(initialMutationState);
  }, []);

  return {
    state,
    mutationState,
    refresh,
    addWeightLog,
    saveWeightGoal,
    clearMutationError,
  };
}
