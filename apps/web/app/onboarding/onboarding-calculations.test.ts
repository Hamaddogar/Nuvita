import { calculateGoalTargets } from "@ai-diet/shared";

describe("onboarding goal calculations", () => {
  it("applies the female calorie floor for aggressive deficits", () => {
    const result = calculateGoalTargets({
      age: 47,
      sex: "female",
      heightCm: 150,
      weightKg: 40,
      activityLevel: "sedentary",
      goalType: "lose_weight",
    });

    expect(result.dailyCalorieTarget).toBe(1200);
  });

  it("keeps macro-derived calories close to the daily calorie target", () => {
    const result = calculateGoalTargets({
      age: 30,
      sex: "male",
      heightCm: 175,
      weightKg: 70,
      activityLevel: "moderately_active",
      goalType: "maintain",
    });

    const caloriesFromMacros =
      result.proteinTargetG * 4 + result.carbsTargetG * 4 + result.fatTargetG * 9;

    expect(Math.abs(caloriesFromMacros - result.dailyCalorieTarget)).toBeLessThanOrEqual(5);
    expect(result.waterTargetMl).toBe(2450);
  });
});
