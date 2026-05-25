import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IntegrationsPageClient } from "./_components/integrations-page-client";

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = item.trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  return null;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <IntegrationsPageClient
      fullName={profile.full_name ?? null}
      callbackProvider={firstQueryValue(searchParams?.provider)}
      callbackStatus={firstQueryValue(searchParams?.callback)}
      callbackMessage={firstQueryValue(searchParams?.message)}
    />
  );
}
