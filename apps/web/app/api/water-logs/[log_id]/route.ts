import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchWithTimeout, getCandidateBackendBaseUrls, tryParseJson } from "../../wellness/_shared";

function validateBody(body: unknown): body is Record<string, unknown> {
  return Boolean(body && typeof body === "object");
}

async function requireSessionToken() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { log_id: string } }
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }
  if (!validateBody(body)) {
    return NextResponse.json({ detail: "Request body must be a valid object." }, { status: 400 });
  }

  const accessToken = await requireSessionToken();
  if (!accessToken) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  let upstream: Response | null = null;
  let sawBackend404 = false;
  for (const backendBaseUrl of getCandidateBackendBaseUrls()) {
    try {
      const candidate = await fetchWithTimeout(`${backendBaseUrl}/water-logs/${params.log_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
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
          ? "Hydration services are updating. Please try again shortly."
          : "Unable to update water log right now. Please try again shortly.",
      },
      { status: sawBackend404 ? 503 : 502 }
    );
  }
  const payload = tryParseJson(await upstream.text());
  return NextResponse.json(payload, { status: upstream.status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { log_id: string } }
) {
  const accessToken = await requireSessionToken();
  if (!accessToken) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  let upstream: Response | null = null;
  let sawBackend404 = false;
  for (const backendBaseUrl of getCandidateBackendBaseUrls()) {
    try {
      const candidate = await fetchWithTimeout(`${backendBaseUrl}/water-logs/${params.log_id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
          ? "Hydration services are updating. Please try again shortly."
          : "Unable to delete water log right now. Please try again shortly.",
      },
      { status: sawBackend404 ? 503 : 502 }
    );
  }
  const payload = tryParseJson(await upstream.text());
  return NextResponse.json(payload, { status: upstream.status });
}
