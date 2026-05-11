"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const user = data.user;
    let sessionUserId = data.session?.user.id ?? null;

    if (user && !sessionUserId) {
      const { data: signInData } = await supabase.auth.signInWithPassword({ email, password });
      sessionUserId = signInData.user?.id ?? null;
    }

    if (user && sessionUserId) {
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email,
          full_name: fullName,
        },
        { onConflict: "id" }
      );
      router.replace("/onboarding");
      router.refresh();
      return;
    }

    setError("Account created. Please confirm your email, then log in.");
    setLoading(false);
  };

  if (checkingSession) {
    return (
      <AuthCard title="Create your account" subtitle="Checking your session...">
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" subtitle="Set up your profile to start tracking your goals.">
      <form className="space-y-3" onSubmit={handleSignup}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Full name</span>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input
            required
            type="email"
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Confirm password</span>
          <input
            required
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
          />
        </label>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          Login
        </Link>
      </p>
    </AuthCard>
  );
}
