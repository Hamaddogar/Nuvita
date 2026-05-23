"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchAnalyticsAchievements,
  fetchAnalyticsMonthly,
  fetchAnalyticsStreaks,
  fetchAnalyticsSummary,
  fetchAnalyticsWeekly,
} from "./analytics-client";
import type {
  AnalyticsAchievementsResponse,
  AnalyticsMonthlyResponse,
  AnalyticsStreaksResponse,
  AnalyticsSummaryResponse,
  AnalyticsWeeklyResponse,
  AsyncSectionState,
  WeightUnit,
} from "./types";

type UseAnalyticsDashboardParams = {
  date: string;
  timezone: string;
  unit: WeightUnit;
};

const LOAD_MAX_RETRIES = 3;
const LOAD_RETRY_DELAY_MS = 1_500;

const loadingWeeklyState: AsyncSectionState<AnalyticsWeeklyResponse> = {
  status: "loading",
  data: null,
  error: null,
};
const loadingMonthlyState: AsyncSectionState<AnalyticsMonthlyResponse> = {
  status: "loading",
  data: null,
  error: null,
};
const loadingStreaksState: AsyncSectionState<AnalyticsStreaksResponse> = {
  status: "loading",
  data: null,
  error: null,
};
const loadingAchievementsState: AsyncSectionState<AnalyticsAchievementsResponse> = {
  status: "loading",
  data: null,
  error: null,
};
const loadingSummaryState: AsyncSectionState<AnalyticsSummaryResponse> = {
  status: "loading",
  data: null,
  error: null,
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function useAnalyticsDashboard({ date, timezone, unit }: UseAnalyticsDashboardParams) {
  const [weeklyState, setWeeklyState] = useState<AsyncSectionState<AnalyticsWeeklyResponse>>(loadingWeeklyState);
  const [monthlyState, setMonthlyState] = useState<AsyncSectionState<AnalyticsMonthlyResponse>>(loadingMonthlyState);
  const [streaksState, setStreaksState] = useState<AsyncSectionState<AnalyticsStreaksResponse>>(loadingStreaksState);
  const [achievementsState, setAchievementsState] =
    useState<AsyncSectionState<AnalyticsAchievementsResponse>>(loadingAchievementsState);
  const [summaryState, setSummaryState] = useState<AsyncSectionState<AnalyticsSummaryResponse>>(loadingSummaryState);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;

    setWeeklyState(loadingWeeklyState);
    setMonthlyState(loadingMonthlyState);
    setStreaksState(loadingStreaksState);
    setAchievementsState(loadingAchievementsState);
    setSummaryState(loadingSummaryState);

    const load = async (attempt: number) => {
      const [weeklyResult, monthlyResult, streaksResult, achievementsResult, summaryResult] =
        await Promise.allSettled([
          fetchAnalyticsWeekly({ date, timezone, unit }),
          fetchAnalyticsMonthly({ date, timezone, unit }),
          fetchAnalyticsStreaks({ date, timezone }),
          fetchAnalyticsAchievements({ date, timezone, unit }),
          fetchAnalyticsSummary({ date, timezone, unit }),
        ]);

      if (cancelled) {
        return;
      }

      const failedCount = [weeklyResult, monthlyResult, streaksResult, achievementsResult, summaryResult].filter(
        (result) => result.status === "rejected"
      ).length;
      if (failedCount === 5 && attempt < LOAD_MAX_RETRIES) {
        retryTimer = window.setTimeout(() => {
          if (!cancelled) {
            void load(attempt + 1);
          }
        }, LOAD_RETRY_DELAY_MS * (attempt + 1));
        return;
      }

      if (weeklyResult.status === "fulfilled") {
        setWeeklyState({ status: "success", data: weeklyResult.value, error: null });
      } else {
        setWeeklyState({
          status: "error",
          data: null,
          error: toErrorMessage(weeklyResult.reason, "Unable to load weekly analytics."),
        });
      }

      if (monthlyResult.status === "fulfilled") {
        setMonthlyState({ status: "success", data: monthlyResult.value, error: null });
      } else {
        setMonthlyState({
          status: "error",
          data: null,
          error: toErrorMessage(monthlyResult.reason, "Unable to load monthly analytics."),
        });
      }

      if (streaksResult.status === "fulfilled") {
        setStreaksState({ status: "success", data: streaksResult.value, error: null });
      } else {
        setStreaksState({
          status: "error",
          data: null,
          error: toErrorMessage(streaksResult.reason, "Unable to load streak analytics."),
        });
      }

      if (achievementsResult.status === "fulfilled") {
        setAchievementsState({ status: "success", data: achievementsResult.value, error: null });
      } else {
        setAchievementsState({
          status: "error",
          data: null,
          error: toErrorMessage(achievementsResult.reason, "Unable to load achievement analytics."),
        });
      }

      if (summaryResult.status === "fulfilled") {
        setSummaryState({ status: "success", data: summaryResult.value, error: null });
      } else {
        setSummaryState({
          status: "error",
          data: null,
          error: toErrorMessage(summaryResult.reason, "Unable to load analytics smart summary."),
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
  }, [date, timezone, unit, refreshTick]);

  return {
    weeklyState,
    monthlyState,
    streaksState,
    achievementsState,
    summaryState,
    refresh,
  };
}
