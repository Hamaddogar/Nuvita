import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const useMealHistoryMock = vi.fn();
const useMealDetailMock = vi.fn();

vi.mock("../use-meal-history", () => ({
  useMealHistory: (...args: unknown[]) => useMealHistoryMock(...args),
}));

vi.mock("../use-meal-detail", () => ({
  useMealDetail: (...args: unknown[]) => useMealDetailMock(...args),
}));

import { HistoryPageClient } from "./history-page-client";

describe("HistoryPageClient", () => {
  it("shows the empty state when there are no meals for the selected day", () => {
    useMealHistoryMock.mockReturnValue({
      state: {
        status: "empty",
        data: {
          success: true,
          date: "2026-05-18",
          summary: {
            total_calories: 0,
            total_protein_g: 0,
            total_carbs_g: 0,
            total_fat_g: 0,
            meal_count: 0,
          },
          goals: { calories: 2200, protein_g: 160, carbs_g: 220, fat_g: 70 },
          remaining: { calories: 2200, protein_g: 160, carbs_g: 220, fat_g: 70 },
          progress: {
            calories_percent: 0,
            protein_percent: 0,
            carbs_percent: 0,
            fat_percent: 0,
          },
          meals: [],
        },
        error: null,
      },
      refresh: vi.fn(),
    });

    useMealDetailMock.mockReturnValue({
      state: { status: "idle", data: null, error: null },
      refresh: vi.fn(),
    });

    render(<HistoryPageClient fullName="Nuvita User" />);

    expect(screen.getByText(/No meals logged for/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scan a Meal/i })).toBeInTheDocument();
  });
});
