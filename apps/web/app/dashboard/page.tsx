import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: goal }] = await Promise.all([
    supabase.from("profiles").select("full_name,onboarding_completed").eq("id", user.id).maybeSingle(),
    supabase
      .from("user_goals")
      .select("daily_calorie_target,protein_target_g,carbs_target_g,fat_target_g")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-8">
      <header className="rounded-3xl border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {profile.full_name ? profile.full_name : "Athlete"}
        </h1>
      </header>

      <section className="mt-4 rounded-3xl border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-medium text-muted-foreground">Today&apos;s progress</h2>
        <div className="mt-3 space-y-2 text-sm">
          <p>Calories: 0 / {goal?.daily_calorie_target ?? 0}</p>
          <p>Protein: 0g / {goal?.protein_target_g ?? 0}g</p>
          <p>Carbs: 0g / {goal?.carbs_target_g ?? 0}g</p>
          <p>Fat: 0g / {goal?.fat_target_g ?? 0}g</p>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href="/scan"
          className="rounded-2xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground"
        >
          Scan Meal
        </Link>
        <button
          type="button"
          className="rounded-2xl border bg-card px-4 py-3 text-sm font-medium"
        >
          Add Meal
        </button>
      </section>
    </main>
  );
}
