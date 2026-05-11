import Link from "next/link";
import type { Route } from "next";
import { Camera, Sparkles, Target } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let getStartedHref: Route = "/signup";
  let scanHref: Route = "/login";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();

    const onboardingCompleted = Boolean(profile?.onboarding_completed);
    getStartedHref = onboardingCompleted ? "/dashboard" : "/onboarding";
    scanHref = onboardingCompleted ? "/scan" : "/onboarding";
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-between px-4 py-8">
      <section className="space-y-6">
        <div className="inline-flex items-center rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          Premium AI Nutrition Tracking
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Scan your food. Track your calories. Hit your goals.
        </h1>
        <p className="text-sm text-muted-foreground">
          Built for speed, accuracy, and consistency—an AI-first nutrition app
          foundation with modern dashboards and coaching.
        </p>
        <div className="grid gap-3">
          <div className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <Camera className="h-4 w-4" /> Camera-first logging
            </div>
            <p className="text-sm text-muted-foreground">
              Scan meals in seconds and confirm portions before saving.
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <Target className="h-4 w-4" /> Goal-based tracking
            </div>
            <p className="text-sm text-muted-foreground">
              Daily calories and protein progress with clean, motivational UX.
            </p>
          </div>
          <div className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4" /> AI coach ready
            </div>
            <p className="text-sm text-muted-foreground">
              Coaching context and suggestions scaffolded for next iteration.
            </p>
          </div>
        </div>
      </section>
      <section className="mt-8 grid gap-3">
        <Link
          href={getStartedHref}
          className="rounded-2xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground shadow-sm"
        >
          Get Started
        </Link>
        <Link
          href={scanHref}
          className="rounded-2xl border bg-card px-4 py-3 text-center text-sm font-medium"
        >
          Scan Meal
        </Link>
      </section>
    </main>
  );
}
