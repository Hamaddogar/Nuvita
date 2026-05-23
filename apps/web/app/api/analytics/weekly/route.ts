import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAnalyticsWithFailover,
  parseDateInput,
  parseTimezoneInput,
  parseWeightUnitInput,
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
  let unit: "kg" | "lb";
  try {
    timezone = parseTimezoneInput(incomingUrl.searchParams.get("timezone"));
    date = parseDateInput(incomingUrl.searchParams.get("date"), timezone);
    unit = parseWeightUnitInput(incomingUrl.searchParams.get("unit"));
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Invalid analytics request query." },
      { status: 422 }
    );
  }

  const suffix = `?${new URLSearchParams({ date, timezone, unit }).toString()}`;
  const { upstreamResponse, sawBackend404 } = await fetchAnalyticsWithFailover({
    accessToken: session.access_token,
    endpointPath: "/analytics/weekly",
    suffix,
  });

  if (!upstreamResponse) {
    return NextResponse.json(
      {
        detail: sawBackend404
          ? "Weekly analytics endpoint is updating. Please try again shortly."
          : "Unable to load weekly analytics right now. Please try again shortly.",
      },
      { status: sawBackend404 ? 503 : 502 }
    );
  }

  const responseBody = tryParseJson(await upstreamResponse.text());
  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
