export type WeightUnit = "kg" | "lb";

export type WaterLogRecord = {
  id: string;
  amount_ml: number;
  logged_at: string;
  created_at: string;
};

export type WaterTodayResponse = {
  success: true;
  date: string;
  today_total_ml: number;
  goal_ml: number;
  remaining_ml: number;
  progress_percent: number;
  logs: WaterLogRecord[];
};

export type WaterHistoryEntry = {
  date: string;
  total_ml: number;
  goal_ml: number;
  progress_percent: number;
};

export type WaterHistoryResponse = {
  success: true;
  entries: WaterHistoryEntry[];
  logs: WaterLogRecord[];
};

export type WaterLogMutationResponse = {
  success: true;
  log: WaterLogRecord;
  today_total_ml: number;
  goal_ml: number;
  remaining_ml: number;
  progress_percent: number;
};

export type WaterGoalResponse = {
  success: true;
  goal_ml: number;
};

export type WeightTrendPoint = {
  date: string;
  weight: number;
  unit: WeightUnit;
};

export type WeightLogRecord = {
  id: string;
  weight: number;
  unit: WeightUnit;
  weight_kg: number;
  notes: string | null;
  logged_at: string;
  created_at: string;
};

export type WeightSummaryResponse = {
  success: true;
  current_weight: number | null;
  target_weight: number | null;
  unit: WeightUnit;
  change_from_start: number | null;
  remaining_to_goal: number | null;
  recent_change: number | null;
  progress_percent: number | null;
  trend: WeightTrendPoint[];
};

export type WeightHistoryResponse = {
  success: true;
  logs: WeightLogRecord[];
  trend: WeightTrendPoint[];
};

export type WeightLogMutationResponse = {
  success: true;
  log: WeightLogRecord;
  summary: WeightSummaryResponse;
};

export type WeightGoalResponse = {
  success: true;
  target_weight: number;
  unit: WeightUnit;
};

export type WeightTrackingSnapshot = {
  summary: WeightSummaryResponse;
  history: WeightHistoryResponse;
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
      status: "empty";
      data: T;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };

export type MutationState =
  | {
      status: "idle";
      error: null;
    }
  | {
      status: "pending";
      error: null;
    }
  | {
      status: "error";
      error: string;
    };
