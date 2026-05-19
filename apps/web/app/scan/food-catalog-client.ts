import { mapApiError } from "@/lib/user-facing-errors";
import type {
  BarcodeLookupResponse,
  FavoriteFoodPayload,
  FavoriteFoodResponse,
  FoodCatalogItem,
  FoodCatalogSource,
  FoodSearchResponse,
  FoodsCollectionResponse,
} from "./food-catalog-types";

const DEFAULT_TIMEOUT_MS = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeJsonParse(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { detail: raw || "Unexpected response body." };
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  const detail = payload.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  return cleaned || null;
}

function isFoodCatalogSource(value: unknown): value is FoodCatalogSource {
  return (
    value === "usda"
    || value === "openfoodfacts"
    || value === "recent"
    || value === "favorite"
    || value === "custom"
  );
}

function toFoodCatalogItem(payload: unknown): FoodCatalogItem | null {
  if (!isRecord(payload)) {
    return null;
  }

  const id = toStringOrNull(payload.id);
  const name = toStringOrNull(payload.name);
  const servingSize = toStringOrNull(payload.serving_size);
  const source = payload.source;

  const calories = toNumber(payload.calories);
  const protein = toNumber(payload.protein_g);
  const carbs = toNumber(payload.carbs_g);
  const fat = toNumber(payload.fat_g);

  if (
    !id
    || !name
    || !servingSize
    || calories === null
    || protein === null
    || carbs === null
    || fat === null
    || !isFoodCatalogSource(source)
  ) {
    return null;
  }

  return {
    id,
    name,
    brand: toStringOrNull(payload.brand),
    serving_size: servingSize,
    serving_size_g: toNumber(payload.serving_size_g),
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    image_url: toStringOrNull(payload.image_url),
    barcode: toStringOrNull(payload.barcode),
    source,
  };
}

function createRequestController(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const abortFromExternal = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromExternal, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      window.clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", abortFromExternal);
      }
    },
  };
}

async function requestJson({
  path,
  method = "GET",
  body,
  signal,
}: {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}): Promise<unknown> {
  const requestController = createRequestController(signal);

  try {
    const response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: requestController.signal,
    });

    const raw = await response.text();
    const payload = safeJsonParse(raw);

    if (!response.ok) {
      const detail = extractErrorMessage(payload);
      if (detail) {
        throw new Error(mapApiError(detail, "Food catalog request failed. Please try again."));
      }
      if (response.status === 401) {
        throw new Error("Your session expired. Please log in again.");
      }
      throw new Error("Food catalog request failed. Please try again.");
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    if (error instanceof Error) {
      throw new Error(mapApiError(error.message, "Food catalog request failed. Please try again."));
    }
    throw new Error("Food catalog request failed. Please try again.");
  } finally {
    requestController.cleanup();
  }
}

export async function searchFoods({
  query,
  page = 1,
  limit = 12,
  signal,
}: {
  query: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<FoodSearchResponse> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    throw new Error("Search query must contain at least 2 characters.");
  }

  const params = new URLSearchParams({
    q: normalizedQuery,
    page: String(page),
    limit: String(limit),
  });
  const payload = await requestJson({ path: `/api/foods/search?${params.toString()}`, signal });

  if (!isRecord(payload) || !Array.isArray(payload.foods) || !isRecord(payload.pagination)) {
    throw new Error("Unexpected search response.");
  }

  const foods = payload.foods.map(toFoodCatalogItem).filter((item): item is FoodCatalogItem => Boolean(item));
  const pagination = payload.pagination;

  return {
    success: payload.success === true,
    query: toStringOrNull(payload.query) || normalizedQuery,
    foods,
    pagination: {
      page: toNumber(pagination.page) || 1,
      limit: toNumber(pagination.limit) || limit,
      has_more: pagination.has_more === true,
    },
  };
}

export async function lookupFoodByBarcode({
  barcode,
  signal,
}: {
  barcode: string;
  signal?: AbortSignal;
}): Promise<BarcodeLookupResponse> {
  const normalizedBarcode = barcode.trim();
  if (!/^\d{8,14}$/.test(normalizedBarcode)) {
    throw new Error("Barcode must contain 8-14 digits.");
  }

  const payload = await requestJson({
    path: `/api/foods/barcode/${encodeURIComponent(normalizedBarcode)}`,
    signal,
  });

  if (!isRecord(payload)) {
    throw new Error("Unexpected barcode lookup response.");
  }
  const food = toFoodCatalogItem(payload.food);
  if (!food) {
    throw new Error("Unexpected barcode lookup response.");
  }

  return {
    success: payload.success === true,
    barcode: toStringOrNull(payload.barcode) || normalizedBarcode,
    food,
  };
}

async function getFoodsCollection(path: string): Promise<FoodsCollectionResponse> {
  const payload = await requestJson({ path });
  if (!isRecord(payload) || !Array.isArray(payload.foods)) {
    throw new Error("Unexpected foods response.");
  }
  return {
    success: payload.success === true,
    foods: payload.foods
      .map(toFoodCatalogItem)
      .filter((item): item is FoodCatalogItem => Boolean(item)),
  };
}

export async function fetchRecentFoods(limit = 8): Promise<FoodsCollectionResponse> {
  return getFoodsCollection(`/api/foods/recent?limit=${encodeURIComponent(String(limit))}`);
}

export async function fetchFavoriteFoods(limit = 8): Promise<FoodsCollectionResponse> {
  return getFoodsCollection(`/api/foods/favorites?limit=${encodeURIComponent(String(limit))}`);
}

export async function saveFavoriteFood(food: FavoriteFoodPayload): Promise<FavoriteFoodResponse> {
  const payload = await requestJson({
    path: "/api/foods/favorite",
    method: "POST",
    body: { food },
  });

  if (!isRecord(payload) || typeof payload.favorite_id !== "string") {
    throw new Error("Unexpected favorite save response.");
  }

  const savedFood = toFoodCatalogItem(payload.food);
  if (!savedFood) {
    throw new Error("Unexpected favorite save response.");
  }

  return {
    success: payload.success === true,
    favorite_id: payload.favorite_id,
    food: savedFood,
  };
}
