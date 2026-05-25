import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const useDailySummaryMock = vi.fn();
const useHydrationSummaryMock = vi.fn();
const useWaterTrackingMock = vi.fn();
const useWeightTrackingMock = vi.fn();
const useHealthSummaryMock = vi.fn();

vi.mock("../use-daily-summary", () => ({
  useDailySummary: (...args: unknown[]) => useDailySummaryMock(...args),
}));
vi.mock("../use-hydration-summary", () => ({
  useHydrationSummary: (...args: unknown[]) => useHydrationSummaryMock(...args),
}));
vi.mock("../use-water-tracking", () => ({
  useWaterTracking: (...args: unknown[]) => useWaterTrackingMock(...args),
}));
vi.mock("../use-weight-tracking", () => ({
  useWeightTracking: (...args: unknown[]) => useWeightTrackingMock(...args),
}));
vi.mock("../use-health-summary", () => ({
  useHealthSummary: (...args: unknown[]) => useHealthSummaryMock(...args),
}));

vi.mock("./today-coaching-preview", () => ({
  TodayCoachingPreview: () => <div>Coaching Preview</div>,
}));
vi.mock("./hydration-card", () => ({
  HydrationCard: () => <div>Hydration Card</div>,
}));
vi.mock("./hydration-trend-card", () => ({
  HydrationTrendCard: () => <div>Hydration Trend</div>,
}));
vi.mock("./weight-tracking-card", () => ({
  WeightTrackingCard: () => <div>Weight Tracking Card</div>,
}));
vi.mock("./weight-trend-card", () => ({
  WeightTrendCard: () => <div>Weight Trend</div>,
}));
vi.mock("./health-sync-card", () => ({
  HealthSyncCard: () => <div>Health Sync Card</div>,
}));

import { DashboardPageClient } from "./dashboard-page-client";

describe("DashboardPageClient", () => {
  it("renders meal cards when daily summary data is available", () => {
    useDailySummaryMock.mockReturnValue({
      state: {
        status: "success",
        data: {
          success: true,
          date: "2026-05-18",
          goals: { calories: 2200, protein_g: 160, carbs_g: 220, fat_g: 70 },
          consumed: { calories: 1450, protein_g: 92, carbs_g: 150, fat_g: 42 },
          remaining: { calories: 750, protein_g: 68, carbs_g: 70, fat_g: 28 },
          progress: {
            calories_percent: 66,
            protein_percent: 58,
            carbs_percent: 68,
            fat_percent: 60,
          },
          meals: [
            {
              id: "meal-1",
              meal_name: "Chicken bowl",
              meal_type: "lunch",
              eaten_at: "2026-05-18T12:30:00Z",
              total_calories: 640,
              total_protein_g: 42,
              total_carbs_g: 70,
              total_fat_g: 18,
              item_count: 3,
            },
          ],
        },
        error: null,
      },
      refresh: vi.fn(),
    });
    useHydrationSummaryMock.mockReturnValue({
      state: {
        status: "success",
        data: {
          success: true,
          date: "2026-05-18",
          today_total_ml: 1200,
          goal_ml: 2500,
          remaining_ml: 1300,
          progress_percent: 48,
          logs: [],
        },
        error: null,
      },
      mutationState: {
        status: "idle",
        error: null,
      },
      refresh: vi.fn(),
      addWater: vi.fn(),
      editWaterLog: vi.fn(),
      removeWaterLog: vi.fn(),
      saveHydrationGoal: vi.fn(),
      clearMutationError: vi.fn(),
    });
    useWaterTrackingMock.mockReturnValue({
      state: {
        status: "empty",
        data: {
          success: true,
          entries: [],
          logs: [],
        },
        error: null,
      },
      refresh: vi.fn(),
    });
    useWeightTrackingMock.mockReturnValue({
      state: {
        status: "empty",
        data: {
          summary: {
            success: true,
            current_weight: null,
            target_weight: null,
            unit: "kg",
            change_from_start: null,
            remaining_to_goal: null,
            recent_change: null,
            progress_percent: null,
            trend: [],
          },
          history: {
            success: true,
            logs: [],
            trend: [],
          },
        },
        error: null,
      },
      mutationState: {
        status: "idle",
        error: null,
      },
      refresh: vi.fn(),
      addWeightLog: vi.fn(),
      saveWeightGoal: vi.fn(),
      clearMutationError: vi.fn(),
    });
    useHealthSummaryMock.mockReturnValue({
      state: {
        status: "success",
        data: {
          success: true,
          date: "2026-05-18",
          timezone: "UTC",
          steps_today: 7600,
          active_calories_today: 510,
          distance_meters_today: 5200,
          exercise_minutes_today: 38,
          workouts_this_week: 3,
          latest_weight: null,
          sleep_duration_minutes: 405,
          resting_heart_rate_bpm: 60,
          integration_status: [],
        },
        error: null,
      },
      refresh: vi.fn(),
    });

    render(<DashboardPageClient fullName="Nuvita User" />);

    expect(screen.getByText(/Hi, Nuvita/i)).toBeInTheDocument();
    expect(screen.getByText(/Today's meals/i)).toBeInTheDocument();
    expect(screen.getByText("Chicken bowl")).toBeInTheDocument();
    expect(screen.getByText("Hydration Card")).toBeInTheDocument();
    expect(screen.getByText("Hydration Trend")).toBeInTheDocument();
    expect(screen.getByText("Weight Tracking Card")).toBeInTheDocument();
    expect(screen.getByText("Weight Trend")).toBeInTheDocument();
    expect(screen.getByText("Health Sync Card")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scan Meal/i })).toBeInTheDocument();
  });
});
