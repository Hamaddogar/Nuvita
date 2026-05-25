import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const useHealthIntegrationsMock = vi.fn();

vi.mock("../use-health-integrations", () => ({
  useHealthIntegrations: (...args: unknown[]) => useHealthIntegrationsMock(...args),
}));

import { IntegrationsPageClient } from "./integrations-page-client";

describe("IntegrationsPageClient", () => {
  it("renders callback banner and provider cards when integrations load", () => {
    useHealthIntegrationsMock.mockReturnValue({
      integrationsState: {
        status: "success",
        data: {
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
              connected_at: "2026-05-22T06:00:00Z",
              last_synced_at: "2026-05-22T08:00:00Z",
              last_error: null,
              message: "Connected and ready",
            },
          ],
        },
        error: null,
      },
      healthSummaryState: {
        status: "success",
        data: {
          success: true,
          date: "2026-05-22",
          timezone: "UTC",
          steps_today: 8200,
          active_calories_today: 580,
          distance_meters_today: 5400,
          exercise_minutes_today: 42,
          workouts_this_week: 3,
          latest_weight: null,
          sleep_duration_minutes: 410,
          resting_heart_rate_bpm: 59,
          integration_status: [{ provider: "fitbit", status: "sync_success", last_synced_at: "2026-05-22T08:00:00Z" }],
        },
        error: null,
      },
      mutationState: {
        status: "idle",
        provider: null,
        action: null,
        message: null,
        error: null,
      },
      refresh: vi.fn(),
      connectProvider: vi.fn(),
      syncProvider: vi.fn(),
      disconnectProvider: vi.fn(),
      clearMutationError: vi.fn(),
    });

    render(
      <IntegrationsPageClient
        fullName="Nuvita User"
        callbackProvider="fitbit"
        callbackStatus="sync_success"
        callbackMessage="Fitbit sync complete."
      />
    );

    expect(screen.getByText(/Wearable integrations/i)).toBeInTheDocument();
    expect(screen.getByText(/Fitbit Synced/i)).toBeInTheDocument();
    expect(screen.getByText(/Connected and ready/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Disconnect/i })).toBeInTheDocument();
    expect(screen.getByText(/Privacy and safety/i)).toBeInTheDocument();
  });

  it("renders retry UI when integrations request fails", () => {
    useHealthIntegrationsMock.mockReturnValue({
      integrationsState: {
        status: "error",
        data: null,
        error: "Unable to load integrations.",
      },
      healthSummaryState: {
        status: "error",
        data: null,
        error: "Unable to load health summary.",
      },
      mutationState: {
        status: "error",
        provider: "fitbit",
        action: "sync",
        message: null,
        error: "Sync failed.",
      },
      refresh: vi.fn(),
      connectProvider: vi.fn(),
      syncProvider: vi.fn(),
      disconnectProvider: vi.fn(),
      clearMutationError: vi.fn(),
    });

    render(
      <IntegrationsPageClient
        fullName="Nuvita User"
        callbackProvider={null}
        callbackStatus={null}
        callbackMessage={null}
      />
    );

    expect(screen.getByText(/Integration action failed/i)).toBeInTheDocument();
    expect(screen.getByText(/Unable to load integrations/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Retry/i }).length).toBeGreaterThan(0);
  });
});
