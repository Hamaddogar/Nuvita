import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const useDailySummaryMock = vi.fn();

vi.mock("../use-daily-summary", () => ({
  useDailySummary: (...args: unknown[]) => useDailySummaryMock(...args),
}));

vi.mock("./today-coaching-preview", () => ({
  TodayCoachingPreview: () => <div>Coaching Preview</div>,
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

    render(<DashboardPageClient fullName="Nuvita User" />);

    expect(screen.getByText(/Hi, Nuvita/i)).toBeInTheDocument();
    expect(screen.getByText(/Today's meals/i)).toBeInTheDocument();
    expect(screen.getByText("Chicken bowl")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scan Meal/i })).toBeInTheDocument();
  });
});
