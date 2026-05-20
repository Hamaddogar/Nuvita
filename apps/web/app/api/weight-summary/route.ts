import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchWithTimeout, getCandidateBackendBaseUrls, tryParseJson } from "../wellness/_shared";

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  const incoming = new URL(request.url);
  const params = incoming.searchParams.toString();
  const suffix = params ? `?${params}` : "";

  let upstream: Response | null = null;
  let sawBackend404 = false;
  for (const backendBaseUrl of getCandidateBackendBaseUrls()) {
    try {
      const candidate = await fetchWithTimeout(`${backendBaseUrl}/weight-summary${suffix}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
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
          : "Unable to load weight summary right now. Please try again shortly.",
      },
      { status: sawBackend404 ? 503 : 502 }
    );
  }
  const payload = tryParseJson(await upstream.text());
  return NextResponse.json(payload, { status: upstream.status });
}
