export type IntegrationProvider = "fitbit" | "apple_health" | "google_fit" | "health_connect";

export type IntegrationStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "syncing"
  | "sync_success"
  | "sync_error"
  | "permission_required"
  | "native_required";

export type IntegrationProviderCard = {
  provider: IntegrationProvider;
  display_name: string;
  status: IntegrationStatus;
  supports_web_oauth: boolean;
  requires_native_app: boolean;
  data_types: string[];
  permissions: string[];
  connected_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  message: string | null;
};

export type IntegrationsListResponse = {
  success: true;
  integrations: IntegrationProviderCard[];
};

export type IntegrationSyncCounts = {
  activity_records: number;
  body_records: number;
  sleep_records: number;
  heart_records: number;
};

export type IntegrationConnectResponse = {
  success: boolean;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  authorization_url: string | null;
  message: string | null;
  state_expires_at: string | null;
};

export type IntegrationSyncResponse = {
  success: boolean;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  message: string;
  synced_counts: IntegrationSyncCounts;
  last_synced_at: string | null;
};

export type IntegrationDisconnectResponse = {
  success: boolean;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  message: string;
};

export type IntegrationStatusSnapshot = {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  last_synced_at: string | null;
};

export type LatestWeightRecord = {
  provider: IntegrationProvider;
  weight: number;
  unit: "kg" | "lb";
  body_fat_percentage: number | null;
  recorded_at: string;
};

export type HealthDataSummaryResponse = {
  success: true;
  date: string;
  timezone: string;
  steps_today: number;
  active_calories_today: number;
  distance_meters_today: number;
  exercise_minutes_today: number;
  workouts_this_week: number;
  latest_weight: LatestWeightRecord | null;
  sleep_duration_minutes: number | null;
  resting_heart_rate_bpm: number | null;
  integration_status: IntegrationStatusSnapshot[];
};

export type AsyncResourceState<T> =
  | {
      status: "loading";
      data: null;
      error: null;
    }
  | {
      status: "success";
      data: T;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };

export type IntegrationAction = "connect" | "sync" | "disconnect";

export type MutationState =
  | {
      status: "idle";
      provider: null;
      action: null;
      message: null;
      error: null;
    }
  | {
      status: "pending";
      provider: IntegrationProvider;
      action: IntegrationAction;
      message: null;
      error: null;
    }
  | {
      status: "success";
      provider: IntegrationProvider;
      action: IntegrationAction;
      message: string | null;
      error: null;
    }
  | {
      status: "error";
      provider: IntegrationProvider;
      action: IntegrationAction;
      message: null;
      error: string;
    };
