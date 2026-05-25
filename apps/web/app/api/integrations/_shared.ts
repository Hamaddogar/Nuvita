import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchWithTimeout, getCandidateBackendBaseUrls, tryParseJson } from "../wellness/_shared";

type ProxyMethod = "GET" | "POST" | "PATCH" | "DELETE";

export async function requireSessionAccessToken(): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function buildRequestSuffix(request: Request): string {
  const incoming = new URL(request.url);
  const params = incoming.searchParams.toString();
  return params ? `?${params}` : "";
}

export function getDetailMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string") {
    const detail = payload.detail.trim();
    if (detail) {
      return detail;
    }
  }
  return fallback;
}

export async function fetchWithBackendFailover({
  accessToken,
  endpointPath,
  method,
  suffix = "",
  body,
}: {
  accessToken: string;
  endpointPath: string;
  method: ProxyMethod;
  suffix?: string;
  body?: unknown;
}): Promise<{ upstream: Response | null; sawBackend404: boolean }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  let serializedBody: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    serializedBody = JSON.stringify(body);
  }

  let upstream: Response | null = null;
  let sawBackend404 = false;
  for (const backendBaseUrl of getCandidateBackendBaseUrls()) {
    try {
      const candidate = await fetchWithTimeout(`${backendBaseUrl}${endpointPath}${suffix}`, {
        method,
        headers,
        body: serializedBody,
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

  return {
    upstream,
    sawBackend404,
  };
}

export async function parseUpstreamJson(upstream: Response): Promise<unknown> {
  return tryParseJson(await upstream.text());
}
