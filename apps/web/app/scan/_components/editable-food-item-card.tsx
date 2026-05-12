"use client";

import { Trash2 } from "lucide-react";
import type { EditableMealItem } from "../meal-confirmation-types";

type EditableFoodItemCardProps = {
  item: EditableMealItem;
  index: number;
  errors?: string[];
  onUpdateText: (itemId: string, field: "name" | "quantity_estimate", value: string) => void;
  onUpdateMacro: (
    itemId: string,
    field: "calories" | "protein_g" | "carbs_g" | "fat_g",
    value: string
  ) => void;
  onUpdateGrams: (itemId: string, value: string) => void;
  onRemove: (itemId: string) => void;
};

export function EditableFoodItemCard({
  item,
  index,
  errors,
  onUpdateText,
  onUpdateMacro,
  onUpdateGrams,
  onRemove,
}: EditableFoodItemCardProps) {
  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Food item {index + 1}</h3>
          <p className="text-xs text-muted-foreground">
            Source: {item.source.replace("_", " ")} • Confidence {Math.round(item.confidence * 100)}%
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Food name</span>
          <input
            type="text"
            value={item.name}
            onChange={(event) => onUpdateText(item.id, "name", event.target.value)}
            placeholder="e.g. Grilled chicken"
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Portion / serving</span>
          <input
            type="text"
            value={item.quantity_estimate}
            onChange={(event) => onUpdateText(item.id, "quantity_estimate", event.target.value)}
            placeholder="e.g. 1 plate"
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Grams</span>
          <input
            type="number"
            min="0"
            step="1"
            value={item.estimated_grams ?? ""}
            onChange={(event) => onUpdateGrams(item.id, event.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Calories</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={item.calories}
            onChange={(event) => onUpdateMacro(item.id, "calories", event.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Protein (g)</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={item.protein_g}
            onChange={(event) => onUpdateMacro(item.id, "protein_g", event.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Carbs (g)</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={item.carbs_g}
            onChange={(event) => onUpdateMacro(item.id, "carbs_g", event.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Fat (g)</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={item.fat_g}
            onChange={(event) => onUpdateMacro(item.id, "fat_g", event.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      {errors && errors.length > 0 ? (
        <ul className="list-inside list-disc space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          {errors.map((error, errorIndex) => (
            <li key={`${item.id}-error-${errorIndex}`}>{error}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
