"use client";

import { AlertTriangle, PlusCircle } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useReducer, useState } from "react";
import {
  buildConfirmedMeal,
  buildMealDraftFromAnalysis,
  mealDraftReducer,
  validateMealDraft,
} from "../meal-confirmation-state";
import type { MealDraftValidation, ConfirmedMeal } from "../meal-confirmation-types";
import type { AnalyzeImageResponse } from "../types";
import { ConfirmMealButton } from "./confirm-meal-button";
import { EditableFoodItemCard } from "./editable-food-item-card";
import { MacroSummaryCard } from "./macro-summary-card";
import { MealMetadataForm } from "./meal-metadata-form";

const EMPTY_VALIDATION: MealDraftValidation = {
  formErrors: [],
  itemErrors: {},
  isValid: true,
};

type MealConfirmationScreenProps = {
  analysisResult: AnalyzeImageResponse;
  imageUrl: string | null;
  onConfirmMeal: (meal: ConfirmedMeal) => void;
};

export function MealConfirmationScreen({
  analysisResult,
  imageUrl,
  onConfirmMeal,
}: MealConfirmationScreenProps) {
  const [draft, dispatch] = useReducer(
    mealDraftReducer,
    { analysisResult, imageUrl },
    ({ analysisResult: result, imageUrl: url }) => buildMealDraftFromAnalysis(result, url)
  );
  const [validation, setValidation] = useState<MealDraftValidation>(EMPTY_VALIDATION);

  useEffect(() => {
    dispatch({
      type: "RESET_FROM_ANALYSIS",
      result: analysisResult,
      imageUrl,
    });
    setValidation(EMPTY_VALIDATION);
  }, [analysisResult, imageUrl]);

  const averageConfidence = useMemo(() => {
    if (draft.items.length === 0) {
      return 0;
    }
    const totalConfidence = draft.items.reduce((sum, item) => sum + item.confidence, 0);
    return totalConfidence / draft.items.length;
  }, [draft.items]);

  const resetValidation = () => {
    setValidation(EMPTY_VALIDATION);
  };

  const handleConfirmMeal = () => {
    const nextValidation = validateMealDraft(draft);
    setValidation(nextValidation);
    if (!nextValidation.isValid) {
      return;
    }

    const confirmedMeal = buildConfirmedMeal(draft);
    onConfirmMeal(confirmedMeal);
  };

  return (
    <section className="space-y-4 pb-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold">Review and confirm meal</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Verify each detected food, adjust portions/macros, and confirm before saving.
        </p>

        {draft.imageUrl ? (
          <div className="mt-3 overflow-hidden rounded-xl border bg-background">
            <div className="relative h-48 w-full sm:h-64">
              <Image
                src={draft.imageUrl}
                alt="Scanned meal"
                fill
                unoptimized
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-cover"
              />
            </div>
          </div>
        ) : null}
      </section>

      <MacroSummaryCard
        totals={draft.totals}
        itemCount={draft.items.length}
        averageConfidence={averageConfidence}
      />

      <MealMetadataForm
        mealName={draft.mealName}
        mealType={draft.mealType}
        eatenAt={draft.eatenAt}
        notes={draft.notes}
        onFieldChange={(field, value) => {
          resetValidation();
          dispatch({
            type: "SET_METADATA",
            field,
            value,
          });
        }}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Detected foods</h2>
          <button
            type="button"
            onClick={() => {
              resetValidation();
              dispatch({ type: "ADD_ITEM" });
            }}
            className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add food item
          </button>
        </div>

        {draft.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background p-4 text-center text-sm text-muted-foreground">
            No food items yet. Add one manually to continue.
          </div>
        ) : null}

        {draft.items.map((item, index) => (
          <EditableFoodItemCard
            key={item.id}
            item={item}
            index={index}
            errors={validation.itemErrors[item.id]}
            onUpdateText={(itemId, field, value) => {
              resetValidation();
              dispatch({ type: "UPDATE_ITEM_TEXT", itemId, field, value });
            }}
            onUpdateMacro={(itemId, field, value) => {
              resetValidation();
              dispatch({ type: "UPDATE_ITEM_MACRO", itemId, field, value });
            }}
            onUpdateGrams={(itemId, value) => {
              resetValidation();
              dispatch({ type: "UPDATE_ITEM_GRAMS", itemId, value });
            }}
            onRemove={(itemId) => {
              resetValidation();
              dispatch({ type: "REMOVE_ITEM", itemId });
            }}
          />
        ))}
      </section>

      {draft.warnings.length > 0 ? (
        <section className="rounded-2xl border bg-amber-50/70 p-4 text-amber-900 shadow-sm dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold">Review notes</h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                {draft.warnings.map((note, noteIndex) => (
                  <li key={`${note}-${noteIndex}`}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {validation.formErrors.length > 0 ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          <h3 className="text-sm font-semibold">Please fix the following before confirming:</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            {validation.formErrors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConfirmMealButton onConfirm={handleConfirmMeal} />
    </section>
  );
}
