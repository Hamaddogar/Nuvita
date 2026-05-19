import { buildAnalysisFromFood, buildFavoritePayload, getFoodSourceLabel } from "./food-catalog-utils";
import type { FoodCatalogItem } from "./food-catalog-types";

const SAMPLE_FOOD: FoodCatalogItem = {
  id: "openfoodfacts:8901234567890",
  name: "Protein Bar",
  brand: "Nuvita",
  serving_size: "1 bar (55 g)",
  serving_size_g: 55,
  calories: 220.4,
  protein_g: 19.6,
  carbs_g: 21.2,
  fat_g: 8.4,
  image_url: "https://example.com/bar.png",
  barcode: "8901234567890",
  source: "openfoodfacts",
};

describe("food-catalog-utils", () => {
  it("converts catalog food to analysis payload for meal confirmation", () => {
    const analysis = buildAnalysisFromFood(SAMPLE_FOOD);

    expect(analysis.success).toBe(true);
    expect(analysis.detected_foods).toHaveLength(1);
    expect(analysis.detected_foods[0].name).toBe("Protein Bar");
    expect(analysis.total.calories).toBe(220.4);
    expect(analysis.notes[0]).toMatch(/barcode/i);
  });

  it("creates favorite payload with normalized source", () => {
    const payload = buildFavoritePayload(SAMPLE_FOOD);

    expect(payload.source).toBe("favorite");
    expect(payload.name).toBe("Protein Bar");
    expect(payload.barcode).toBe("8901234567890");
  });

  it("maps source labels for quick UI badges", () => {
    expect(getFoodSourceLabel("usda")).toBe("USDA");
    expect(getFoodSourceLabel("openfoodfacts")).toBe("Barcode");
    expect(getFoodSourceLabel("favorite")).toBe("Favorite");
  });
});
