import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAnalyticsMonthly, fetchAnalyticsSummary, fetchAnalyticsWeekly } from "./analytics-client";

describe("analytics-client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses weekly analytics and filters invalid daily metrics", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
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
              carbs_percent: 90,
              fat_percent: 84,
              hydration_percent: 80,
              overall_percent: 87,
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
            {
              date: "2026-05-18",
              calories: 1800,
              protein_g: 120,
            },
          ],
        }),
        { status: 200 }
      )
    );

    const result = await fetchAnalyticsWeekly({
      date: "2026-05-19",
      timezone: "UTC",
      unit: "kg",
    });

    expect(result.summary.goal_adherence.overall_percent).toBe(87);
    expect(result.daily_metrics).toHaveLength(1);
    expect(result.daily_metrics[0]?.meal_count).toBe(4);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/analytics/weekly?date=2026-05-19&timezone=UTC&unit=kg"),
      expect.any(Object)
    );
  });

  it("maps auth failures into a session-expired error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Authentication required. Please sign in again." }), {
        status: 401,
      })
    );

    await expect(
      fetchAnalyticsSummary({
        date: "2026-05-19",
        timezone: "UTC",
        unit: "kg",
      })
    ).rejects.toThrow("Your session expired. Please log in again.");
  });

  it("throws a parsing error on malformed monthly payloads", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          timezone: "UTC",
        }),
        { status: 200 }
      )
    );

    await expect(
      fetchAnalyticsMonthly({
        date: "2026-05-19",
        timezone: "UTC",
        unit: "kg",
      })
    ).rejects.toThrow("Unexpected monthly analytics response.");
  });
});
