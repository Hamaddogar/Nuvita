"use client";

import { useCallback, useState } from "react";
import type { ConfirmedMeal } from "./meal-confirmation-types";
import { saveMeal, type MealSaveResponse } from "./save-meal-client";

export type SaveMealStatus = "idle" | "validating" | "saving" | "success" | "error";

type SaveMealState = {
  status: SaveMealStatus;
  error: string | null;
  data: MealSaveResponse | null;
};

const initialState: SaveMealState = {
  status: "idle",
  error: null,
  data: null,
};

function validateConfirmedMealPayload(meal: ConfirmedMeal): string | null {
  if (!meal.meal_type) {
    return "Meal type is required.";
  }

  if (!meal.items.length) {
    return "At least one food item is required to save.";
  }

  for (const item of meal.items) {
    if (!item.name.trim()) {
      return "Each food item must have a name.";
    }
    if (item.estimated_grams !== null && item.estimated_grams <= 0) {
      return "Estimated grams must be greater than 0 when provided.";
    }
    if (item.calories < 0 || item.protein_g < 0 || item.carbs_g < 0 || item.fat_g < 0) {
      return "Nutrition values cannot be negative.";
    }
  }

  return null;
}

export function useSaveMeal() {
  const [state, setState] = useState<SaveMealState>(initialState);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const saveConfirmedMeal = useCallback(async (meal: ConfirmedMeal): Promise<MealSaveResponse | null> => {
    setState({
      status: "validating",
      error: null,
      data: null,
    });

    const validationError = validateConfirmedMealPayload(meal);
    if (validationError) {
      setState({
        status: "error",
        error: validationError,
        data: null,
      });
      return null;
    }

    setState({
      status: "saving",
      error: null,
      data: null,
    });

    try {
      const response = await saveMeal(meal);
      setState({
        status: "success",
        error: null,
        data: response,
      });
      return response;
    } catch (error) {
      setState({
        status: "error",
        error: error instanceof Error ? error.message : "Unexpected save error. Please retry.",
        data: null,
      });
      return null;
    }
  }, []);

  return {
    saveState: state,
    saveConfirmedMeal,
    resetSaveState: reset,
  };
}
