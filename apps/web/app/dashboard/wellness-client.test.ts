import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWaterToday, fetchWeightSummary } from "./wellness-client";

describe("wellness-client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses hydration summary payloads", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          date: "2026-05-19",
          today_total_ml: 1450,
          goal_ml: 2500,
          remaining_ml: 1050,
          progress_percent: 58,
          logs: [
            {
              id: "log-1",
              amount_ml: 500,
              logged_at: "2026-05-19T08:00:00Z",
              created_at: "2026-05-19T08:00:01Z",
            },
            {
              id: "",
              amount_ml: 300,
              logged_at: "2026-05-19T09:00:00Z",
              created_at: "2026-05-19T09:00:01Z",
            },
          ],
        }),
        { status: 200 }
      )
    );

    const payload = await fetchWaterToday({ timezone: "UTC" });
    expect(payload.goal_ml).toBe(2500);
    expect(payload.today_total_ml).toBe(1450);
    expect(payload.logs).toHaveLength(1);
    expect(payload.logs[0]?.id).toBe("log-1");
  });

  it("maps auth failures into user-facing errors", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: "Authentication required. Please sign in again.",
        }),
        { status: 401 }
      )
    );

    await expect(fetchWeightSummary({ timezone: "UTC", unit: "kg" })).rejects.toThrow(
      "Your session expired. Please log in again."
    );
  });
});
