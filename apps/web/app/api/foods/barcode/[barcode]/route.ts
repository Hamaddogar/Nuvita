import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchWithTimeout, getBackendBaseUrl, tryParseJson } from "../../_shared";

type RouteContext = {
  params: {
    barcode: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const barcode = context.params.barcode?.trim();
  if (!barcode || !/^\d{8,14}$/.test(barcode)) {
    return NextResponse.json({ detail: "Barcode must contain 8-14 digits." }, { status: 422 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ detail: "Authentication required. Please sign in again." }, { status: 401 });
  }

  try {
    const upstreamResponse = await fetchWithTimeout(
      `${getBackendBaseUrl()}/foods/barcode/${encodeURIComponent(barcode)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      }
    );

    const rawBody = await upstreamResponse.text();
    const responseBody = tryParseJson(rawBody);
    return NextResponse.json(responseBody, { status: upstreamResponse.status });
  } catch {
    return NextResponse.json(
      { detail: "Barcode lookup service is currently unavailable. Please try again shortly." },
      { status: 502 }
    );
  }
}
