import { NextResponse } from "next/server";
import {
  buildRequestSuffix,
  fetchWithBackendFailover,
  parseUpstreamJson,
  requireSessionAccessToken,
} from "../../integrations/_shared";

export async function GET(request: Request) {
  const accessToken = await requireSessionAccessToken();
  if (!accessToken) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  const suffix = buildRequestSuffix(request);
  const { upstream, sawBackend404 } = await fetchWithBackendFailover({
    accessToken,
    endpointPath: "/health-data/body",
    method: "GET",
    suffix,
  });
  if (!upstream) {
    return NextResponse.json(
      {
        detail: sawBackend404
          ? "Body metrics endpoint is updating. Please try again shortly."
          : "Unable to load body metrics right now. Please try again shortly.",
      },
      { status: sawBackend404 ? 503 : 502 }
    );
  }

  const payload = await parseUpstreamJson(upstream);
  return NextResponse.json(payload, { status: upstream.status });
}
