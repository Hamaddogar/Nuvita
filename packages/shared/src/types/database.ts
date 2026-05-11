import type {
  ActivityLevel,
  ConfidenceLevel,
  DietPreference,
  GoalType,
  MealType,
} from "./enums";

export type UUID = string;
export type ISODateString = string;

export type NutritionTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
};

export type Profile = {
  id: UUID;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  gender: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  dietPreference: DietPreference | null;
  onboardingCompleted: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type UserGoal = {
  id: UUID;
  userId: UUID;
  goalType: GoalType;
  goalWeightKg: number | null;
  dailyCalorieTarget: number | null;
  proteinTargetG: number | null;
  carbsTargetG: number | null;
  fatTargetG: number | null;
  fiberTargetG: number | null;
  sugarLimitG: number | null;
  sodiumLimitMg: number | null;
  waterTargetMl: number | null;
  weeklyWeightGoalKg: number | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type Meal = {
  id: UUID;
  userId: UUID;
  mealName: string;
  mealType: MealType;
  imageUrl: string | null;
  imageStoragePath: string | null;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
  totalSugarG: number;
  totalSodiumMg: number;
  aiConfidence: ConfidenceLevel;
  aiAccuracyWarning: string | null;
  clarifyingQuestion: string | null;
  userConfirmed: boolean;
  consumedPercentage: number;
  eatenAt: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type MealItem = {
  id: UUID;
  mealId: UUID;
  userId: UUID;
  name: string;
  category: string | null;
  portionDescription: string | null;
  estimatedWeightG: number | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  confidence: ConfidenceLevel;
  notes: string | null;
  nutritionSource: string;
  usdaFoodId: string | null;
  usdaMatchConfidence: number | null;
  createdAt: ISODateString;
};

export type DailyNutritionTotal = {
  id: UUID;
  userId: UUID;
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  waterMl: number;
  mealsCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type WaterLog = {
  id: UUID;
  userId: UUID;
  amountMl: number;
  loggedAt: ISODateString;
  createdAt: ISODateString;
};

export type WeightLog = {
  id: UUID;
  userId: UUID;
  weightKg: number;
  bodyFatPercentage: number | null;
  notes: string | null;
  loggedAt: ISODateString;
  createdAt: ISODateString;
};

export type AIFeedback = {
  id: UUID;
  userId: UUID;
  date: string;
  summary: string | null;
  whatWentWell: string | null;
  needsImprovement: string | null;
  nextMealSuggestion: string | null;
  motivation: string | null;
  remainingCalories: number | null;
  remainingProteinG: number | null;
  remainingCarbsG: number | null;
  remainingFatG: number | null;
  createdAt: ISODateString;
};

export type FoodCorrection = {
  id: UUID;
  userId: UUID;
  mealItemId: UUID | null;
  aiPredictedName: string | null;
  correctedName: string | null;
  aiPredictedPortion: string | null;
  correctedPortion: string | null;
  aiPredictedCalories: number | null;
  correctedCalories: number | null;
  notes: string | null;
  createdAt: ISODateString;
};

export type FavoriteMeal = {
  id: UUID;
  userId: UUID;
  name: string;
  mealSnapshot: Record<string, unknown>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type CustomFood = {
  id: UUID;
  userId: UUID;
  name: string;
  brand: string | null;
  servingSizeG: number | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type BarcodeFood = {
  id: UUID;
  barcode: string;
  name: string;
  brand: string | null;
  servingSizeG: number | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  source: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type Notification = {
  id: UUID;
  userId: UUID;
  type: string;
  title: string;
  body: string | null;
  scheduledFor: ISODateString | null;
  sentAt: ISODateString | null;
  readAt: ISODateString | null;
  createdAt: ISODateString;
};
