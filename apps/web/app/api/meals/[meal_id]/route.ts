import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

function tryParseJson(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { detail: raw || "Unexpected backend response." };
  }
}

type RouteContext = {
  params: {
    meal_id: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const mealId = context.params.meal_id?.trim();
  if (!mealId) {
    return NextResponse.json({ detail: "meal_id is required." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  let upstreamResponse: Response | null = null;
  let sawBackend404 = false;

  for (const backendBaseUrl of getCandidateBackendBaseUrls()) {
    try {
      const candidate = await fetch(`${backendBaseUrl}/meals/${mealId}`, {
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

      upstreamResponse = candidate;
      break;
    } catch {
      continue;
    }
  }

  if (!upstreamResponse) {
    return NextResponse.json(
      {
        detail: sawBackend404
          ? "Meal detail endpoint is missing on the running backend. Restart FastAPI with latest code."
          : "Unable to reach meal detail backend. Please try again shortly.",
      },
      { status: sawBackend404 ? 503 : 502 }
    );
  }

  const rawBody = await upstreamResponse.text();
  const responseBody = tryParseJson(rawBody);
  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
