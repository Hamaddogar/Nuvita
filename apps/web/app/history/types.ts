export type MealHistorySummary = {
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  meal_count: number;
};

export type MealHistoryGoals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type MealHistoryRemaining = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type MealHistoryProgress = {
  calories_percent: number;
  protein_percent: number;
  carbs_percent: number;
  fat_percent: number;
};

export type MealHistoryEntry = {
  id: string;
  meal_name: string;
  meal_type: string;
  eaten_at: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  item_count: number;
  image_url: string | null;
};

export type MealHistoryResponse = {
  success: true;
  date: string;
  summary: MealHistorySummary;
  goals: MealHistoryGoals;
  remaining: MealHistoryRemaining;
  progress: MealHistoryProgress;
  meals: MealHistoryEntry[];
};

export type MealDetailMeal = {
  id: string;
  meal_name: string;
  meal_type: string;
  eaten_at: string;
  notes: string | null;
  image_url: string | null;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
};

export type MealDetailItem = {
  id: string;
  name: string;
  category: string | null;
  portion_description: string | null;
  estimated_weight_g: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: string;
  nutrition_source: string;
  notes: string | null;
};

export type MealDetailResponse = {
  success: true;
  meal: MealDetailMeal;
  items: MealDetailItem[];
};

export type MealHistoryState =
  | {
      status: "loading";
      data: null;
      error: null;
    }
  | {
      status: "success";
      data: MealHistoryResponse;
      error: null;
    }
  | {
      status: "empty";
      data: MealHistoryResponse;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };

export type MealDetailState =
  | {
      status: "idle";
      data: null;
      error: null;
    }
  | {
      status: "loading";
      data: null;
      error: null;
    }
  | {
      status: "success";
      data: MealDetailResponse;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };
