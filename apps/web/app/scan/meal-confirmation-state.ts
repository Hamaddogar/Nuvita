import type { AnalyzeImageResponse, DetectedFood } from "./types";
import type {
  ConfirmedMeal,
  EditableMealItem,
  MacroTotals,
  MealDraftState,
  MealDraftValidation,
  MealType,
} from "./meal-confirmation-types";

const ESTIMATION_WARNING = "Nutrition values are estimates. Adjust them before confirming if needed.";

function createClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function roundMacro(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(Math.max(0, value) * 100) / 100;
}

function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) {
    return 0;
  }
  return Math.max(0, Math.min(1, confidence));
}

function getLocalDateTimeValue(date = new Date()): string {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function deriveMealName(items: EditableMealItem[]): string {
  const names = items
    .map((item) => item.name.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (names.length === 0) {
    return "";
  }
  return names.join(" + ");
}

function toEditableItem(food: DetectedFood): EditableMealItem {
  return {
    id: createClientId(),
    name: food.name,
    quantity_estimate: food.quantity_estimate ?? "",
    estimated_grams: food.estimated_grams,
    calories: roundMacro(food.calories),
    protein_g: roundMacro(food.protein_g),
    carbs_g: roundMacro(food.carbs_g),
    fat_g: roundMacro(food.fat_g),
    confidence: clampConfidence(food.confidence),
    source: food.usda_match ? "ai_usda" : "ai_estimate",
  };
}

function createManualItem(): EditableMealItem {
  return {
    id: createClientId(),
    name: "",
    quantity_estimate: "",
    estimated_grams: null,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    confidence: 0.5,
    source: "manual",
  };
}

export function calculateTotals(items: EditableMealItem[]): MacroTotals {
  return items.reduce<MacroTotals>(
    (acc, item) => ({
      calories: roundMacro(acc.calories + item.calories),
      protein_g: roundMacro(acc.protein_g + item.protein_g),
      carbs_g: roundMacro(acc.carbs_g + item.carbs_g),
      fat_g: roundMacro(acc.fat_g + item.fat_g),
    }),
    {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    }
  );
}

export function buildMealDraftFromAnalysis(
  result: AnalyzeImageResponse,
  imageUrl: string | null
): MealDraftState {
  const items = result.detected_foods.map(toEditableItem);
  const warnings = [ESTIMATION_WARNING, ...result.notes]
    .map((note) => note.trim())
    .filter((note, index, array) => note.length > 0 && array.indexOf(note) === index);

  return {
    imageUrl,
    items,
    mealName: deriveMealName(items),
    mealType: "",
    eatenAt: getLocalDateTimeValue(),
    notes: "",
    totals: calculateTotals(items),
    warnings,
  };
}

type MetadataField = "mealName" | "mealType" | "eatenAt" | "notes";
type MacroField = "calories" | "protein_g" | "carbs_g" | "fat_g";
type TextItemField = "name" | "quantity_estimate";

export type MealDraftAction =
  | {
      type: "RESET_FROM_ANALYSIS";
      result: AnalyzeImageResponse;
      imageUrl: string | null;
    }
  | {
      type: "SET_METADATA";
      field: MetadataField;
      value: string;
    }
  | {
      type: "UPDATE_ITEM_TEXT";
      itemId: string;
      field: TextItemField;
      value: string;
    }
  | {
      type: "UPDATE_ITEM_MACRO";
      itemId: string;
      field: MacroField;
      value: string;
    }
  | {
      type: "UPDATE_ITEM_GRAMS";
      itemId: string;
      value: string;
    }
  | {
      type: "ADD_ITEM";
    }
  | {
      type: "REMOVE_ITEM";
      itemId: string;
    };

function parseNumberInput(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundMacro(parsed) : 0;
}

function parseOptionalNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return roundMacro(parsed);
}

function updateItem<T extends EditableMealItem>(
  items: T[],
  itemId: string,
  updater: (item: T) => T
): T[] {
  return items.map((item) => (item.id === itemId ? updater(item) : item));
}

export function mealDraftReducer(state: MealDraftState, action: MealDraftAction): MealDraftState {
  switch (action.type) {
    case "RESET_FROM_ANALYSIS":
      return buildMealDraftFromAnalysis(action.result, action.imageUrl);
    case "SET_METADATA":
      if (action.field === "mealType") {
        return {
          ...state,
          mealType: action.value as MealType | "",
        };
      }
      return {
        ...state,
        [action.field]: action.value,
      };
    case "UPDATE_ITEM_TEXT": {
      const items = updateItem(state.items, action.itemId, (item) => ({
        ...item,
        [action.field]: action.value,
      }));
      return {
        ...state,
        items,
        totals: calculateTotals(items),
      };
    }
    case "UPDATE_ITEM_MACRO": {
      const numericValue = Math.max(0, parseNumberInput(action.value));
      const items = updateItem(state.items, action.itemId, (item) => ({
        ...item,
        [action.field]: numericValue,
      }));
      return {
        ...state,
        items,
        totals: calculateTotals(items),
      };
    }
    case "UPDATE_ITEM_GRAMS": {
      const items = updateItem(state.items, action.itemId, (item) => {
        const nextGrams = parseOptionalNumberInput(action.value);
        if (nextGrams === null) {
          return {
            ...item,
            estimated_grams: null,
          };
        }

        if (item.estimated_grams && item.estimated_grams > 0 && nextGrams > 0) {
          const ratio = nextGrams / item.estimated_grams;
          return {
            ...item,
            estimated_grams: nextGrams,
            calories: roundMacro(item.calories * ratio),
            protein_g: roundMacro(item.protein_g * ratio),
            carbs_g: roundMacro(item.carbs_g * ratio),
            fat_g: roundMacro(item.fat_g * ratio),
          };
        }

        return {
          ...item,
          estimated_grams: nextGrams,
        };
      });
      return {
        ...state,
        items,
        totals: calculateTotals(items),
      };
    }
    case "ADD_ITEM": {
      const items = [...state.items, createManualItem()];
      return {
        ...state,
        items,
        totals: calculateTotals(items),
      };
    }
    case "REMOVE_ITEM": {
      const items = state.items.filter((item) => item.id !== action.itemId);
      return {
        ...state,
        items,
        totals: calculateTotals(items),
      };
    }
    default:
      return state;
  }
}

export function validateMealDraft(state: MealDraftState): MealDraftValidation {
  const formErrors: string[] = [];
  const itemErrors: Record<string, string[]> = {};

  if (!state.mealType) {
    formErrors.push("Please select a meal type.");
  }

  if (state.items.length === 0) {
    formErrors.push("At least one food item is required.");
  }

  for (const item of state.items) {
    const errors: string[] = [];

    if (!item.name.trim()) {
      errors.push("Food name is required.");
    }

    if (item.estimated_grams !== null && item.estimated_grams <= 0) {
      errors.push("Estimated grams must be greater than 0 when provided.");
    }

    if (item.calories < 0) {
      errors.push("Calories cannot be negative.");
    }
    if (item.protein_g < 0) {
      errors.push("Protein cannot be negative.");
    }
    if (item.carbs_g < 0) {
      errors.push("Carbs cannot be negative.");
    }
    if (item.fat_g < 0) {
      errors.push("Fat cannot be negative.");
    }

    if (errors.length > 0) {
      itemErrors[item.id] = errors;
    }
  }

  const isValid = formErrors.length === 0 && Object.keys(itemErrors).length === 0;

  return {
    formErrors,
    itemErrors,
    isValid,
  };
}

function toIsoDateTime(localDateTime: string): string {
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

export function buildConfirmedMeal(state: MealDraftState): ConfirmedMeal {
  const fallbackMealName = deriveMealName(state.items) || "Untitled meal";
  const cleanedMealName = state.mealName.trim() || fallbackMealName;
  const cleanedNotes = state.notes.trim();

  const items = state.items.map((item) => ({
    name: item.name.trim(),
    quantity_estimate: item.quantity_estimate.trim() || null,
    estimated_grams: item.estimated_grams,
    calories: roundMacro(item.calories),
    protein_g: roundMacro(item.protein_g),
    carbs_g: roundMacro(item.carbs_g),
    fat_g: roundMacro(item.fat_g),
    confidence: clampConfidence(item.confidence),
    source: item.source,
  }));

  return {
    meal_name: cleanedMealName,
    meal_type: (state.mealType || "lunch") as MealType,
    eaten_at: toIsoDateTime(state.eatenAt),
    notes: cleanedNotes,
    items,
    total: calculateTotals(state.items),
  };
}
