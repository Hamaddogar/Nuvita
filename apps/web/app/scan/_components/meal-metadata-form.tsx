"use client";

import { MEAL_TYPE_OPTIONS } from "../meal-confirmation-types";

type MealMetadataFormProps = {
  mealName: string;
  mealType: string;
  eatenAt: string;
  notes: string;
  onFieldChange: (field: "mealName" | "mealType" | "eatenAt" | "notes", value: string) => void;
};

export function MealMetadataForm({
  mealName,
  mealType,
  eatenAt,
  notes,
  onFieldChange,
}: MealMetadataFormProps) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold">Meal details</h2>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Meal name</span>
        <input
          type="text"
          value={mealName}
          onChange={(event) => onFieldChange("mealName", event.target.value)}
          placeholder="e.g. Chicken rice bowl"
          className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Meal type</span>
          <select
            value={mealType}
            onChange={(event) => onFieldChange("mealType", event.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          >
            <option value="">Select meal type</option>
            {MEAL_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Eaten at</span>
          <input
            type="datetime-local"
            value={eatenAt}
            onChange={(event) => onFieldChange("eatenAt", event.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(event) => onFieldChange("notes", event.target.value)}
          rows={3}
          placeholder="Any context: restaurant meal, extra oil, dressing on side..."
          className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
        />
      </label>
    </section>
  );
}
