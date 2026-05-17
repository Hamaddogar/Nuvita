export type InsightPriority = "high" | "medium" | "low";
export type InsightType =
  | "calorie_balance"
  | "protein"
  | "carbs"
  | "fat"
  | "meal_timing"
  | "consistency"
  | "recommendation"
  | "motivation"
  | "warning"
  | "weekly_summary";
export type InsightSource = "ai" | "fallback" | "mixed";

export type AIInsightItem = {
  id: string;
  type: InsightType;
  priority: InsightPriority;
  title: string;
  message: string;
  recommendation: string;
  actionable: boolean;
  created_at: string;
};

export type DailyInsightSummary = {
  goals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  consumed: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  progress: {
    calories_percent: number;
    protein_percent: number;
    carbs_percent: number;
    fat_percent: number;
  };
  meal_count: number;
  calorie_adherence_percent: number;
  logging_streak_days: number;
  protein_goal_hit_streak_days: number;
  late_night_calorie_share_percent: number;
  goal_type: string | null;
};

export type AIInsightsTodayResponse = {
  success: true;
  date: string;
  timezone: string;
  source: InsightSource;
  summary: DailyInsightSummary;
  insights: AIInsightItem[];
  fallback_reason: string | null;
};

export type WeeklyDailyMetric = {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_count: number;
  calorie_adherence_percent: number;
  protein_adherence_percent: number;
  tracked: boolean;
};

export type WeeklyInsightSummary = {
  week_start: string;
  week_end: string;
  days_tracked: number;
  avg_calorie_adherence_percent: number;
  avg_protein_adherence_percent: number;
  consistency_score: number;
  best_day: string | null;
  best_day_reason: string | null;
  weakest_macro: "calories" | "protein_g" | "carbs_g" | "fat_g" | null;
  trend: "improving" | "stable" | "needs_attention";
  improvement_note: string;
  goal_type: string | null;
};

export type AIInsightsWeeklyResponse = {
  success: true;
  timezone: string;
  source: InsightSource;
  summary: WeeklyInsightSummary;
  daily_metrics: WeeklyDailyMetric[];
  insights: AIInsightItem[];
  fallback_reason: string | null;
};

export type AIInsightsTodayState =
  | {
      status: "loading";
      data: null;
      error: null;
    }
  | {
      status: "success" | "partial" | "fallback" | "empty";
      data: AIInsightsTodayResponse;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };

export type AIInsightsWeeklyState =
  | {
      status: "loading";
      data: null;
      error: null;
    }
  | {
      status: "success" | "partial" | "fallback" | "empty";
      data: AIInsightsWeeklyResponse;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };
