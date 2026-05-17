import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getBackendBaseUrl() {
  const configured =
    process.env.FASTAPI_URL || process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";
  return configured.replace(/\/+$/, "");
}

function tryParseJson(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { detail: raw || "Unexpected backend response." };
  }
}

export async function POST(request: Request) {
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  if (!requestBody || typeof requestBody !== "object") {
    return NextResponse.json({ detail: "Request body must be a valid object." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${getBackendBaseUrl()}/meals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "Unable to reach meal save backend. Please try again shortly." },
      { status: 502 }
    );
  }

  const rawBody = await upstreamResponse.text();
  const responseBody = tryParseJson(rawBody);

  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
