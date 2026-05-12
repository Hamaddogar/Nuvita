"use client";

type ConfirmMealButtonProps = {
  disabled?: boolean;
  onConfirm: () => void;
};

export function ConfirmMealButton({ disabled = false, onConfirm }: ConfirmMealButtonProps) {
  return (
    <div className="sticky bottom-0 z-20 -mx-5 border-t bg-card/95 px-5 py-3 backdrop-blur">
      <button
        type="button"
        disabled={disabled}
        onClick={onConfirm}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        Confirm Meal
      </button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Confirmed meal will be prepared for save in Step 4.
      </p>
    </div>
  );
}
