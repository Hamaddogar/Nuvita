import type { AnalyzeImageResponse } from "./types";
import { mapApiError } from "@/lib/user-facing-errors";
import { optimizeImageForUpload } from "./image-optimizer";

const DEFAULT_TIMEOUT_MS = 45_000;

type AnalyzeMealImageParams = {
  file: File;
  portionHint?: string;
  timeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFastApiDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => {
        if (!isRecord(entry)) {
          return null;
        }

        const message = entry.msg;
        const location = entry.loc;
        if (typeof message !== "string" || !message.trim()) {
          return null;
        }

        if (Array.isArray(location)) {
          const formattedLocation = location
            .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
            .join(".");
          if (formattedLocation) {
            return `${formattedLocation}: ${message}`;
          }
        }

        return message;
      })
      .filter((value): value is string => Boolean(value));

    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  return null;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (!("detail" in payload)) {
    return null;
  }

  return parseFastApiDetail(payload.detail);
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { detail: raw };
  }
}

function isAnalyzeImageResponse(payload: unknown): payload is AnalyzeImageResponse {
  if (!isRecord(payload)) {
    return false;
  }

  const { success, detected_foods, total, notes } = payload;

  if (typeof success !== "boolean" || !Array.isArray(detected_foods) || !Array.isArray(notes)) {
    return false;
  }

  if (!isRecord(total)) {
    return false;
  }

  return (
    typeof total.calories === "number" &&
    typeof total.protein_g === "number" &&
    typeof total.carbs_g === "number" &&
    typeof total.fat_g === "number"
  );
}

export async function analyzeMealImage({
  file,
  portionHint,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: AnalyzeMealImageParams): Promise<AnalyzeImageResponse> {
  const optimizedFile = await optimizeImageForUpload(file);
  const formData = new FormData();
  formData.append("image", optimizedFile, optimizedFile.name);

  const cleanedPortionHint = portionHint?.trim();
  if (cleanedPortionHint) {
    formData.append("user_portion_description", cleanedPortionHint);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/analyze-image", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    const rawPayload = await response.text();
    const payload = rawPayload ? safeJsonParse(rawPayload) : null;

    if (!response.ok) {
      const detail = extractErrorMessage(payload);
      if (detail) {
        throw new Error(mapApiError(detail, "We couldn't analyze this meal. Please try another photo."));
      }

      if (response.status === 400 || response.status === 422) {
        throw new Error("We couldn't analyze this meal. Please try another clear photo.");
      }

      if (response.status >= 500) {
        throw new Error("Analysis service is temporarily unavailable. Please try again.");
      }

      throw new Error("Failed to analyze your meal. Please try again.");
    }

    if (!payload) {
      throw new Error("Empty response from analysis service. Please retry.");
    }

    if (!isAnalyzeImageResponse(payload)) {
      throw new Error("Received an unexpected analysis response. Please retry.");
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Network timeout while analyzing your meal. Please try again.");
    }

    if (error instanceof Error) {
      throw new Error(mapApiError(error.message, "We couldn't analyze this meal. Please try again."));
    }

    throw new Error("Unexpected error while analyzing your meal. Please retry.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}
