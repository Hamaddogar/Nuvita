import type { FoodCatalogItem } from "./food-catalog-types";

export type FoodQueryStatus = "idle" | "loading" | "success" | "error";
export type BarcodeLookupStatus = "idle" | "scanning" | "loading" | "success" | "error";
export type CatalogCollectionStatus = "idle" | "loading" | "success" | "error";

export type FoodCatalogState = {
  searchQuery: string;
  searchStatus: FoodQueryStatus;
  searchError: string | null;
  searchResults: FoodCatalogItem[];
  barcodeInput: string;
  barcodeStatus: BarcodeLookupStatus;
  barcodeError: string | null;
  barcodeResult: FoodCatalogItem | null;
  recentStatus: CatalogCollectionStatus;
  recentFoods: FoodCatalogItem[];
  favoritesStatus: CatalogCollectionStatus;
  favoriteFoods: FoodCatalogItem[];
};

export type FoodCatalogAction =
  | {
      type: "SET_SEARCH_QUERY";
      query: string;
    }
  | {
      type: "SEARCH_REQUEST";
    }
  | {
      type: "SEARCH_SUCCESS";
      foods: FoodCatalogItem[];
    }
  | {
      type: "SEARCH_ERROR";
      message: string;
    }
  | {
      type: "SEARCH_RESET";
    }
  | {
      type: "SET_BARCODE_INPUT";
      barcode: string;
    }
  | {
      type: "BARCODE_SCANNING";
    }
  | {
      type: "BARCODE_REQUEST";
      barcode: string;
    }
  | {
      type: "BARCODE_SUCCESS";
      food: FoodCatalogItem;
    }
  | {
      type: "BARCODE_ERROR";
      message: string;
    }
  | {
      type: "BARCODE_RESET";
    }
  | {
      type: "RECENTS_REQUEST";
    }
  | {
      type: "RECENTS_SUCCESS";
      foods: FoodCatalogItem[];
    }
  | {
      type: "RECENTS_ERROR";
    }
  | {
      type: "FAVORITES_REQUEST";
    }
  | {
      type: "FAVORITES_SUCCESS";
      foods: FoodCatalogItem[];
    }
  | {
      type: "FAVORITES_ERROR";
    }
  | {
      type: "UPSERT_FAVORITE";
      food: FoodCatalogItem;
    }
  | {
      type: "RESET_ALL";
    };

export const initialFoodCatalogState: FoodCatalogState = {
  searchQuery: "",
  searchStatus: "idle",
  searchError: null,
  searchResults: [],
  barcodeInput: "",
  barcodeStatus: "idle",
  barcodeError: null,
  barcodeResult: null,
  recentStatus: "idle",
  recentFoods: [],
  favoritesStatus: "idle",
  favoriteFoods: [],
};

function dedupeFoods(foods: FoodCatalogItem[]): FoodCatalogItem[] {
  const seen = new Set<string>();
  const unique: FoodCatalogItem[] = [];
  for (const food of foods) {
    const key = `${food.name.toLowerCase()}|${food.brand?.toLowerCase() ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(food);
  }
  return unique;
}

export function foodCatalogReducer(
  state: FoodCatalogState,
  action: FoodCatalogAction
): FoodCatalogState {
  switch (action.type) {
    case "SET_SEARCH_QUERY":
      return {
        ...state,
        searchQuery: action.query,
      };
    case "SEARCH_REQUEST":
      return {
        ...state,
        searchStatus: "loading",
        searchError: null,
      };
    case "SEARCH_SUCCESS":
      return {
        ...state,
        searchStatus: "success",
        searchError: null,
        searchResults: dedupeFoods(action.foods),
      };
    case "SEARCH_ERROR":
      return {
        ...state,
        searchStatus: "error",
        searchError: action.message,
      };
    case "SEARCH_RESET":
      return {
        ...state,
        searchStatus: "idle",
        searchError: null,
        searchResults: [],
      };
    case "SET_BARCODE_INPUT":
      return {
        ...state,
        barcodeInput: action.barcode,
      };
    case "BARCODE_SCANNING":
      return {
        ...state,
        barcodeStatus: "scanning",
        barcodeError: null,
      };
    case "BARCODE_REQUEST":
      return {
        ...state,
        barcodeInput: action.barcode,
        barcodeStatus: "loading",
        barcodeError: null,
        barcodeResult: null,
      };
    case "BARCODE_SUCCESS":
      return {
        ...state,
        barcodeStatus: "success",
        barcodeError: null,
        barcodeResult: action.food,
      };
    case "BARCODE_ERROR":
      return {
        ...state,
        barcodeStatus: "error",
        barcodeError: action.message,
      };
    case "BARCODE_RESET":
      return {
        ...state,
        barcodeStatus: "idle",
        barcodeError: null,
        barcodeResult: null,
      };
    case "RECENTS_REQUEST":
      return {
        ...state,
        recentStatus: "loading",
      };
    case "RECENTS_SUCCESS":
      return {
        ...state,
        recentStatus: "success",
        recentFoods: dedupeFoods(action.foods),
      };
    case "RECENTS_ERROR":
      return {
        ...state,
        recentStatus: "error",
      };
    case "FAVORITES_REQUEST":
      return {
        ...state,
        favoritesStatus: "loading",
      };
    case "FAVORITES_SUCCESS":
      return {
        ...state,
        favoritesStatus: "success",
        favoriteFoods: dedupeFoods(action.foods),
      };
    case "FAVORITES_ERROR":
      return {
        ...state,
        favoritesStatus: "error",
      };
    case "UPSERT_FAVORITE": {
      const withoutSameId = state.favoriteFoods.filter((food) => food.id !== action.food.id);
      const merged = dedupeFoods([{ ...action.food, source: "favorite" }, ...withoutSameId]);
      return {
        ...state,
        favoritesStatus: "success",
        favoriteFoods: merged,
      };
    }
    case "RESET_ALL":
      return {
        ...initialFoodCatalogState,
      };
    default:
      return state;
  }
}
