export type DailyGoalTargets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type DailyConsumedTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type DailyRemainingTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type DailyProgress = {
  calories_percent: number;
  protein_percent: number;
  carbs_percent: number;
  fat_percent: number;
};

export type DailyMealSummary = {
  id: string;
  meal_name: string;
  meal_type: string;
  eaten_at: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  item_count: number;
};

export type DailySummaryResponse = {
  success: true;
  date: string;
  goals: DailyGoalTargets;
  consumed: DailyConsumedTotals;
  remaining: DailyRemainingTotals;
  progress: DailyProgress;
  meals: DailyMealSummary[];
};

export type DailySummaryState =
  | {
      status: "loading";
      data: null;
      error: null;
    }
  | {
      status: "success";
      data: DailySummaryResponse;
      error: null;
    }
  | {
      status: "empty";
      data: DailySummaryResponse;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };
