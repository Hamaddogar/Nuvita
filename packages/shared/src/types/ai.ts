import type { ConfidenceLevel, MealType } from "./enums";

export type AIAnalysisItem = {
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
  nutritionSource: "ai_estimate" | "usda_matched" | "user_entered";
  usdaFoodId: string | null;
  usdaMatchConfidence: number | null;
};

export type AIAnalysisResult = {
  mealName: string;
  mealType: MealType;
  confidence: ConfidenceLevel;
  clarifyingQuestion: string | null;
  aiAccuracyWarning: string | null;
  totals: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sugarG: number;
    sodiumMg: number;
  };
  items: AIAnalysisItem[];
};
