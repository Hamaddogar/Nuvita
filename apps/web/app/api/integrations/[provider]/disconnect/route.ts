import { NextResponse } from "next/server";
import { fetchWithBackendFailover, parseUpstreamJson, requireSessionAccessToken } from "../../_shared";

export async function POST(_request: Request, { params }: { params: { provider: string } }) {
  const accessToken = await requireSessionAccessToken();
  if (!accessToken) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  const provider = encodeURIComponent(params.provider);
  const { upstream, sawBackend404 } = await fetchWithBackendFailover({
    accessToken,
    endpointPath: `/integrations/${provider}/disconnect`,
    method: "POST",
  });
  if (!upstream) {
    return NextResponse.json(
      {
        detail: sawBackend404
          ? "Integration disconnect endpoint is updating. Please try again shortly."
          : "Unable to disconnect integration right now. Please try again shortly.",
      },
      { status: sawBackend404 ? 503 : 502 }
    );
  }

  const payload = await parseUpstreamJson(upstream);
  return NextResponse.json(payload, { status: upstream.status });
}
