"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAIInsightsToday, fetchAIInsightsWeekly } from "./fetch-ai-insights";
import type { AIInsightsTodayState, AIInsightsWeeklyState } from "./types";

type UseInsightsParams = {
  date: string;
  timezone: string;
};

const loadingTodayState: AIInsightsTodayState = {
  status: "loading",
  data: null,
  error: null,
};

const loadingWeeklyState: AIInsightsWeeklyState = {
  status: "loading",
  data: null,
  error: null,
};

function deriveTodayStatus(source: "ai" | "fallback" | "mixed", insightCount: number) {
  if (insightCount === 0) {
    return "empty" as const;
  }
  if (source === "fallback") {
    return "fallback" as const;
  }
  if (source === "mixed") {
    return "partial" as const;
  }
  return "success" as const;
}

function deriveWeeklyStatus(source: "ai" | "fallback" | "mixed", insightCount: number) {
  if (insightCount === 0) {
    return "empty" as const;
  }
  if (source === "fallback") {
    return "fallback" as const;
  }
  if (source === "mixed") {
    return "partial" as const;
  }
  return "success" as const;
}

export function useAIInsightsToday({ date, timezone }: UseInsightsParams) {
  const [state, setState] = useState<AIInsightsTodayState>(loadingTodayState);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => {
      if (
        previous.status === "success" ||
        previous.status === "partial" ||
        previous.status === "fallback" ||
        previous.status === "empty"
      ) {
        return previous;
      }
      return loadingTodayState;
    });

    void (async () => {
      try {
        const data = await fetchAIInsightsToday({ date, timezone });
        if (cancelled) {
          return;
        }
        setState({
          status: deriveTodayStatus(data.source, data.insights.length),
          data,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unexpected AI insights error. Please retry.";
        setState((previous) => {
          if (
            previous.status === "success" ||
            previous.status === "partial" ||
            previous.status === "fallback" ||
            previous.status === "empty"
          ) {
            return previous;
          }
          return {
            status: "error",
            data: null,
            error: message,
          };
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

export function useAIInsightsWeekly({ date, timezone }: UseInsightsParams) {
  const [state, setState] = useState<AIInsightsWeeklyState>(loadingWeeklyState);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => {
      if (
        previous.status === "success" ||
        previous.status === "partial" ||
        previous.status === "fallback" ||
        previous.status === "empty"
      ) {
        return previous;
      }
      return loadingWeeklyState;
    });

    void (async () => {
      try {
        const data = await fetchAIInsightsWeekly({ date, timezone });
        if (cancelled) {
          return;
        }
        setState({
          status: deriveWeeklyStatus(data.source, data.insights.length),
          data,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unexpected weekly insights error. Please retry.";
        setState((previous) => {
          if (
            previous.status === "success" ||
            previous.status === "partial" ||
            previous.status === "fallback" ||
            previous.status === "empty"
          ) {
            return previous;
          }
          return {
            status: "error",
            data: null,
            error: message,
          };
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
