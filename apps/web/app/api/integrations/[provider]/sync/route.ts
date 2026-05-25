import { NextResponse } from "next/server";
import { fetchWithBackendFailover, parseUpstreamJson, requireSessionAccessToken } from "../../_shared";

async function parseOptionalBody(request: Request): Promise<Record<string, unknown> | null> {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: { params: { provider: string } }) {
  const body = await parseOptionalBody(request);
  if (!body) {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  const accessToken = await requireSessionAccessToken();
  if (!accessToken) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  const provider = encodeURIComponent(params.provider);
  const { upstream, sawBackend404 } = await fetchWithBackendFailover({
    accessToken,
    endpointPath: `/integrations/${provider}/sync`,
    method: "POST",
    body,
  });
  if (!upstream) {
    return NextResponse.json(
      {
        detail: sawBackend404
          ? "Integration sync endpoint is updating. Please try again shortly."
          : "Unable to sync integration right now. Please try again shortly.",
      },
      { status: sawBackend404 ? 503 : 502 }
    );
  }

  const payload = await parseUpstreamJson(upstream);
  return NextResponse.json(payload, { status: upstream.status });
}
