"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { mapAuthError } from "@/lib/user-facing-errors";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        setCheckingSession(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      const onboardingCompleted = Boolean(profile?.onboarding_completed);
      router.replace(onboardingCompleted ? "/dashboard" : "/onboarding");
    };

    checkSession();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(mapAuthError(signInError.message));
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  };

  if (checkingSession) {
    return (
      <AuthCard title="Welcome back" subtitle="Checking your session...">
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Welcome back" subtitle="Log in to continue your nutrition tracking journey.">
      <form className="space-y-3" onSubmit={handleLogin}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
          />
        </label>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
      <div className="space-y-2">
        <button
          type="button"
          disabled
          className="w-full rounded-2xl border px-4 py-3 text-sm font-medium text-muted-foreground"
        >
          Continue with Google (coming soon)
        </button>
        <button
          type="button"
          disabled
          className="w-full rounded-2xl border px-4 py-3 text-sm font-medium text-muted-foreground"
        >
          Continue with Apple (coming soon)
        </button>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-foreground underline">
          Create account
        </Link>
      </p>
    </AuthCard>
  );
}
