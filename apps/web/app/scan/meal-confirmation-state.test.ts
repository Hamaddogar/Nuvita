import {
  buildConfirmedMeal,
  buildMealDraftFromAnalysis,
  mealDraftReducer,
} from "./meal-confirmation-state";
import type { AnalyzeImageResponse } from "./types";

const ANALYSIS_RESULT: AnalyzeImageResponse = {
  success: true,
  detected_foods: [
    {
      name: "Grilled chicken",
      quantity_estimate: "120 g",
      estimated_grams: 120,
      calories: 198,
      protein_g: 37,
      carbs_g: 0,
      fat_g: 4,
      confidence: 0.9,
      usda_match: null,
    },
    {
      name: "Brown rice",
      quantity_estimate: "100 g",
      estimated_grams: 100,
      calories: 111,
      protein_g: 2.6,
      carbs_g: 23,
      fat_g: 0.9,
      confidence: 0.7,
      usda_match: null,
    },
  ],
  total: {
    calories: 309,
    protein_g: 39.6,
    carbs_g: 23,
    fat_g: 4.9,
  },
  notes: ["Portion estimate only"],
};

describe("meal confirmation state", () => {
  it("builds a draft with derived meal name and warning banner content", () => {
    const draft = buildMealDraftFromAnalysis(ANALYSIS_RESULT, "blob:image-preview");

    expect(draft.mealName).toBe("Grilled chicken + Brown rice");
    expect(draft.totals.calories).toBeCloseTo(309, 1);
    expect(draft.warnings[0]).toMatch(/Nutrition values are estimates/i);
    expect(draft.warnings).toContain("Portion estimate only");
  });

  it("rescales item macros when grams are edited and emits clean confirmed payload", () => {
    const initialDraft = buildMealDraftFromAnalysis(ANALYSIS_RESULT, null);
    const firstItem = initialDraft.items[0];

    const updatedDraft = mealDraftReducer(initialDraft, {
      type: "UPDATE_ITEM_GRAMS",
      itemId: firstItem.id,
      value: "240",
    });

    const withType = mealDraftReducer(updatedDraft, {
      type: "SET_METADATA",
      field: "mealType",
      value: "dinner",
    });
    const withBlankName = mealDraftReducer(withType, {
      type: "SET_METADATA",
      field: "mealName",
      value: "   ",
    });

    const confirmed = buildConfirmedMeal(withBlankName);

    expect(updatedDraft.items[0].calories).toBeCloseTo(396, 1);
    expect(updatedDraft.totals.protein_g).toBeGreaterThan(initialDraft.totals.protein_g);
    expect(confirmed.meal_name).toBe("Grilled chicken + Brown rice");
    expect(confirmed.meal_type).toBe("dinner");
  });
});
