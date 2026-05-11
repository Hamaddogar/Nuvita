import type {
  ActivityLevel,
  ConfidenceLevel,
  DietPreference,
  GoalType,
  MealType,
} from "./enums";
import type { AIAnalysisItem } from "./ai";
import type { NutritionTotals, UUID } from "./database";

export type CreateMealInput = {
  userId: UUID;
  mealName: string;
  mealType?: MealType;
  imageUrl?: string | null;
  imageStoragePath?: string | null;
  eatenAt?: string;
};

export type SaveMealInput = {
  userId: UUID;
  mealName: string;
  mealType: MealType;
  imageUrl?: string | null;
  imageStoragePath?: string | null;
  aiConfidence: ConfidenceLevel;
  aiAccuracyWarning?: string | null;
  clarifyingQuestion?: string | null;
  userConfirmed: boolean;
  consumedPercentage: number;
  eatenAt: string;
  totals: NutritionTotals;
  items: AIAnalysisItem[];
};

export type DashboardSummary = {
  date: string;
  consumed: NutritionTotals;
  remaining: NutritionTotals;
  mealsCount: number;
  calorieTarget: number | null;
  proteinTargetG: number | null;
  waterMl: number;
};

export type OnboardingInput = {
  fullName?: string;
  gender?: string;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: ActivityLevel;
  dietPreference?: DietPreference;
  goalType: GoalType;
  goalWeightKg?: number;
  dailyCalorieTarget?: number;
  proteinTargetG?: number;
  carbsTargetG?: number;
  fatTargetG?: number;
  fiberTargetG?: number;
  sugarLimitG?: number;
  sodiumLimitMg?: number;
  waterTargetMl?: number;
  weeklyWeightGoalKg?: number;
};
