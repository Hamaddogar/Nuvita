import { foodCatalogReducer, initialFoodCatalogState } from "./food-catalog-state";
import type { FoodCatalogItem } from "./food-catalog-types";

const BASE_FOOD: FoodCatalogItem = {
  id: "usda:1",
  name: "Greek Yogurt",
  brand: "Plain",
  serving_size: "170 g",
  serving_size_g: 170,
  calories: 100,
  protein_g: 17,
  carbs_g: 6,
  fat_g: 0,
  image_url: null,
  barcode: null,
  source: "usda",
};

describe("foodCatalogReducer", () => {
  it("deduplicates foods for successful search results", () => {
    const duplicate = { ...BASE_FOOD, id: "usda:2" };
    const unique = { ...BASE_FOOD, id: "usda:3", name: "Milk", brand: "Low Fat" };

    const next = foodCatalogReducer(initialFoodCatalogState, {
      type: "SEARCH_SUCCESS",
      foods: [BASE_FOOD, duplicate, unique],
    });

    expect(next.searchStatus).toBe("success");
    expect(next.searchResults).toHaveLength(2);
    expect(next.searchResults.map((food) => food.name)).toEqual(["Greek Yogurt", "Milk"]);
  });

  it("handles barcode lookup request and success lifecycle", () => {
    const loading = foodCatalogReducer(initialFoodCatalogState, {
      type: "BARCODE_REQUEST",
      barcode: "8901234567890",
    });
    const success = foodCatalogReducer(loading, {
      type: "BARCODE_SUCCESS",
      food: { ...BASE_FOOD, id: "barcode:1", source: "openfoodfacts", barcode: "8901234567890" },
    });

    expect(loading.barcodeStatus).toBe("loading");
    expect(success.barcodeStatus).toBe("success");
    expect(success.barcodeResult?.barcode).toBe("8901234567890");
  });

  it("upserts favorite foods to the top of the list", () => {
    const starting = {
      ...initialFoodCatalogState,
      favoriteFoods: [{ ...BASE_FOOD, id: "favorite:older", source: "favorite" }],
    };

    const updated = foodCatalogReducer(starting, {
      type: "UPSERT_FAVORITE",
      food: { ...BASE_FOOD, id: "favorite:new", source: "favorite" },
    });

    expect(updated.favoriteFoods).toHaveLength(1);
    expect(updated.favoriteFoods[0].id).toBe("favorite:new");
    expect(updated.favoriteFoods[0].source).toBe("favorite");
  });
});
