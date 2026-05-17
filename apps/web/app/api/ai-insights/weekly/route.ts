import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildWeeklyFallbackPayload } from "../_fallback";
import {
  fetchBackendInsights,
  getCandidateBackendBaseUrls,
  parseDateInput,
  parseTimezoneInput,
  tryParseJson,
} from "../_shared";

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
      { detail: error instanceof Error ? error.message : "Invalid date/timezone input." },
      { status: 422 }
    );
  }

  const query = new URLSearchParams({ date, timezone });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  let upstreamResponse: Response | null = null;
  let sawBackend404 = false;

  for (const backendBaseUrl of getCandidateBackendBaseUrls()) {
    try {
      const candidate = await fetchBackendInsights({
        backendBaseUrl,
        endpointPath: "/ai-insights/weekly",
        suffix,
        accessToken: session.access_token,
      });

      if (candidate.status === 404) {
        sawBackend404 = true;
        continue;
      }
      if (candidate.status >= 500) {
        continue;
      }

      upstreamResponse = candidate;
      break;
    } catch {
      continue;
    }
  }

  if (!upstreamResponse) {
    const fallbackReason = sawBackend404
      ? "Weekly AI insights backend endpoint not available; using resilient Supabase fallback."
      : "Weekly AI insights backend unreachable; using resilient Supabase fallback.";
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
    }

    try {
      const fallbackPayload = await buildWeeklyFallbackPayload({
        supabase,
        userId: user.id,
        date,
        timeZone: timezone,
        fallbackReason,
      });
      return NextResponse.json(fallbackPayload, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to build weekly fallback AI insights.";
      return NextResponse.json(
        {
          detail: `Unable to reach weekly AI insights backend and fallback failed: ${message}`,
        },
        { status: 502 }
      );
    }
  }

  const rawBody = await upstreamResponse.text();
  const responseBody = tryParseJson(rawBody);
  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
