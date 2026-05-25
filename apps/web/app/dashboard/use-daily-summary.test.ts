import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchDailySummaryMock = vi.fn();

vi.mock("./fetch-daily-summary", () => ({
  fetchDailySummary: (...args: unknown[]) => fetchDailySummaryMock(...args),
}));

import { useDailySummary } from "./use-daily-summary";

function buildDailySummary(mealsCount: number) {
  return {
    success: true as const,
    date: "2026-05-25",
    goals: { calories: 2200, protein_g: 160, carbs_g: 220, fat_g: 70 },
    consumed: { calories: 1400, protein_g: 95, carbs_g: 150, fat_g: 45 },
    remaining: { calories: 800, protein_g: 65, carbs_g: 70, fat_g: 25 },
    progress: { calories_percent: 64, protein_percent: 59, carbs_percent: 68, fat_percent: 64 },
    meals:
      mealsCount > 0
        ? [
            {
              id: "meal-1",
              meal_name: "Chicken Bowl",
              meal_type: "lunch",
              eaten_at: "2026-05-25T12:00:00Z",
              total_calories: 700,
              total_protein_g: 45,
              total_carbs_g: 70,
              total_fat_g: 20,
              item_count: 3,
            },
          ]
        : [],
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useDailySummary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("retries transient failure and resolves without flashing error state", async () => {
    fetchDailySummaryMock.mockRejectedValueOnce(new Error("Temporary dashboard failure"));
    fetchDailySummaryMock.mockResolvedValueOnce(buildDailySummary(1));

    const { result } = renderHook(() => useDailySummary({ date: "2026-05-25", timezone: "UTC" }));

    await flushMicrotasks();
    expect(fetchDailySummaryMock).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe("loading");

    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });
    await flushMicrotasks();

    expect(fetchDailySummaryMock).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe("success");
  });

  it("shows error only after retry attempts are exhausted", async () => {
    fetchDailySummaryMock.mockRejectedValue(new Error("Persistent dashboard failure"));

    const { result } = renderHook(() => useDailySummary({ date: "2026-05-25", timezone: "UTC" }));

    await flushMicrotasks();
    expect(fetchDailySummaryMock).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe("loading");

    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });
    await flushMicrotasks();
    expect(fetchDailySummaryMock).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe("loading");

    await act(async () => {
      vi.advanceTimersByTime(2_400);
    });
    await flushMicrotasks();
    expect(fetchDailySummaryMock).toHaveBeenCalledTimes(3);
    expect(result.current.state.status).toBe("error");
    expect(result.current.state.error).toContain("Persistent dashboard failure");
  });
});
