import type { ActivityLevel, GoalType } from "../types/enums";

export type BiologicalSex = "male" | "female" | "other";

export type GoalCalculationInput = {
  age: number;
  sex: BiologicalSex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
};

export type GoalCalculationResult = {
  bmr: number;
  tdee: number;
  dailyCalorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  fiberTargetG: number;
  sugarLimitG: number;
  sodiumLimitMg: number;
  waterTargetMl: number;
};

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  athlete: 1.9,
};

const GOAL_CALORIE_ADJUSTMENT: Record<GoalType, number> = {
  lose_weight: -500,
  maintain: 0,
  gain_muscle: 300,
};

const GOAL_PROTEIN_MULTIPLIER: Record<GoalType, number> = {
  lose_weight: 2.0,
  maintain: 1.6,
  gain_muscle: 2.2,
};

const MIN_CALORIES_BY_SEX: Record<BiologicalSex, number> = {
  male: 1500,
  female: 1200,
  other: 1300,
};

const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function calculateBMR(input: GoalCalculationInput): number {
  const { weightKg, heightCm, age, sex } = input;
  const male = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const female = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  if (sex === "male") return male;
  if (sex === "female") return female;
  return (male + female) / 2;
}

export function calculateGoalTargets(input: GoalCalculationInput): GoalCalculationResult {
  const bmr = calculateBMR(input);
  const tdee = bmr * ACTIVITY_MULTIPLIER[input.activityLevel];

  const rawCalories = tdee + GOAL_CALORIE_ADJUSTMENT[input.goalType];
  const dailyCalorieTarget = Math.max(MIN_CALORIES_BY_SEX[input.sex], rawCalories);

  const proteinTargetG = input.weightKg * GOAL_PROTEIN_MULTIPLIER[input.goalType];
  const fatTargetG = (dailyCalorieTarget * 0.25) / 9;
  const remainingCalories = dailyCalorieTarget - proteinTargetG * 4 - fatTargetG * 9;
  const carbsTargetG = Math.max(0, remainingCalories / 4);
  const fiberTargetG = (dailyCalorieTarget / 1000) * 14;
  const sugarLimitG = (dailyCalorieTarget * 0.1) / 4;
  const sodiumLimitMg = 2300;
  const waterTargetMl = input.weightKg * 35;

  return {
    bmr: round(bmr),
    tdee: round(tdee),
    dailyCalorieTarget: round(dailyCalorieTarget),
    proteinTargetG: round(proteinTargetG),
    carbsTargetG: round(carbsTargetG),
    fatTargetG: round(fatTargetG),
    fiberTargetG: round(fiberTargetG),
    sugarLimitG: round(sugarLimitG),
    sodiumLimitMg,
    waterTargetMl: round(waterTargetMl),
  };
}
