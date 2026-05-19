import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchWithTimeout, getBackendBaseUrl, tryParseJson } from "../_shared";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  if (!requestBody || typeof requestBody !== "object") {
    return NextResponse.json({ detail: "Request body must be a valid object." }, { status: 400 });
  }

  try {
    const upstreamResponse = await fetchWithTimeout(`${getBackendBaseUrl()}/foods/favorite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });

    const rawBody = await upstreamResponse.text();
    const responseBody = tryParseJson(rawBody);
    return NextResponse.json(responseBody, { status: upstreamResponse.status });
  } catch {
    return NextResponse.json(
      { detail: "Unable to save favorite food right now. Please try again shortly." },
      { status: 502 }
    );
  }
}
