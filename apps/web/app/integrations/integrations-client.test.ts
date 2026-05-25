import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHealthSummary, fetchIntegrationsList } from "./integrations-client";

describe("integrations-client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses integrations payload and filters invalid providers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          integrations: [
            {
              provider: "fitbit",
              display_name: "Fitbit",
              status: "connected",
              supports_web_oauth: true,
              requires_native_app: false,
              data_types: ["activity", "sleep"],
              permissions: ["activity", "heartrate"],
              connected_at: "2026-05-21T07:00:00Z",
              last_synced_at: "2026-05-22T07:00:00Z",
              last_error: null,
              message: "Connected",
            },
            {
              provider: "unknown_provider",
              display_name: "Unknown",
              status: "connected",
              supports_web_oauth: true,
              requires_native_app: false,
              data_types: [],
              permissions: [],
            },
          ],
        }),
        { status: 200 }
      )
    );

    const payload = await fetchIntegrationsList();
    expect(payload.integrations).toHaveLength(1);
    expect(payload.integrations[0]?.provider).toBe("fitbit");
    expect(payload.integrations[0]?.status).toBe("connected");
  });

  it("parses health summary payload and keeps normalized metrics", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          date: "2026-05-22",
          timezone: "UTC",
          steps_today: 8450,
          active_calories_today: 620,
          distance_meters_today: 5800,
          exercise_minutes_today: 48,
          workouts_this_week: 4,
          latest_weight: {
            provider: "fitbit",
            weight: 73.4,
            unit: "kg",
            body_fat_percentage: 20.1,
            recorded_at: "2026-05-22T06:40:00Z",
          },
          sleep_duration_minutes: 430,
          resting_heart_rate_bpm: 58,
          integration_status: [
            { provider: "fitbit", status: "sync_success", last_synced_at: "2026-05-22T07:00:00Z" },
            { provider: "unsupported", status: "connected", last_synced_at: null },
          ],
        }),
        { status: 200 }
      )
    );

    const payload = await fetchHealthSummary({ timezone: "UTC" });
    expect(payload.steps_today).toBe(8450);
    expect(payload.latest_weight?.unit).toBe("kg");
    expect(payload.integration_status).toHaveLength(1);
    expect(payload.integration_status[0]?.provider).toBe("fitbit");
  });

  it("maps auth failures into session-expired errors", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: "Authentication required. Please sign in again.",
        }),
        { status: 401 }
      )
    );

    await expect(fetchIntegrationsList()).rejects.toThrow("Your session expired. Please log in again.");
  });
});
