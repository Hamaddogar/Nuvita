import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const useAnalyticsDashboardMock = vi.fn();

vi.mock("../use-analytics", () => ({
  useAnalyticsDashboard: (...args: unknown[]) => useAnalyticsDashboardMock(...args),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children?: unknown }) => <div>{children}</div>,
  LineChart: ({ children }: { children?: unknown }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children?: unknown }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Line: () => null,
  Bar: () => null,
}));

vi.mock("@/components/mobile-bottom-nav", () => ({
  MobileBottomNav: () => <div data-testid="mobile-bottom-nav" />,
}));

vi.mock("@/components/nuvita-logo", () => ({
  NuvitaLogo: () => <div>Nuvita Logo</div>,
}));

import { AnalyticsPageClient } from "./analytics-page-client";

describe("AnalyticsPageClient", () => {
  const loadingState = { status: "loading", data: null, error: null } as const;
  const refreshMock = vi.fn();

  it("shows refreshing UI while all analytics sections are loading", () => {
    useAnalyticsDashboardMock.mockReturnValue({
      weeklyState: loadingState,
      monthlyState: loadingState,
      streaksState: loadingState,
      achievementsState: loadingState,
      summaryState: loadingState,
      refresh: refreshMock,
    });

    render(<AnalyticsPageClient fullName="Nuvita User" />);

    expect(screen.getByRole("button", { name: /Refreshing/i })).toBeInTheDocument();
    expect(screen.getByText(/Advanced analytics/i)).toBeInTheDocument();
  });

  it("renders a combined error card when all analytics endpoints fail", () => {
    useAnalyticsDashboardMock.mockReturnValue({
      weeklyState: { status: "error", data: null, error: "Weekly failed." },
      monthlyState: { status: "error", data: null, error: "Monthly failed." },
      streaksState: { status: "error", data: null, error: "Streaks failed." },
      achievementsState: { status: "error", data: null, error: "Achievements failed." },
      summaryState: { status: "error", data: null, error: "Summary failed." },
      refresh: refreshMock,
    });

    render(<AnalyticsPageClient fullName="Nuvita User" />);

    expect(screen.getByText(/Unable to load analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/Weekly failed/i)).toBeInTheDocument();
    expect(screen.getByText(/Summary failed/i)).toBeInTheDocument();
  });

  it("renders analytics sections and fallback messaging for smart summary", () => {
    useAnalyticsDashboardMock.mockReturnValue({
      weeklyState: {
        status: "success",
        data: {
          success: true,
          timezone: "UTC",
          summary: {
            week_start: "2026-05-13",
            week_end: "2026-05-19",
            days_tracked: 7,
            calorie_trend: "up",
            weight_trend: "stable",
            protein_consistency_score: 88,
            hydration_consistency_score: 76,
            goal_adherence: {
              calories_percent: 91,
              protein_percent: 87,
              carbs_percent: 86,
              fat_percent: 84,
              hydration_percent: 82,
              overall_percent: 86,
            },
            weekly_macro_averages: [
              { macro: "calories", average: 2100, goal: 2200, adherence_percent: 95 },
              { macro: "protein_g", average: 148, goal: 160, adherence_percent: 92 },
            ],
            weight_change: -0.4,
            weight_goal_progress_percent: 42,
          },
          daily_metrics: [
            {
              date: "2026-05-19",
              calories: 2140,
              protein_g: 152,
              carbs_g: 220,
              fat_g: 72,
              hydration_ml: 2300,
              hydration_goal_ml: 2500,
              calorie_adherence_percent: 97,
              protein_adherence_percent: 95,
              carbs_adherence_percent: 100,
              fat_adherence_percent: 95,
              hydration_adherence_percent: 92,
              weight: 72.3,
              weight_unit: "kg",
              meal_count: 4,
              tracked: true,
            },
          ],
        },
        error: null,
      },
      monthlyState: {
        status: "success",
        data: {
          success: true,
          timezone: "UTC",
          summary: {
            period_start: "2026-04-20",
            period_end: "2026-05-19",
            days_tracked: 27,
            average_goal_adherence_percent: 84,
            calories_trend: "up",
            protein_trend: "up",
            hydration_trend: "stable",
            weight_trend: "down",
          },
          daily_metrics: [
            {
              date: "2026-05-19",
              calories: 2140,
              protein_g: 152,
              carbs_g: 220,
              fat_g: 72,
              hydration_ml: 2300,
              hydration_goal_ml: 2500,
              calorie_adherence_percent: 97,
              protein_adherence_percent: 95,
              carbs_adherence_percent: 100,
              fat_adherence_percent: 95,
              hydration_adherence_percent: 92,
              weight: 72.3,
              weight_unit: "kg",
              meal_count: 4,
              tracked: true,
            },
          ],
          weekly_metrics: [
            {
              week_start: "2026-05-13",
              week_end: "2026-05-19",
              avg_calories: 2100,
              avg_protein_g: 148,
              avg_hydration_ml: 2200,
              goal_adherence_percent: 87,
              weight_change: -0.4,
            },
          ],
        },
        error: null,
      },
      streaksState: {
        status: "success",
        data: {
          success: true,
          as_of_date: "2026-05-19",
          streaks: [
            { key: "meal_logging", label: "Meal logging", current: 7, best: 11, unit: "days", is_active: true },
            { key: "hydration_goal", label: "Hydration goal", current: 4, best: 6, unit: "days", is_active: true },
          ],
        },
        error: null,
      },
      achievementsState: {
        status: "success",
        data: {
          success: true,
          generated_at: "2026-05-19T08:00:00Z",
          total_unlocked: 1,
          achievements: [
            {
              id: "streak-7",
              title: "7-Day Logging Streak",
              description: "Logged meals for 7 consecutive days.",
              category: "consistency",
              current_value: 7,
              target_value: 7,
              progress_percent: 100,
              unlocked: true,
              unlocked_at: "2026-05-19T07:59:00Z",
            },
          ],
        },
        error: null,
      },
      summaryState: {
        status: "success",
        data: {
          success: true,
          source: "fallback",
          timezone: "UTC",
          period_start: "2026-05-13",
          period_end: "2026-05-19",
          generated_at: "2026-05-19T08:00:00Z",
          key_metrics: {
            days_tracked: 7,
            average_goal_adherence_percent: 86,
            logging_streak_days: 7,
            hydration_streak_days: 4,
            protein_streak_days: 5,
            weight_goal_progress_percent: 42,
          },
          streak_highlights: [
            { key: "meal_logging", label: "Meal logging", current: 7, best: 11, unit: "days", is_active: true },
          ],
          summary: {
            headline: "Great consistency this week.",
            wins: ["Protein goals met on 5 days."],
            focus_areas: ["Increase hydration on weekends."],
            next_steps: ["Add one extra 500ml water reminder."],
            motivation: "Small consistent habits are compounding in your favor.",
            risk_flags: [],
            confidence_score: 74,
          },
          fallback_reason: "AI service timeout",
        },
        error: null,
      },
      refresh: refreshMock,
    });

    render(<AnalyticsPageClient fullName="Nuvita User" />);

    expect(screen.getByText(/Weekly adherence/i)).toBeInTheDocument();
    expect(screen.getByText(/Hydration & weight trend/i)).toBeInTheDocument();
    expect(screen.getByText(/Streak indicators/i)).toBeInTheDocument();
    expect(screen.getByText(/Achievements/i)).toBeInTheDocument();
    expect(screen.getByText(/Smart progress summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Using resilient fallback summary/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scan Meal/i })).toBeInTheDocument();
  });
});
