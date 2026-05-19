import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchWithTimeout, getBackendBaseUrl, tryParseJson } from "../_shared";

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  const incomingUrl = new URL(request.url);
  const query = incomingUrl.searchParams.get("q")?.trim() || "";
  const page = incomingUrl.searchParams.get("page") || "1";
  const limit = incomingUrl.searchParams.get("limit") || "12";

  if (query.length < 2) {
    return NextResponse.json(
      { detail: "Search query must contain at least 2 characters." },
      { status: 422 }
    );
  }

  const queryParams = new URLSearchParams({
    q: query,
    page,
    limit,
  });

  try {
    const upstreamResponse = await fetchWithTimeout(
      `${getBackendBaseUrl()}/foods/search?${queryParams.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      }
    );

    const rawBody = await upstreamResponse.text();
    const responseBody = tryParseJson(rawBody);
    return NextResponse.json(responseBody, { status: upstreamResponse.status });
  } catch {
    return NextResponse.json(
      { detail: "Food search service is currently unavailable. Please try again shortly." },
      { status: 502 }
    );
  }
}
