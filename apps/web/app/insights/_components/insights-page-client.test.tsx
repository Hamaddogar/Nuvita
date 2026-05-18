import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const useAIInsightsTodayMock = vi.fn();
const useAIInsightsWeeklyMock = vi.fn();

vi.mock("../use-ai-insights", () => ({
  useAIInsightsToday: (...args: unknown[]) => useAIInsightsTodayMock(...args),
  useAIInsightsWeekly: (...args: unknown[]) => useAIInsightsWeeklyMock(...args),
}));

import { InsightsPageClient } from "./insights-page-client";

describe("InsightsPageClient", () => {
  it("shows a refreshing header state while both insight requests are loading", () => {
    useAIInsightsTodayMock.mockReturnValue({
      state: { status: "loading", data: null, error: null },
      refresh: vi.fn(),
    });
    useAIInsightsWeeklyMock.mockReturnValue({
      state: { status: "loading", data: null, error: null },
      refresh: vi.fn(),
    });

    render(<InsightsPageClient fullName="Nuvita User" />);

    expect(screen.getByRole("button", { name: /Refreshing/i })).toBeInTheDocument();
    expect(screen.getByText(/AI insights & coaching/i)).toBeInTheDocument();
  });

  it("renders a combined error state when both today and weekly requests fail", () => {
    useAIInsightsTodayMock.mockReturnValue({
      state: { status: "error", data: null, error: "Today insights failed." },
      refresh: vi.fn(),
    });
    useAIInsightsWeeklyMock.mockReturnValue({
      state: { status: "error", data: null, error: "Weekly insights failed." },
      refresh: vi.fn(),
    });

    render(<InsightsPageClient fullName="Nuvita User" />);

    expect(screen.getByText(/Unable to load AI insights/i)).toBeInTheDocument();
    expect(screen.getByText(/Today insights failed/i)).toBeInTheDocument();
    expect(screen.getByText(/Weekly insights failed/i)).toBeInTheDocument();
  });
});
