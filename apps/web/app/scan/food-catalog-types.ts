export type FoodCatalogSource = "usda" | "openfoodfacts" | "recent" | "favorite" | "custom";

export type FoodCatalogItem = {
  id: string;
  name: string;
  brand: string | null;
  serving_size: string;
  serving_size_g: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  image_url: string | null;
  barcode: string | null;
  source: FoodCatalogSource;
};

export type FoodSearchResponse = {
  success: boolean;
  query: string;
  foods: FoodCatalogItem[];
  pagination: {
    page: number;
    limit: number;
    has_more: boolean;
  };
};

export type BarcodeLookupResponse = {
  success: boolean;
  barcode: string;
  food: FoodCatalogItem;
};

export type FoodsCollectionResponse = {
  success: boolean;
  foods: FoodCatalogItem[];
};

export type FavoriteFoodPayload = {
  id?: string | null;
  name: string;
  brand?: string | null;
  serving_size: string;
  serving_size_g?: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  image_url?: string | null;
  barcode?: string | null;
  source: FoodCatalogSource;
};

export type FavoriteFoodResponse = {
  success: boolean;
  favorite_id: string;
  food: FoodCatalogItem;
};
