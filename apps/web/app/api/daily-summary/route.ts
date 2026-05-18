import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
const BACKEND_REQUEST_TIMEOUT_MS = 6_000;
const SUPABASE_QUERY_TIMEOUT_MS = 6_000;

function getBackendBaseUrl() {
  const configured =
    process.env.FASTAPI_URL || process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";
  return configured.replace(/\/+$/, "");
}
function getCandidateBackendBaseUrls() {
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

async function fetchBackendDailySummary({
  backendBaseUrl,
  suffix,
  accessToken,
  timeoutMs = BACKEND_REQUEST_TIMEOUT_MS,
}: {
  backendBaseUrl: string;
  suffix: string;
  accessToken: string;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${backendBaseUrl}/daily-summary${suffix}`, {
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

function toNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value >= 0 ? value : 0;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculatePercent(consumed: number, goal: number): number {
  if (goal <= 0) {
    return 0;
  }
  return Math.round((consumed / goal) * 100);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function getDatePartsForTimeZone(date: Date, timeZone: string) {
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

function getCurrentDateIsoInTimeZone(timeZone: string): string {
  const parts = getDatePartsForTimeZone(new Date(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addOneDay(dateIso: string): string {
  const [yearText, monthText, dayText] = dateIso.split("-");
  const nextDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return `${nextDate.getUTCFullYear()}-${pad2(nextDate.getUTCMonth() + 1)}-${pad2(nextDate.getUTCDate())}`;
}

function getTimeZoneOffsetMs(atInstant: Date, timeZone: string): number {
  const parts = getDatePartsForTimeZone(atInstant, timeZone);
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

function startOfDateInTimeZone(dateIso: string, timeZone: string): Date {
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

function parseTimezoneInput(timeZoneValue: string | null): string {
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

function parseDateInput(dateValue: string | null, timeZone: string): string {
  if (!dateValue) {
    return getCurrentDateIsoInTimeZone(timeZone);
  }

  const normalized = dateValue.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("date must be in YYYY-MM-DD format.");
  }
  return normalized;
}


async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
async function buildSupabaseFallbackSummary({
  supabase,
  userId,
  date,
  timeZone,
}: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  date: string;
  timeZone: string;
}) {
  const startUtc = startOfDateInTimeZone(date, timeZone);
  const endUtc = startOfDateInTimeZone(addOneDay(date), timeZone);
  const [{ data: goal, error: goalError }, { data: meals, error: mealsError }] = await withTimeout(
    Promise.all([
      supabase
        .from("user_goals")
        .select("daily_calorie_target,protein_target_g,carbs_target_g,fat_target_g")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("meals")
        .select("id,meal_name,meal_type,eaten_at,total_calories,total_protein_g,total_carbs_g,total_fat_g")
        .eq("user_id", userId)
        .gte("eaten_at", startUtc.toISOString())
        .lt("eaten_at", endUtc.toISOString())
        .order("eaten_at", { ascending: false })
        .limit(200),
    ]),
    SUPABASE_QUERY_TIMEOUT_MS,
    "Supabase summary query timed out."
  );

  if (goalError) {
    throw new Error(goalError.message);
  }
  if (mealsError) {
    throw new Error(mealsError.message);
  }

  const mealRows = Array.isArray(meals) ? meals : [];
  const mealIds = mealRows
    .map((meal) => (typeof meal.id === "string" ? meal.id.trim() : ""))
    .filter((value): value is string => Boolean(value));

  const itemCountsByMealId = new Map<string, number>();
  if (mealIds.length > 0) {
    const mealItemsResult = await withTimeout(
      Promise.resolve(
        supabase
          .from("meal_items")
          .select("meal_id")
          .eq("user_id", userId)
          .in("meal_id", mealIds)
          .limit(2000)
      ),
      SUPABASE_QUERY_TIMEOUT_MS,
      "Supabase meal-item query timed out."
    );
    const { data: mealItems, error: mealItemsError } = mealItemsResult as {
      data: Array<{ meal_id: string | null }> | null;
      error: { message: string } | null;
    };

    if (mealItemsError) {
      throw new Error(mealItemsError.message);
    }

    for (const row of mealItems || []) {
      if (typeof row.meal_id !== "string" || !row.meal_id.trim()) {
        continue;
      }
      itemCountsByMealId.set(row.meal_id, (itemCountsByMealId.get(row.meal_id) || 0) + 1);
    }
  }

  const goals = {
    calories: roundToTwo(toNonNegativeNumber(goal?.daily_calorie_target)),
    protein_g: roundToTwo(toNonNegativeNumber(goal?.protein_target_g)),
    carbs_g: roundToTwo(toNonNegativeNumber(goal?.carbs_target_g)),
    fat_g: roundToTwo(toNonNegativeNumber(goal?.fat_target_g)),
  };

  const normalizedMeals = mealRows.map((meal) => {
    const mealId = typeof meal.id === "string" ? meal.id : "";
    return {
      id: mealId,
      meal_name: typeof meal.meal_name === "string" && meal.meal_name.trim() ? meal.meal_name : "Meal",
      meal_type: typeof meal.meal_type === "string" && meal.meal_type.trim() ? meal.meal_type : "unknown",
      eaten_at: typeof meal.eaten_at === "string" ? meal.eaten_at : new Date().toISOString(),
      total_calories: roundToTwo(toNonNegativeNumber(meal.total_calories)),
      total_protein_g: roundToTwo(toNonNegativeNumber(meal.total_protein_g)),
      total_carbs_g: roundToTwo(toNonNegativeNumber(meal.total_carbs_g)),
      total_fat_g: roundToTwo(toNonNegativeNumber(meal.total_fat_g)),
      item_count: itemCountsByMealId.get(mealId) || 0,
    };
  });

  const consumed = {
    calories: roundToTwo(normalizedMeals.reduce((sum, meal) => sum + meal.total_calories, 0)),
    protein_g: roundToTwo(normalizedMeals.reduce((sum, meal) => sum + meal.total_protein_g, 0)),
    carbs_g: roundToTwo(normalizedMeals.reduce((sum, meal) => sum + meal.total_carbs_g, 0)),
    fat_g: roundToTwo(normalizedMeals.reduce((sum, meal) => sum + meal.total_fat_g, 0)),
  };

  const remaining = {
    calories: roundToTwo(goals.calories - consumed.calories),
    protein_g: roundToTwo(goals.protein_g - consumed.protein_g),
    carbs_g: roundToTwo(goals.carbs_g - consumed.carbs_g),
    fat_g: roundToTwo(goals.fat_g - consumed.fat_g),
  };

  const progress = {
    calories_percent: calculatePercent(consumed.calories, goals.calories),
    protein_percent: calculatePercent(consumed.protein_g, goals.protein_g),
    carbs_percent: calculatePercent(consumed.carbs_g, goals.carbs_g),
    fat_percent: calculatePercent(consumed.fat_g, goals.fat_g),
  };

  return {
    success: true,
    date,
    goals,
    consumed,
    remaining,
    progress,
    meals: normalizedMeals,
  };
}

function tryParseJson(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { detail: raw || "Unexpected backend response." };
  }
}

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  const incomingUrl = new URL(request.url);
  let timezone: string;
  let date: string;
  try {
    timezone = parseTimezoneInput(incomingUrl.searchParams.get("timezone"));
    date = parseDateInput(incomingUrl.searchParams.get("date"), timezone);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Invalid date or timezone." },
      { status: 422 }
    );
  }
  const query = new URLSearchParams();

  if (date) {
    query.set("date", date);
  }
  if (timezone) {
    query.set("timezone", timezone);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";

  let upstreamResponse: Response | null = null;
  let sawBackend404 = false;

  for (const backendBaseUrl of getCandidateBackendBaseUrls()) {
    try {
      const candidateResponse = await fetchBackendDailySummary({
        backendBaseUrl,
        suffix,
        accessToken: session.access_token,
      });

      if (candidateResponse.status === 404) {
        sawBackend404 = true;
        continue;
      }
      if (candidateResponse.status >= 500) {
        continue;
      }

      upstreamResponse = candidateResponse;
      break;
    } catch {
      continue;
    }
  }

  if (!upstreamResponse) {
    try {
      const {
        data: { user },
      } = await withTimeout(
        supabase.auth.getUser(),
        SUPABASE_QUERY_TIMEOUT_MS,
        "Supabase user lookup timed out."
      );

      if (!user?.id) {
        return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
      }

      const fallbackSummary = await withTimeout(
        buildSupabaseFallbackSummary({
          supabase,
          userId: user.id,
          date,
          timeZone: timezone,
        }),
        SUPABASE_QUERY_TIMEOUT_MS * 2,
        "Supabase dashboard fallback timed out."
      );
      return NextResponse.json(fallbackSummary, { status: 200 });
    } catch {

      if (sawBackend404) {
        return NextResponse.json(
          {
            detail: "Dashboard services are updating. Please try again shortly.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          detail: "We couldn't load your dashboard right now. Please try again shortly.",
        },
        { status: 502 }
      );
    }
  }

  const rawBody = await upstreamResponse.text();
  const responseBody = tryParseJson(rawBody);

  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
