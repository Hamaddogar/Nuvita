import { NextResponse } from "next/server";
import {
  buildRequestSuffix,
  fetchWithBackendFailover,
  getDetailMessage,
  parseUpstreamJson,
  requireSessionAccessToken,
} from "../../_shared";

function buildRedirectUrl({
  request,
  provider,
  callbackStatus,
  message,
}: {
  request: Request;
  provider: string;
  callbackStatus: string;
  message?: string;
}): URL {
  const redirectUrl = new URL("/integrations", request.url);
  redirectUrl.searchParams.set("provider", provider);
  redirectUrl.searchParams.set("callback", callbackStatus);
  if (message) {
    const compact = message.trim();
    if (compact) {
      redirectUrl.searchParams.set("message", compact.slice(0, 220));
    }
  }
  return redirectUrl;
}

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  const providerPathSegment = encodeURIComponent(provider);

  const accessToken = await requireSessionAccessToken();
  if (!accessToken) {
    return NextResponse.redirect(
      buildRedirectUrl({
        request,
        provider,
        callbackStatus: "auth_required",
        message: "Authentication required. Please sign in again.",
      }),
      302
    );
  }

  const suffix = buildRequestSuffix(request);
  const { upstream, sawBackend404 } = await fetchWithBackendFailover({
    accessToken,
    endpointPath: `/integrations/${providerPathSegment}/callback`,
    method: "GET",
    suffix,
  });

  if (!upstream) {
    return NextResponse.redirect(
      buildRedirectUrl({
        request,
        provider,
        callbackStatus: "error",
        message: sawBackend404
          ? "Integration callback endpoint is updating. Please try again shortly."
          : "Unable to complete provider callback right now. Please try again shortly.",
      }),
      302
    );
  }

  const payload = await parseUpstreamJson(upstream);
  const responseMessage = getDetailMessage(payload, "Connection updated.");
  if (upstream.status >= 400) {
    return NextResponse.redirect(
      buildRedirectUrl({
        request,
        provider,
        callbackStatus: "error",
        message: responseMessage,
      }),
      302
    );
  }

  let integrationStatus = "success";
  if (payload && typeof payload === "object" && "status" in payload && typeof payload.status === "string") {
    integrationStatus = payload.status;
  }

  return NextResponse.redirect(
    buildRedirectUrl({
      request,
      provider,
      callbackStatus: integrationStatus,
      message: responseMessage,
    }),
    302
  );
}
