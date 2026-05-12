export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type MealItemSource = "ai_usda" | "ai_estimate" | "manual";

export type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type EditableMealItem = {
  id: string;
  name: string;
  quantity_estimate: string;
  estimated_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  source: MealItemSource;
};

export type MealDraftState = {
  imageUrl: string | null;
  items: EditableMealItem[];
  mealName: string;
  mealType: MealType | "";
  eatenAt: string;
  notes: string;
  totals: MacroTotals;
  warnings: string[];
};

export type ConfirmedMealItem = {
  name: string;
  quantity_estimate: string | null;
  estimated_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  source: MealItemSource;
};

export type ConfirmedMeal = {
  meal_name: string;
  meal_type: MealType;
  eaten_at: string;
  notes: string;
  items: ConfirmedMealItem[];
  total: MacroTotals;
};

export type MealDraftValidation = {
  formErrors: string[];
  itemErrors: Record<string, string[]>;
  isValid: boolean;
};

export const MEAL_TYPE_OPTIONS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
