import { initialScanState, scanReducer } from "./scan-state";
import type { AnalyzeImageResponse } from "./types";

const MOCK_ANALYSIS: AnalyzeImageResponse = {
  success: true,
  detected_foods: [
    {
      name: "Rice",
      quantity_estimate: "1 cup",
      estimated_grams: 150,
      calories: 200,
      protein_g: 4,
      carbs_g: 44,
      fat_g: 1,
      confidence: 0.82,
      usda_match: null,
    },
  ],
  total: {
    calories: 200,
    protein_g: 4,
    carbs_g: 44,
    fat_g: 1,
  },
  notes: [],
};

describe("scanReducer", () => {
  it("rejects analysis when no image is selected", () => {
    const next = scanReducer(initialScanState, { type: "START_ANALYSIS" });

    expect(next.status).toBe("error");
    expect(next.error).toMatch(/upload a meal photo/i);
  });

  it("transitions from selected image to confirming after successful analysis", () => {
    const file = new File(["image"], "meal.jpg", { type: "image/jpeg" });
    const selected = scanReducer(initialScanState, { type: "SELECT_IMAGE", file });
    const analyzing = scanReducer(selected, { type: "START_ANALYSIS" });
    const confirming = scanReducer(analyzing, { type: "ANALYSIS_SUCCESS", result: MOCK_ANALYSIS });

    expect(selected.status).toBe("image_selected");
    expect(analyzing.status).toBe("analyzing");
    expect(confirming.status).toBe("confirming");
    expect(confirming.result).toEqual(MOCK_ANALYSIS);
  });

  it("clears error back to image_selected when image is still present", () => {
    const file = new File(["image"], "meal.jpg", { type: "image/jpeg" });
    const erroredState = {
      ...initialScanState,
      status: "error" as const,
      selectedFile: file,
      error: "Something failed",
    };

    const cleared = scanReducer(erroredState, { type: "CLEAR_ERROR" });

    expect(cleared.status).toBe("image_selected");
    expect(cleared.error).toBeNull();
  });
});
