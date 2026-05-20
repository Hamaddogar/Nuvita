export const BACKEND_TIMEOUT_MS = 6_000;

export function getBackendBaseUrl() {
  const configured =
    process.env.FASTAPI_URL || process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";
  return configured.replace(/\/+$/, "");
}

export function getCandidateBackendBaseUrls() {
  const primary = getBackendBaseUrl();
  const candidates = [primary];
  const explicitFallback = (process.env.FASTAPI_FALLBACK_URL || "").trim();

  if (explicitFallback) {
    candidates.push(explicitFallback.replace(/\/+$/, ""));
  }
  if (primary.includes("localhost:8000")) {
    candidates.push("http://localhost:8010");
  }

  return Array.from(new Set(candidates));
}

export function tryParseJson(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { detail: raw || "Unexpected backend response." };
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = BACKEND_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
