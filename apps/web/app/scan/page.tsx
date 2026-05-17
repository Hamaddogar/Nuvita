"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useReducer, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { AnalysisLoadingCard } from "./_components/analysis-loading-card";
import { MealConfirmationScreen } from "./_components/meal-confirmation-screen";
import { SaveSuccessCard } from "./_components/save-success-card";
import { ScanInputCard } from "./_components/scan-input-card";
import { analyzeMealImage } from "./analyze-image-client";
import type { ConfirmedMeal } from "./meal-confirmation-types";
import { initialScanState, scanReducer } from "./scan-state";
import { useSaveMeal } from "./use-save-meal";

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

const statusLabel: Record<(typeof initialScanState)["status"], string> = {
  idle: "Ready",
  image_selected: "Image selected",
  analyzing: "Analyzing",
  confirming: "Reviewing",
  confirmed: "Confirmed",
  error: "Needs attention",
};

export default function ScanPage() {
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { saveState, saveConfirmedMeal, resetSaveState } = useSaveMeal();

  useEffect(() => {
    if (!state.selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(state.selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [state.selectedFile]);

  const isConfirmationStep = Boolean(state.result) && ["confirming", "confirmed"].includes(state.status);
  const saveSucceeded = saveState.status === "success" && Boolean(saveState.data);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        dispatch({
          type: "SET_ERROR",
          message: "Please choose a valid image file.",
        });
        return;
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        dispatch({
          type: "SET_ERROR",
          message: "Image is too large. Maximum allowed size is 8MB.",
        });
        return;
      }

      resetSaveState();
      dispatch({ type: "SELECT_IMAGE", file });
    },
    [resetSaveState]
  );

  const handleAnalyze = useCallback(async () => {
    if (!state.selectedFile) {
      dispatch({
        type: "SET_ERROR",
        message: "Please take or upload a meal photo before analyzing.",
      });
      return;
    }

    resetSaveState();
    dispatch({ type: "START_ANALYSIS" });
    try {
      const result = await analyzeMealImage({
        file: state.selectedFile,
        portionHint: state.portionHint,
      });
      dispatch({ type: "ANALYSIS_SUCCESS", result });
    } catch (error) {
      dispatch({
        type: "ANALYSIS_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unexpected error while analyzing your meal. Please retry.",
      });
    }
  }, [resetSaveState, state.portionHint, state.selectedFile]);

  const handleConfirmMeal = useCallback(
    async (meal: ConfirmedMeal) => {
      const saved = await saveConfirmedMeal(meal);
      if (!saved) {
        return;
      }
      dispatch({ type: "MEAL_CONFIRMED" });
    },
    [saveConfirmedMeal]
  );

  const handleScanAnother = useCallback(() => {
    resetSaveState();
    dispatch({ type: "REMOVE_IMAGE" });
  }, [resetSaveState]);

  return (
    <PageShell
      title="Scan Meal"
      description="Capture your meal with camera or gallery and get AI-powered nutrition analysis in seconds."
    >
      <div className="space-y-4">
        <div className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
          Status: {statusLabel[state.status]}
        </div>

        {!isConfirmationStep ? (
          <>
            <ScanInputCard
              status={state.status}
              selectedFile={state.selectedFile}
              previewUrl={previewUrl}
              portionHint={state.portionHint}
              onSelectFile={handleFileSelect}
              onRemoveImage={() => {
                resetSaveState();
                dispatch({ type: "REMOVE_IMAGE" });
              }}
              onPortionHintChange={(value) => dispatch({ type: "SET_PORTION_HINT", value })}
              onAnalyze={handleAnalyze}
            />

            {state.status === "analyzing" ? <AnalysisLoadingCard /> : null}
          </>
        ) : (
          <>
            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Meal confirmation</h2>
                  <p className="text-xs text-muted-foreground">
                    Review and edit AI analysis before final confirmation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleScanAnother}
                  className="rounded-lg border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  Scan another photo
                </button>
              </div>
            </section>

            {saveSucceeded && saveState.data ? (
              <SaveSuccessCard savedMeal={saveState.data} onLogAnotherMeal={handleScanAnother} />
            ) : state.result ? (
              <MealConfirmationScreen
                analysisResult={state.result}
                imageUrl={previewUrl}
                saveStatus={saveState.status}
                saveError={saveState.status === "error" ? saveState.error : null}
                onConfirmMeal={handleConfirmMeal}
              />
            ) : null}
          </>
        )}

        {state.error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium">{state.error}</p>
                {state.selectedFile && state.status !== "analyzing" && !isConfirmationStep ? (
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: "CLEAR_ERROR" });
                      void handleAnalyze();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-300/70 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/20"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}