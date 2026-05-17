"use client";

import { Loader2 } from "lucide-react";
import type { SaveMealStatus } from "../use-save-meal";

type ConfirmMealButtonProps = {
  status: SaveMealStatus;
  disabled?: boolean;
  onConfirm: () => void;
};

function getButtonLabel(status: SaveMealStatus): string {
  if (status === "validating") {
    return "Validating meal...";
  }
  if (status === "saving") {
    return "Saving meal...";
  }
  if (status === "success") {
    return "Meal saved";
  }
  return "Confirm Meal";
}

export function ConfirmMealButton({ status, disabled = false, onConfirm }: ConfirmMealButtonProps) {
  const isBusy = status === "validating" || status === "saving";

  return (
    <div className="sticky bottom-0 z-20 -mx-5 border-t bg-card/95 px-5 py-3 backdrop-blur">
      <button
        type="button"
        disabled={disabled || isBusy}
        onClick={onConfirm}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {getButtonLabel(status)}
      </button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Confirmed meal will be prepared for save in Step 4.
      </p>
    </div>
  );
}