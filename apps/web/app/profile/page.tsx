import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { NuvitaLogo } from "@/components/nuvita-logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: goal }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("user_goals")
      .select("goal_type,daily_calorie_target,protein_target_g")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-md px-4 py-6 pb-24">
        <header className="rounded-3xl border border-emerald-100/80 bg-card/95 p-5 shadow-sm dark:border-slate-800">
          <NuvitaLogo className="mb-3" />
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">Account, goals, and app preferences</p>
        </header>

        <section className="mt-4 space-y-2 rounded-3xl border border-emerald-100/80 bg-card/95 p-5 text-sm shadow-sm dark:border-slate-800">
          <p>Email: {user.email}</p>
          <p>Full name: {profile?.full_name ?? "Not set"}</p>
          <p>Goal type: {goal?.goal_type ?? "Not set"}</p>
          <p>Calorie target: {goal?.daily_calorie_target ?? 0} kcal</p>
          <p>Protein target: {goal?.protein_target_g ?? 0} g</p>
        </section>

        <section className="mt-4">
          <LogoutButton />
        </section>
      </main>
      <MobileBottomNav />
    </>
  );
}
