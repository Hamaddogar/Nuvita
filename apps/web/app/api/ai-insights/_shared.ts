export const BACKEND_REQUEST_TIMEOUT_MS = 8_000;

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

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function addDaysToDateISO(dateIso: string, days: number): string {
  const [yearText, monthText, dayText] = dateIso.split("-");
  const baseDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return `${baseDate.getUTCFullYear()}-${pad2(baseDate.getUTCMonth() + 1)}-${pad2(baseDate.getUTCDate())}`;
}

export function getDateTimePartsForTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const resolved: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      resolved[part.type] = part.value;
    }
  }

  return {
    year: resolved.year || "1970",
    month: resolved.month || "01",
    day: resolved.day || "01",
    hour: resolved.hour || "00",
    minute: resolved.minute || "00",
    second: resolved.second || "00",
  };
}

export function getDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = getDateTimePartsForTimeZone(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getHourInTimeZone(date: Date, timeZone: string): number {
  const parts = getDateTimePartsForTimeZone(date, timeZone);
  return Number(parts.hour);
}

function getTimeZoneOffsetMs(atInstant: Date, timeZone: string): number {
  const parts = getDateTimePartsForTimeZone(atInstant, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - atInstant.getTime();
}

export function startOfDateInTimeZone(dateIso: string, timeZone: string): Date {
  const [yearText, monthText, dayText] = dateIso.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const firstOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const firstPass = new Date(utcGuess.getTime() - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(firstPass, timeZone);

  if (secondOffset === firstOffset) {
    return firstPass;
  }

  return new Date(utcGuess.getTime() - secondOffset);
}

export function parseTimezoneInput(timeZoneValue: string | null): string {
  const normalized = (timeZoneValue || "UTC").trim() || "UTC";
  if (normalized.toUpperCase() === "UTC") {
    return "UTC";
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized });
    return normalized;
  } catch {
    return "UTC";
  }
}

export function parseDateInput(dateValue: string | null, timeZone: string): string {
  if (!dateValue) {
    const parts = getDateTimePartsForTimeZone(new Date(), timeZone);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  const normalized = dateValue.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("date must be in YYYY-MM-DD format.");
  }
  return normalized;
}

export function tryParseJson(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { detail: raw || "Unexpected backend response." };
  }
}

export async function fetchBackendInsights({
  backendBaseUrl,
  endpointPath,
  suffix,
  accessToken,
  timeoutMs = BACKEND_REQUEST_TIMEOUT_MS,
}: {
  backendBaseUrl: string;
  endpointPath: string;
  suffix: string;
  accessToken: string;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${backendBaseUrl}${endpointPath}${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
