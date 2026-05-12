"use client";

import { useState } from "react";
import { PageShell } from "@/components/page-shell";

type DetectedFood = {
  name: string;
  quantity_estimate: string | null;
  estimated_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  usda_match?: {
    fdc_id: string | number;
    description: string;
  } | null;
};

type AnalyzeImageResponse = {
  success: boolean;
  detected_foods: DetectedFood[];
  total: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  notes: string[];
};

export default function ScanPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [portionHint, setPortionHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeImageResponse | null>(null);

  const handleAnalyze = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!selectedFile) {
      setError("Please choose a food image first.");
      return;
    }

    const formData = new FormData();
    formData.append("image", selectedFile);
    if (portionHint.trim()) {
      formData.append("user_portion_description", portionHint.trim());
    }

    setLoading(true);
    try {
      const response = await fetch("/api/analyze-image", {
        method: "POST",
        body: formData,
      });

      const responseBody = (await response.json().catch(() => null)) as
        | AnalyzeImageResponse
        | { detail?: string }
        | null;

      if (!response.ok) {
        const detail =
          responseBody && typeof responseBody === "object" && "detail" in responseBody
            ? responseBody.detail
            : null;
        setError(detail || "Failed to analyze image. Please try again.");
        return;
      }

      setResult(responseBody as AnalyzeImageResponse);
    } catch {
      setError("Network error while analyzing image. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title="Scan Meal"
      description="Upload a meal photo to analyze food items and estimated macros."
    >
      <form className="space-y-4" onSubmit={handleAnalyze}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Meal image</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Portion note (optional)</span>
          <input
            type="text"
            value={portionHint}
            onChange={(event) => setPortionHint(event.target.value)}
            placeholder="e.g. one full plate"
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Analyzing..." : "Analyze Meal"}
        </button>
      </form>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {result ? (
        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border p-4">
            <h2 className="text-sm font-semibold">Total (estimated)</h2>
            <p className="mt-2 text-sm">Calories: {result.total.calories}</p>
            <p className="text-sm">Protein: {result.total.protein_g}g</p>
            <p className="text-sm">Carbs: {result.total.carbs_g}g</p>
            <p className="text-sm">Fat: {result.total.fat_g}g</p>
          </div>

          <div className="space-y-3">
            {result.detected_foods.map((food, index) => (
              <article key={`${food.name}-${index}`} className="rounded-2xl border p-4">
                <h3 className="text-sm font-semibold">{food.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Portion: {food.quantity_estimate || "Not specified"} | Grams:{" "}
                  {food.estimated_grams ?? "N/A"} | Confidence: {food.confidence}
                </p>
                <div className="mt-2 text-sm">
                  <p>Calories: {food.calories}</p>
                  <p>Protein: {food.protein_g}g</p>
                  <p>Carbs: {food.carbs_g}g</p>
                  <p>Fat: {food.fat_g}g</p>
                </div>
                {food.usda_match ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    USDA match: {food.usda_match.description} (FDC: {food.usda_match.fdc_id})
                  </p>
                ) : null}
              </article>
            ))}
          </div>

          {result.notes.length ? (
            <div className="rounded-2xl border p-4">
              <h2 className="text-sm font-semibold">Notes</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                {result.notes.map((note, index) => (
                  <li key={`${note}-${index}`}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </PageShell>
  );
}
