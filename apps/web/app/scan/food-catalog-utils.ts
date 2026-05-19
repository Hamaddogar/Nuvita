import type { AnalyzeImageResponse } from "./types";
import type { FavoriteFoodPayload, FoodCatalogItem, FoodCatalogSource } from "./food-catalog-types";

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value * 100) / 100);
}

function normalizeServingLabel(food: FoodCatalogItem): string {
  const serving = food.serving_size.trim();
  if (serving) {
    return serving;
  }
  if (food.serving_size_g && food.serving_size_g > 0) {
    return `${food.serving_size_g} g`;
  }
  return "1 serving";
}

function sourceToConfidence(source: FoodCatalogSource): number {
  switch (source) {
    case "favorite":
      return 0.96;
    case "recent":
      return 0.9;
    case "openfoodfacts":
      return 0.94;
    case "usda":
      return 0.92;
    case "custom":
      return 0.88;
    default:
      return 0.85;
  }
}

export function getFoodSourceLabel(source: FoodCatalogSource): string {
  switch (source) {
    case "favorite":
      return "Favorite";
    case "recent":
      return "Recent";
    case "openfoodfacts":
      return "Barcode";
    case "usda":
      return "USDA";
    case "custom":
      return "Custom";
    default:
      return "Catalog";
  }
}

export function buildAnalysisFromFood(food: FoodCatalogItem): AnalyzeImageResponse {
  const detectedFood = {
    name: food.name,
    quantity_estimate: normalizeServingLabel(food),
    estimated_grams: food.serving_size_g ?? null,
    calories: clampNonNegative(food.calories),
    protein_g: clampNonNegative(food.protein_g),
    carbs_g: clampNonNegative(food.carbs_g),
    fat_g: clampNonNegative(food.fat_g),
    confidence: sourceToConfidence(food.source),
    usda_match: food.source === "usda" ? { fdc_id: food.id, description: food.name } : null,
  };

  return {
    success: true,
    detected_foods: [detectedFood],
    total: {
      calories: detectedFood.calories,
      protein_g: detectedFood.protein_g,
      carbs_g: detectedFood.carbs_g,
      fat_g: detectedFood.fat_g,
    },
    notes: [
      `Imported from ${getFoodSourceLabel(food.source)} catalog.`,
      "Verify serving size and macros before saving.",
    ],
  };
}

export function buildFavoritePayload(food: FoodCatalogItem): FavoriteFoodPayload {
  return {
    id: food.id,
    name: food.name,
    brand: food.brand,
    serving_size: normalizeServingLabel(food),
    serving_size_g: food.serving_size_g,
    calories: clampNonNegative(food.calories),
    protein_g: clampNonNegative(food.protein_g),
    carbs_g: clampNonNegative(food.carbs_g),
    fat_g: clampNonNegative(food.fat_g),
    image_url: food.image_url,
    barcode: food.barcode,
    source: "favorite",
  };
}
