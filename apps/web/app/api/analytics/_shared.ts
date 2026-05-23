import {
  fetchBackendInsights,
  getCandidateBackendBaseUrls,
  parseDateInput,
  parseTimezoneInput,
  tryParseJson,
} from "../ai-insights/_shared";

export { parseDateInput, parseTimezoneInput, tryParseJson };

export function parseWeightUnitInput(unitValue: string | null): "kg" | "lb" {
  const normalized = (unitValue || "kg").trim().toLowerCase();
  if (normalized === "kg" || normalized === "lb") {
    return normalized;
  }
  throw new Error("unit must be kg or lb.");
}

export async function fetchAnalyticsWithFailover({
  accessToken,
  endpointPath,
  suffix,
}: {
  accessToken: string;
  endpointPath: string;
  suffix: string;
}) {
  let upstreamResponse: Response | null = null;
  let sawBackend404 = false;

  for (const backendBaseUrl of getCandidateBackendBaseUrls()) {
    try {
      const candidate = await fetchBackendInsights({
        backendBaseUrl,
        endpointPath,
        suffix,
        accessToken,
      });

      if (candidate.status === 404) {
        sawBackend404 = true;
        continue;
      }
      if (candidate.status >= 500) {
        continue;
      }

      upstreamResponse = candidate;
      break;
    } catch {
      continue;
    }
  }

  return {
    upstreamResponse,
    sawBackend404,
  };
}
