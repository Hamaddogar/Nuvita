"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { AnalysisLoadingCard } from "./_components/analysis-loading-card";
import { BarcodeScannerPanel } from "./_components/barcode-scanner-panel";
import { FoodSearchPanel } from "./_components/food-search-panel";
import { MealConfirmationScreen } from "./_components/meal-confirmation-screen";
import { SaveSuccessCard } from "./_components/save-success-card";
import { ScanModeSwitcher, type ScanMode } from "./_components/scan-mode-switcher";
import { ScanInputCard } from "./_components/scan-input-card";
import { analyzeMealImage } from "./analyze-image-client";
import {
  fetchFavoriteFoods,
  fetchRecentFoods,
  lookupFoodByBarcode,
  saveFavoriteFood,
  searchFoods,
} from "./food-catalog-client";
import { foodCatalogReducer, initialFoodCatalogState } from "./food-catalog-state";
import type { FoodCatalogItem } from "./food-catalog-types";
import { buildAnalysisFromFood, buildFavoritePayload } from "./food-catalog-utils";
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
  const [catalogState, catalogDispatch] = useReducer(foodCatalogReducer, initialFoodCatalogState);
  const [scanMode, setScanMode] = useState<ScanMode>("photo");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [favoritePendingId, setFavoritePendingId] = useState<string | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
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
  useEffect(() => {
    let isMounted = true;

    const loadQuickFoods = async () => {
      catalogDispatch({ type: "RECENTS_REQUEST" });
      catalogDispatch({ type: "FAVORITES_REQUEST" });

      try {
        const [recentResponse, favoriteResponse] = await Promise.all([
          fetchRecentFoods(8),
          fetchFavoriteFoods(8),
        ]);

        if (!isMounted) {
          return;
        }

        catalogDispatch({
          type: "RECENTS_SUCCESS",
          foods: recentResponse.foods,
        });
        catalogDispatch({
          type: "FAVORITES_SUCCESS",
          foods: favoriteResponse.foods,
        });
      } catch {
        if (!isMounted) {
          return;
        }
        catalogDispatch({ type: "RECENTS_ERROR" });
        catalogDispatch({ type: "FAVORITES_ERROR" });
      }
    };

    void loadQuickFoods();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const query = catalogState.searchQuery.trim();
    if (query.length < 2) {
      catalogDispatch({ type: "SEARCH_RESET" });
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      catalogDispatch({ type: "SEARCH_REQUEST" });
      try {
        const response = await searchFoods({
          query,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }
        catalogDispatch({ type: "SEARCH_SUCCESS", foods: response.foods });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        catalogDispatch({
          type: "SEARCH_ERROR",
          message: error instanceof Error ? error.message : "Search failed. Please try again.",
        });
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [catalogState.searchQuery]);

  const isConfirmationStep = Boolean(state.result) && ["confirming", "confirmed"].includes(state.status);
  const saveSucceeded = saveState.status === "success" && Boolean(saveState.data);
  const confirmationImageUrl = state.selectedFile ? previewUrl : resultImageUrl;

  const favoriteKeys = useMemo(
    () =>
      new Set(
        catalogState.favoriteFoods.map(
          (food) => `${food.name.trim().toLowerCase()}|${food.brand?.trim().toLowerCase() ?? ""}`
        )
      ),
    [catalogState.favoriteFoods]
  );

  const isFavorite = useCallback(
    (food: FoodCatalogItem) =>
      favoriteKeys.has(`${food.name.trim().toLowerCase()}|${food.brand?.trim().toLowerCase() ?? ""}`),
    [favoriteKeys]
  );

  const handleQuickAddFood = useCallback(
    (food: FoodCatalogItem) => {
      resetSaveState();
      setCatalogNotice(null);
      setResultImageUrl(food.image_url ?? null);
      dispatch({
        type: "LOAD_RESULT",
        result: buildAnalysisFromFood(food),
      });
    },
    [resetSaveState]
  );

  const handleSaveFavorite = useCallback(
    async (food: FoodCatalogItem) => {
      setCatalogNotice(null);
      setFavoritePendingId(food.id);
      try {
        const response = await saveFavoriteFood(buildFavoritePayload(food));
        catalogDispatch({
          type: "UPSERT_FAVORITE",
          food: response.food,
        });
        setCatalogNotice({
          type: "success",
          message: `${food.name} added to favorites.`,
        });
      } catch (error) {
        setCatalogNotice({
          type: "error",
          message: error instanceof Error ? error.message : "Unable to save favorite food.",
        });
      } finally {
        setFavoritePendingId(null);
      }
    },
    []
  );

  const handleLookupBarcode = useCallback(async (barcode: string) => {
    const normalizedBarcode = barcode.replace(/\D/g, "");
    if (!/^\d{8,14}$/.test(normalizedBarcode)) {
      catalogDispatch({
        type: "BARCODE_ERROR",
        message: "Enter a valid 8-14 digit barcode.",
      });
      return;
    }

    setCatalogNotice(null);
    catalogDispatch({
      type: "BARCODE_REQUEST",
      barcode: normalizedBarcode,
    });

    try {
      const response = await lookupFoodByBarcode({ barcode: normalizedBarcode });
      catalogDispatch({
        type: "BARCODE_SUCCESS",
        food: response.food,
      });
    } catch (error) {
      catalogDispatch({
        type: "BARCODE_ERROR",
        message: error instanceof Error ? error.message : "Barcode lookup failed. Try again.",
      });
    }
  }, []);

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
      setResultImageUrl(null);
      setCatalogNotice(null);
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
    setResultImageUrl(null);
    setCatalogNotice(null);
    dispatch({ type: "RESET_FLOW" });
  }, [resetSaveState]);

  return (
    <PageShell
      title="Scan Meal"
      description="Capture, scan barcode, or search food and confirm nutrition in one seamless flow."
    >
      <div className="space-y-4">
        <section className="space-y-3">
          <div className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
            Status: {statusLabel[state.status]}
          </div>
          {!isConfirmationStep ? (
            <ScanModeSwitcher
              mode={scanMode}
              onChange={(mode) => {
                setScanMode(mode);
                setCatalogNotice(null);
              }}
              disabled={state.status === "analyzing"}
            />
          ) : null}
        </section>

        {!isConfirmationStep ? (
          <>
            {scanMode === "photo" ? (
              <>
                <ScanInputCard
                  status={state.status}
                  selectedFile={state.selectedFile}
                  previewUrl={previewUrl}
                  portionHint={state.portionHint}
                  onSelectFile={handleFileSelect}
                  onRemoveImage={() => {
                    resetSaveState();
                    setResultImageUrl(null);
                    dispatch({ type: "REMOVE_IMAGE" });
                  }}
                  onPortionHintChange={(value) => dispatch({ type: "SET_PORTION_HINT", value })}
                  onAnalyze={handleAnalyze}
                />
                {state.status === "analyzing" ? <AnalysisLoadingCard /> : null}
              </>
            ) : null}

            {scanMode === "barcode" ? (
              <BarcodeScannerPanel
                barcodeInput={catalogState.barcodeInput}
                lookupStatus={catalogState.barcodeStatus}
                lookupError={catalogState.barcodeError}
                lookupFood={catalogState.barcodeResult}
                favoritePendingId={favoritePendingId}
                onBarcodeInputChange={(value) =>
                  catalogDispatch({
                    type: "SET_BARCODE_INPUT",
                    barcode: value,
                  })
                }
                onLookupBarcode={(barcode) => {
                  void handleLookupBarcode(barcode);
                }}
                onQuickAdd={handleQuickAddFood}
                onSaveFavorite={(food) => {
                  void handleSaveFavorite(food);
                }}
                isFavorite={isFavorite}
                onSetScanningState={() => catalogDispatch({ type: "BARCODE_SCANNING" })}
              />
            ) : null}

            {scanMode === "search" ? (
              <FoodSearchPanel
                query={catalogState.searchQuery}
                searchStatus={catalogState.searchStatus}
                searchError={catalogState.searchError}
                searchResults={catalogState.searchResults}
                favoriteFoods={catalogState.favoriteFoods}
                favoritesStatus={catalogState.favoritesStatus}
                recentFoods={catalogState.recentFoods}
                recentsStatus={catalogState.recentStatus}
                favoritePendingId={favoritePendingId}
                onQueryChange={(query) => {
                  catalogDispatch({ type: "SET_SEARCH_QUERY", query });
                }}
                onQuickAdd={handleQuickAddFood}
                onSaveFavorite={(food) => {
                  void handleSaveFavorite(food);
                }}
                isFavorite={isFavorite}
              />
            ) : null}
          </>
        ) : (
          <>
            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Meal confirmation</h2>
                  <p className="text-xs text-muted-foreground">
                    Review and edit detected nutrition before final confirmation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleScanAnother}
                  className="rounded-lg border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  Log another food
                </button>
              </div>
            </section>

            {saveSucceeded && saveState.data ? (
              <SaveSuccessCard savedMeal={saveState.data} onLogAnotherMeal={handleScanAnother} />
            ) : state.result ? (
              <MealConfirmationScreen
                analysisResult={state.result}
                imageUrl={confirmationImageUrl}
                saveStatus={saveState.status}
                saveError={saveState.status === "error" ? saveState.error : null}
                onConfirmMeal={handleConfirmMeal}
              />
            ) : null}
          </>
        )}

        {catalogNotice ? (
          <section
            className={
              catalogNotice.type === "success"
                ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300"
                : "rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
            }
          >
            {catalogNotice.message}
          </section>
        ) : null}

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