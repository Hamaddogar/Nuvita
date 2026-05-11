"use client";

import {
  calculateGoalTargets,
  type ActivityLevel,
  type BiologicalSex,
  type DietPreference,
  type GoalCalculationResult,
  type GoalType,
} from "@ai-diet/shared";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Step = 1 | 2 | 3 | 4 | 5;

type FormState = {
  fullName: string;
  age: number | "";
  gender: BiologicalSex;
  heightCm: number | "";
  weightKg: number | "";
  activityLevel: ActivityLevel;
  goalType: GoalType;
  goalWeightKg: number | "";
  weeklyWeightGoalKg: number | "";
  dietPreference: DietPreference;
};

const initialForm: FormState = {
  fullName: "",
  age: "",
  gender: "male",
  heightCm: "",
  weightKg: "",
  activityLevel: "moderately_active",
  goalType: "maintain",
  goalWeightKg: "",
  weeklyWeightGoalKg: "",
  dietPreference: "normal",
};

function validateStep(step: Step, form: FormState): string | null {
  if (step === 1) {
    if (!form.fullName.trim()) return "Full name is required.";
    if (typeof form.age !== "number" || form.age < 13 || form.age > 100) return "Age must be 13 to 100.";
    if (typeof form.heightCm !== "number" || form.heightCm < 100 || form.heightCm > 250) {
      return "Height must be 100 to 250 cm.";
    }
    if (typeof form.weightKg !== "number" || form.weightKg < 30 || form.weightKg > 300) {
      return "Weight must be 30 to 300 kg.";
    }
  }

  if (step === 3) {
    if (typeof form.goalWeightKg !== "number" || form.goalWeightKg < 30 || form.goalWeightKg > 300) {
      return "Goal weight must be 30 to 300 kg.";
    }
    if (
      typeof form.weeklyWeightGoalKg !== "number" ||
      form.weeklyWeightGoalKg < 0 ||
      form.weeklyWeightGoalKg > 1.5
    ) {
      return "Weekly weight goal must be between 0 and 1.5 kg.";
    }
  }

  return null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const targets = useMemo<GoalCalculationResult | null>(() => {
    if (
      typeof form.age !== "number" ||
      typeof form.heightCm !== "number" ||
      typeof form.weightKg !== "number"
    ) {
      return null;
    }

    return calculateGoalTargets({
      age: form.age,
      sex: form.gender,
      heightCm: form.heightCm,
      weightKg: form.weightKg,
      activityLevel: form.activityLevel,
      goalType: form.goalType,
    });
  }, [form]);

  const nextStep = () => {
    const stepError = validateStep(step, form);
    if (stepError) {
      setError(stepError);
      return;
    }
    setError(null);
    setStep(Math.min(5, step + 1) as Step);
  };

  const prevStep = () => {
    setError(null);
    setStep(Math.max(1, step - 1) as Step);
  };

  const completeSetup = async () => {
    if (!targets) {
      setError("Please complete all required fields.");
      return;
    }

    const finalValidationError = validateStep(1, form) ?? validateStep(3, form);
    if (finalValidationError) {
      setError(finalValidationError);
      return;
    }

    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Session expired. Please login again.");
      setSaving(false);
      router.replace("/login");
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        full_name: form.fullName,
        age: form.age,
        gender: form.gender,
        height_cm: form.heightCm,
        weight_kg: form.weightKg,
        activity_level: form.activityLevel,
        diet_preference: form.dietPreference,
        onboarding_completed: true,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      setError(profileError.message);
      setSaving(false);
      return;
    }

    const { data: existingGoal } = await supabase
      .from("user_goals")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const goalPayload = {
      user_id: user.id,
      goal_type: form.goalType,
      goal_weight_kg: form.goalWeightKg,
      daily_calorie_target: targets.dailyCalorieTarget,
      protein_target_g: targets.proteinTargetG,
      carbs_target_g: targets.carbsTargetG,
      fat_target_g: targets.fatTargetG,
      fiber_target_g: targets.fiberTargetG,
      sugar_limit_g: targets.sugarLimitG,
      sodium_limit_mg: targets.sodiumLimitMg,
      water_target_ml: targets.waterTargetMl,
      weekly_weight_goal_kg: form.weeklyWeightGoalKg,
    };

    const goalResult = existingGoal
      ? await supabase.from("user_goals").update(goalPayload).eq("id", existingGoal.id)
      : await supabase.from("user_goals").insert(goalPayload);

    if (goalResult.error) {
      setError(goalResult.error.message);
      setSaving(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-6">
      <section className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="mb-5">
          <p className="text-xs text-muted-foreground">Step {step} of 5</p>
          <div className="mt-2 h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold">Personal info</h1>
            <input
              placeholder="Full name"
              value={form.fullName}
              onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
            />
            <input
              placeholder="Age"
              type="number"
              value={form.age}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, age: e.target.value ? Number(e.target.value) : "" }))
              }
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
            />
            <select
              value={form.gender}
              onChange={(e) => setForm((prev) => ({ ...prev, gender: e.target.value as BiologicalSex }))}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
            >
              <option value="male">male</option>
              <option value="female">female</option>
              <option value="other">other</option>
            </select>
            <input
              placeholder="Height (cm)"
              type="number"
              value={form.heightCm}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  heightCm: e.target.value ? Number(e.target.value) : "",
                }))
              }
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
            />
            <input
              placeholder="Current weight (kg)"
              type="number"
              value={form.weightKg}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  weightKg: e.target.value ? Number(e.target.value) : "",
                }))
              }
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold">Activity level</h1>
            {(["sedentary", "lightly_active", "moderately_active", "very_active", "athlete"] as const).map(
              (level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, activityLevel: level }))}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                    form.activityLevel === level ? "border-primary bg-primary/10" : ""
                  }`}
                >
                  {level.replace("_", " ")}
                </button>
              )
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold">Goal setup</h1>
            {(["lose_weight", "maintain", "gain_muscle"] as const).map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, goalType: goal }))}
                className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                  form.goalType === goal ? "border-primary bg-primary/10" : ""
                }`}
              >
                {goal.replace("_", " ")}
              </button>
            ))}
            <input
              placeholder="Goal weight (kg)"
              type="number"
              value={form.goalWeightKg}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  goalWeightKg: e.target.value ? Number(e.target.value) : "",
                }))
              }
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
            />
            <input
              placeholder="Weekly weight goal (kg)"
              type="number"
              step="0.1"
              value={form.weeklyWeightGoalKg}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  weeklyWeightGoalKg: e.target.value ? Number(e.target.value) : "",
                }))
              }
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold">Diet preference</h1>
            {(["normal", "vegetarian", "vegan", "halal", "keto", "high_protein"] as const).map((diet) => (
              <button
                key={diet}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, dietPreference: diet }))}
                className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                  form.dietPreference === diet ? "border-primary bg-primary/10" : ""
                }`}
              >
                {diet.replace("_", " ")}
              </button>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold">Review targets</h1>
            {targets ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border p-3">BMR: {targets.bmr}</div>
                <div className="rounded-xl border p-3">TDEE: {targets.tdee}</div>
                <div className="rounded-xl border p-3">Calories: {targets.dailyCalorieTarget}</div>
                <div className="rounded-xl border p-3">Protein: {targets.proteinTargetG}g</div>
                <div className="rounded-xl border p-3">Carbs: {targets.carbsTargetG}g</div>
                <div className="rounded-xl border p-3">Fat: {targets.fatTargetG}g</div>
                <div className="rounded-xl border p-3">Fiber: {targets.fiberTargetG}g</div>
                <div className="rounded-xl border p-3">Sugar: {targets.sugarLimitG}g</div>
                <div className="rounded-xl border p-3">Sodium: {targets.sodiumLimitMg}mg</div>
                <div className="rounded-xl border p-3">Water: {targets.waterTargetMl}ml</div>
              </div>
            ) : (
              <p className="text-sm text-red-500">Missing required values from previous steps.</p>
            )}
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={prevStep}
            disabled={step === 1 || saving}
            className="rounded-2xl border px-4 py-3 text-sm font-medium disabled:opacity-50"
          >
            Back
          </button>
          {step < 5 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={saving}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={completeSetup}
              disabled={saving}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving..." : "Complete Setup"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
