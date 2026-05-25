import { NextResponse } from "next/server";
import { fetchWithBackendFailover, parseUpstreamJson, requireSessionAccessToken } from "./_shared";

export async function GET() {
  const accessToken = await requireSessionAccessToken();
  if (!accessToken) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  const { upstream, sawBackend404 } = await fetchWithBackendFailover({
    accessToken,
    endpointPath: "/integrations",
    method: "GET",
  });
  if (!upstream) {
    return NextResponse.json(
      {
        detail: sawBackend404
          ? "Integration services are updating. Please try again shortly."
          : "Unable to load integrations right now. Please try again shortly.",
      },
      { status: sawBackend404 ? 503 : 502 }
    );
  }

  const payload = await parseUpstreamJson(upstream);
  return NextResponse.json(payload, { status: upstream.status });
}
