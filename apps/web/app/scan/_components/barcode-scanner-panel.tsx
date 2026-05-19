"use client";

import { Camera, Loader2, ScanLine, StopCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BarcodeLookupStatus } from "../food-catalog-state";
import type { FoodCatalogItem } from "../food-catalog-types";
import { FoodCatalogCard } from "./food-catalog-card";

type BarcodeScannerPanelProps = {
  barcodeInput: string;
  lookupStatus: BarcodeLookupStatus;
  lookupError: string | null;
  lookupFood: FoodCatalogItem | null;
  favoritePendingId: string | null;
  onBarcodeInputChange: (value: string) => void;
  onLookupBarcode: (barcode: string) => void;
  onQuickAdd: (food: FoodCatalogItem) => void;
  onSaveFavorite: (food: FoodCatalogItem) => void;
  isFavorite: (food: FoodCatalogItem) => boolean;
  onSetScanningState: () => void;
};

type ScannerStatus = "idle" | "starting" | "active" | "unsupported" | "error";

type MinimalReader = {
  reset: () => void;
};

type MinimalScannerControls = {
  stop: () => void;
};

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unable to access camera. Try manual barcode entry.";
  }
  if (error.name === "NotAllowedError") {
    return "Camera permission denied. Enable camera access or use manual barcode entry.";
  }
  if (error.name === "NotFoundError") {
    return "No camera device was found. Use manual barcode entry.";
  }
  if (error.name === "NotReadableError") {
    return "Camera is currently in use by another app.";
  }
  return "Unable to start scanner. Use manual barcode entry.";
}

function normalizeBarcode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 14);
}

export function BarcodeScannerPanel({
  barcodeInput,
  lookupStatus,
  lookupError,
  lookupFood,
  favoritePendingId,
  onBarcodeInputChange,
  onLookupBarcode,
  onQuickAdd,
  onSaveFavorite,
  isFavorite,
  onSetScanningState,
}: BarcodeScannerPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<MinimalReader | null>(null);
  const controlsRef = useRef<MinimalScannerControls | null>(null);
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>("idle");
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [lastDetectedBarcode, setLastDetectedBarcode] = useState<string | null>(null);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    readerRef.current?.reset();
    readerRef.current = null;
    setScannerStatus("idle");
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);

  const startScanner = useCallback(async () => {
    if (!videoRef.current) {
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setScannerStatus("unsupported");
      setScannerError("Camera scanning is not supported in this browser. Enter barcode manually.");
      return;
    }

    stopScanner();
    setScannerError(null);
    setScannerStatus("starting");

    try {
      const zxing = await import("@zxing/browser");
      const reader = new zxing.BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 180,
        delayBetweenScanSuccess: 600,
      });

      readerRef.current = reader as unknown as MinimalReader;

      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error) => {
          if (result) {
            const barcode = normalizeBarcode(result.getText());
            if (/^\d{8,14}$/.test(barcode)) {
              setLastDetectedBarcode(barcode);
              onBarcodeInputChange(barcode);
              onLookupBarcode(barcode);
              stopScanner();
            }
            return;
          }

          if (error && !["NotFoundException", "ChecksumException", "FormatException"].includes(error.name)) {
            setScannerStatus("error");
            setScannerError("Scanner had trouble reading this frame. Try moving closer or enter barcode manually.");
          }
        }
      );

      controlsRef.current = controls as unknown as MinimalScannerControls;
      setScannerStatus("active");
      onSetScanningState();
    } catch (error) {
      setScannerStatus("error");
      setScannerError(getErrorMessage(error));
    }
  }, [onBarcodeInputChange, onLookupBarcode, onSetScanningState, stopScanner]);

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Barcode scanner</h2>
        <p className="text-xs text-muted-foreground">
          Scan packaged foods instantly, or enter barcode digits manually if camera access is unavailable.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background">
        <div className="relative h-64 w-full">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-36 w-64 rounded-xl border-2 border-primary/90 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]" />
          </div>
          <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white">
            {scannerStatus === "active" ? "Align barcode inside frame" : "Camera preview"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={startScanner}
          disabled={scannerStatus === "starting" || scannerStatus === "active"}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {scannerStatus === "starting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {scannerStatus === "active" ? "Scanning..." : "Start camera"}
        </button>
        <button
          type="button"
          onClick={stopScanner}
          disabled={scannerStatus !== "active" && scannerStatus !== "error"}
          className="inline-flex items-center justify-center gap-1 rounded-lg border bg-background px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          <StopCircle className="h-3.5 w-3.5" />
          Stop
        </button>
      </div>

      {lastDetectedBarcode ? (
        <p className="rounded-xl border bg-background px-3 py-2 text-xs">
          Last scanned barcode: <span className="font-semibold">{lastDetectedBarcode}</span>
        </p>
      ) : null}

      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground">Manual barcode entry</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={barcodeInput}
            onChange={(event) => onBarcodeInputChange(normalizeBarcode(event.target.value))}
            placeholder="e.g. 8901234567890"
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => onLookupBarcode(barcodeInput)}
            disabled={lookupStatus === "loading" || !/^\d{8,14}$/.test(barcodeInput)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border bg-background px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {lookupStatus === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
            Lookup
          </button>
        </div>
      </div>

      {scannerError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          {scannerError}
        </div>
      ) : null}

      {lookupError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
          {lookupError}
        </div>
      ) : null}

      {lookupFood ? (
        <FoodCatalogCard
          food={lookupFood}
          onQuickAdd={onQuickAdd}
          onSaveFavorite={onSaveFavorite}
          favoritePending={favoritePendingId === lookupFood.id}
          isFavorite={isFavorite(lookupFood)}
        />
      ) : null}
    </section>
  );
}
