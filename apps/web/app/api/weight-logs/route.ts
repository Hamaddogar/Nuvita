import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchWithTimeout, getCandidateBackendBaseUrls, tryParseJson } from "../wellness/_shared";

function validateBody(body: unknown): body is Record<string, unknown> {
  return Boolean(body && typeof body === "object");
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }
  if (!validateBody(body)) {
    return NextResponse.json({ detail: "Request body must be a valid object." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  let upstream: Response | null = null;
  let sawBackend404 = false;
  for (const backendBaseUrl of getCandidateBackendBaseUrls()) {
    try {
      const candidate = await fetchWithTimeout(`${backendBaseUrl}/weight-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (candidate.status === 404) {
        sawBackend404 = true;
        continue;
      }
      if (candidate.status >= 500) {
        continue;
      }
      upstream = candidate;
      break;
    } catch {
      continue;
    }
  }
  if (!upstream) {
    return NextResponse.json(
      {
        detail: sawBackend404
          ? "Weight services are updating. Please try again shortly."
          : "Unable to save weight log right now. Please try again shortly.",
      },
      { status: sawBackend404 ? 503 : 502 }
    );
  }
  const payload = tryParseJson(await upstream.text());
  return NextResponse.json(payload, { status: upstream.status });
}
