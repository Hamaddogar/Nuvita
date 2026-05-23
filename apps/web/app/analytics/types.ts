export type WeightUnit = "kg" | "lb";
export type TrendDirection = "up" | "down" | "stable";
export type AnalyticsSummarySource = "ai" | "fallback";
export type StreakUnit = "days" | "weeks";

export type GoalAdherenceBreakdown = {
  calories_percent: number;
  protein_percent: number;
  carbs_percent: number;
  fat_percent: number;
  hydration_percent: number;
  overall_percent: number;
};

export type DailyAnalyticsMetric = {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  hydration_ml: number;
  hydration_goal_ml: number;
  calorie_adherence_percent: number;
  protein_adherence_percent: number;
  carbs_adherence_percent: number;
  fat_adherence_percent: number;
  hydration_adherence_percent: number;
  weight: number | null;
  weight_unit: WeightUnit;
  meal_count: number;
  tracked: boolean;
};

export type WeeklyMacroAverage = {
  macro: "calories" | "protein_g" | "carbs_g" | "fat_g" | "hydration_ml";
  average: number;
  goal: number;
  adherence_percent: number;
};

export type WeeklyAnalyticsSummary = {
  week_start: string;
  week_end: string;
  days_tracked: number;
  calorie_trend: TrendDirection;
  weight_trend: TrendDirection;
  protein_consistency_score: number;
  hydration_consistency_score: number;
  goal_adherence: GoalAdherenceBreakdown;
  weekly_macro_averages: WeeklyMacroAverage[];
  weight_change: number | null;
  weight_goal_progress_percent: number | null;
};

export type AnalyticsWeeklyResponse = {
  success: true;
  timezone: string;
  summary: WeeklyAnalyticsSummary;
  daily_metrics: DailyAnalyticsMetric[];
};

export type MonthlyWeekMetric = {
  week_start: string;
  week_end: string;
  avg_calories: number;
  avg_protein_g: number;
  avg_hydration_ml: number;
  goal_adherence_percent: number;
  weight_change: number | null;
};

export type MonthlyAnalyticsSummary = {
  period_start: string;
  period_end: string;
  days_tracked: number;
  average_goal_adherence_percent: number;
  calories_trend: TrendDirection;
  protein_trend: TrendDirection;
  hydration_trend: TrendDirection;
  weight_trend: TrendDirection;
};

export type AnalyticsMonthlyResponse = {
  success: true;
  timezone: string;
  summary: MonthlyAnalyticsSummary;
  daily_metrics: DailyAnalyticsMetric[];
  weekly_metrics: MonthlyWeekMetric[];
};

export type StreakMetric = {
  key: "meal_logging" | "hydration_goal" | "protein_goal" | "weight_logging_weeks";
  label: string;
  current: number;
  best: number;
  unit: StreakUnit;
  is_active: boolean;
};

export type AnalyticsStreaksResponse = {
  success: true;
  as_of_date: string;
  streaks: StreakMetric[];
};

export type AchievementMetric = {
  id: string;
  title: string;
  description: string;
  category: "consistency" | "hydration" | "nutrition" | "weight" | "milestone";
  current_value: number;
  target_value: number;
  progress_percent: number;
  unlocked: boolean;
  unlocked_at: string | null;
};

export type AnalyticsAchievementsResponse = {
  success: true;
  generated_at: string;
  total_unlocked: number;
  achievements: AchievementMetric[];
};

export type AnalyticsSummaryKeyMetrics = {
  days_tracked: number;
  average_goal_adherence_percent: number;
  logging_streak_days: number;
  hydration_streak_days: number;
  protein_streak_days: number;
  weight_goal_progress_percent: number | null;
};

export type SmartProgressSummary = {
  headline: string;
  wins: string[];
  focus_areas: string[];
  next_steps: string[];
  motivation: string;
  risk_flags: string[];
  confidence_score: number;
};

export type AnalyticsSummaryResponse = {
  success: true;
  source: AnalyticsSummarySource;
  timezone: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  key_metrics: AnalyticsSummaryKeyMetrics;
  streak_highlights: StreakMetric[];
  summary: SmartProgressSummary;
  fallback_reason: string | null;
};

export type AsyncSectionState<T> =
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
