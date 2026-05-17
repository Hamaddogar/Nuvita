import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addDaysToDateISO,
  getDateKeyInTimeZone,
  getHourInTimeZone,
  startOfDateInTimeZone,
} from "./_shared";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

type InsightType =
  | "calorie_balance"
  | "protein"
  | "carbs"
  | "fat"
  | "meal_timing"
  | "consistency"
  | "recommendation"
  | "motivation"
  | "warning"
  | "weekly_summary";
type InsightPriority = "high" | "medium" | "low";

type InsightDraft = {
  type: InsightType;
  priority: InsightPriority;
  title: string;
  message: string;
  recommendation: string;
  actionable: boolean;
};

type DayTotals = {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_count: number;
  has_breakfast: boolean;
  late_night_calories: number;
};

type GoalTargets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value >= 0 ? value : 0;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratioPercent(consumed: number, goal: number): number {
  if (goal <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((consumed / goal) * 100));
}

function adherencePercent(consumed: number, goal: number): number {
  if (goal <= 0) {
    return 0;
  }
  const distance = Math.abs(consumed - goal) / goal;
  return Math.max(0, Math.round(100 - distance * 100));
}

function emptyDayTotals(date: string): DayTotals {
  return {
    date,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    meal_count: 0,
    has_breakfast: false,
    late_night_calories: 0,
  };
}

function createDayMap(startDate: string, endDate: string): Map<string, DayTotals> {
  const dayMap = new Map<string, DayTotals>();
  let cursor = startDate;
  while (cursor <= endDate) {
    dayMap.set(cursor, emptyDayTotals(cursor));
    cursor = addDaysToDateISO(cursor, 1);
  }
  return dayMap;
}

function asGoalTargets(row: Record<string, unknown> | null): GoalTargets {
  return {
    calories: roundToTwo(toNonNegativeNumber(row?.daily_calorie_target)),
    protein_g: roundToTwo(toNonNegativeNumber(row?.protein_target_g)),
    carbs_g: roundToTwo(toNonNegativeNumber(row?.carbs_target_g)),
    fat_g: roundToTwo(toNonNegativeNumber(row?.fat_target_g)),
  };
}

function asGoalType(row: Record<string, unknown> | null): string | null {
  const value = row?.goal_type;
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return value.trim().toLowerCase();
}

function coerceMealRows(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.filter(isRecord);
}

function dayTotalsFromMeals({
  meals,
  startDate,
  endDate,
  timeZone,
}: {
  meals: Array<Record<string, unknown>>;
  startDate: string;
  endDate: string;
  timeZone: string;
}) {
  const dayMap = createDayMap(startDate, endDate);

  for (const row of meals) {
    const eatenAtRaw = row.eaten_at;
    if (typeof eatenAtRaw !== "string" || !eatenAtRaw.trim()) {
      continue;
    }

    const eatenAt = new Date(eatenAtRaw);
    if (Number.isNaN(eatenAt.getTime())) {
      continue;
    }

    const dateKey = getDateKeyInTimeZone(eatenAt, timeZone);
    const day = dayMap.get(dateKey);
    if (!day) {
      continue;
    }

    const calories = roundToTwo(toNonNegativeNumber(row.total_calories));
    const protein = roundToTwo(toNonNegativeNumber(row.total_protein_g));
    const carbs = roundToTwo(toNonNegativeNumber(row.total_carbs_g));
    const fat = roundToTwo(toNonNegativeNumber(row.total_fat_g));
    const mealType = typeof row.meal_type === "string" ? row.meal_type.trim().toLowerCase() : "unknown";
    const localHour = getHourInTimeZone(eatenAt, timeZone);

    day.calories = roundToTwo(day.calories + calories);
    day.protein_g = roundToTwo(day.protein_g + protein);
    day.carbs_g = roundToTwo(day.carbs_g + carbs);
    day.fat_g = roundToTwo(day.fat_g + fat);
    day.meal_count += 1;
    if (mealType === "breakfast" || localHour < 11) {
      day.has_breakfast = true;
    }
    if (localHour >= 20) {
      day.late_night_calories = roundToTwo(day.late_night_calories + calories);
    }
  }

  return dayMap;
}

function computeLoggingStreak(dayMap: Map<string, DayTotals>, endDate: string): number {
  let streak = 0;
  let cursor = endDate;
  while (true) {
    const day = dayMap.get(cursor);
    if (!day || day.meal_count <= 0) {
      break;
    }
    streak += 1;
    cursor = addDaysToDateISO(cursor, -1);
  }
  return streak;
}

function computeProteinStreak(dayMap: Map<string, DayTotals>, endDate: string, proteinGoal: number): number {
  if (proteinGoal <= 0) {
    return 0;
  }
  let streak = 0;
  let cursor = endDate;
  while (true) {
    const day = dayMap.get(cursor);
    if (!day || day.meal_count <= 0 || day.protein_g < proteinGoal * 0.9) {
      break;
    }
    streak += 1;
    cursor = addDaysToDateISO(cursor, -1);
  }
  return streak;
}

function ensureMinimumDrafts(drafts: InsightDraft[], goalType: string | null): InsightDraft[] {
  if (drafts.length >= 3) {
    return drafts.slice(0, 6);
  }

  const normalizedGoalType = (goalType || "general_wellness").replace(/_/g, " ");
  const fillers: InsightDraft[] = [
    {
      type: "recommendation",
      priority: "medium",
      title: "Keep meal logging consistent",
      message: "More complete logs improve coaching quality and adherence guidance.",
      recommendation: "Log each meal with realistic portions for better personalization.",
      actionable: true,
    },
    {
      type: "motivation",
      priority: "low",
      title: "Small steps build momentum",
      message: `Consistency beats perfection for ${normalizedGoalType} progress.`,
      recommendation: "Focus on one practical nutrition improvement at your next meal.",
      actionable: false,
    },
    {
      type: "consistency",
      priority: "low",
      title: "Use a repeatable meal template",
      message: "A repeatable balanced meal can stabilize calories and macros on busy days.",
      recommendation: "Choose one anchor breakfast or lunch and repeat it 3-4 times weekly.",
      actionable: true,
    },
  ];

  const merged = drafts.slice();
  for (const filler of fillers) {
    if (merged.length >= 3) {
      break;
    }
    merged.push(filler);
  }

  return merged.slice(0, 6);
}

function toInsightItems(drafts: InsightDraft[], prefix: string) {
  const nowIso = new Date().toISOString();
  return drafts.map((draft, index) => ({
    id: `${prefix}_${index + 1}`,
    type: draft.type,
    priority: draft.priority,
    title: draft.title,
    message: draft.message,
    recommendation: draft.recommendation,
    actionable: draft.actionable,
    created_at: nowIso,
  }));
}

function buildTodayDrafts({
  today,
  goals,
  goalType,
  loggingStreak,
  proteinStreak,
}: {
  today: DayTotals;
  goals: GoalTargets;
  goalType: string | null;
  loggingStreak: number;
  proteinStreak: number;
}): InsightDraft[] {
  const drafts: InsightDraft[] = [];

  if (today.meal_count === 0) {
    drafts.push(
      {
        type: "warning",
        priority: "high",
        title: "No meals logged yet",
        message: "I need at least one logged meal to provide high-confidence coaching today.",
        recommendation: "Log your next meal to unlock personalized calorie and macro guidance.",
        actionable: true,
      },
      {
        type: "motivation",
        priority: "low",
        title: "Start with one meal",
        message: "A single complete meal log is enough to start building meaningful trends.",
        recommendation: "Capture your next meal with scan and confirm ingredients.",
        actionable: true,
      }
    );
    return ensureMinimumDrafts(drafts, goalType);
  }

  if (goals.protein_g > 0 && today.protein_g < goals.protein_g * 0.75) {
    drafts.push({
      type: "protein",
      priority: "high",
      title: "Protein is below target",
      message: `You're around ${roundToTwo(goals.protein_g - today.protein_g)}g below your protein goal.`,
      recommendation: "Prioritize a protein anchor in your next meal (eggs, yogurt, tofu, chicken, or lentils).",
      actionable: true,
    });
  }

  if (goals.calories > 0 && today.calories > goals.calories * 1.15) {
    drafts.push({
      type: "calorie_balance",
      priority: "high",
      title: "Calories are trending above goal",
      message: `Current intake is about ${roundToTwo(today.calories - goals.calories)} kcal above target.`,
      recommendation: "Keep your next meal lighter with protein + vegetables and fewer calorie-dense extras.",
      actionable: true,
    });
  } else if (goals.calories > 0 && today.calories < goals.calories * 0.6 && today.meal_count >= 2) {
    drafts.push({
      type: "calorie_balance",
      priority: "medium",
      title: "Calories may be too low for your plan",
      message: `You're about ${roundToTwo(goals.calories - today.calories)} kcal below target so far.`,
      recommendation: "Add a balanced snack with protein + carbs to support energy and adherence.",
      actionable: true,
    });
  }

  if (today.calories > 0 && today.late_night_calories / today.calories >= 0.35) {
    drafts.push({
      type: "meal_timing",
      priority: "medium",
      title: "A large share of calories came late",
      message: `${Math.round((today.late_night_calories / today.calories) * 100)}% of intake was after 8 PM.`,
      recommendation: "Shift part of dinner calories earlier in the day to smooth hunger and energy.",
      actionable: true,
    });
  }

  if (!today.has_breakfast && today.meal_count >= 2) {
    drafts.push({
      type: "meal_timing",
      priority: "medium",
      title: "No early fueling logged",
      message: "Your first logged intake was later in the day, which can increase evening cravings.",
      recommendation: "Try adding a protein-rich breakfast or early snack tomorrow.",
      actionable: true,
    });
  }

  if (loggingStreak >= 4) {
    drafts.push({
      type: "consistency",
      priority: "low",
      title: "Strong logging consistency",
      message: `You've logged meals for ${loggingStreak} days in a row.`,
      recommendation: "Keep the streak alive with at least two complete logs tomorrow.",
      actionable: false,
    });
  }

  if (proteinStreak >= 3) {
    drafts.push({
      type: "motivation",
      priority: "low",
      title: "Protein streak in progress",
      message: `You've stayed near protein targets for ${proteinStreak} consecutive days.`,
      recommendation: "Repeat your current protein structure tomorrow to extend the streak.",
      actionable: false,
    });
  }

  const normalizedGoalType = (goalType || "general_wellness").replace(/_/g, " ");
  drafts.push({
    type: "recommendation",
    priority: "medium",
    title: "Smart next meal adjustment",
    message: `Use your ${normalizedGoalType} plan to guide your next balanced meal decision.`,
    recommendation: "Aim for protein + fiber-rich vegetables + controlled carbs in your next plate.",
    actionable: true,
  });

  return ensureMinimumDrafts(drafts, goalType);
}

function dayQualityScore(day: DayTotals, goals: GoalTargets): number {
  const scores: number[] = [];
  if (goals.calories > 0) {
    scores.push(adherencePercent(day.calories, goals.calories));
  }
  if (goals.protein_g > 0) {
    scores.push(adherencePercent(day.protein_g, goals.protein_g));
  }
  if (goals.carbs_g > 0) {
    scores.push(adherencePercent(day.carbs_g, goals.carbs_g));
  }
  if (goals.fat_g > 0) {
    scores.push(adherencePercent(day.fat_g, goals.fat_g));
  }
  if (scores.length === 0) {
    return day.meal_count > 0 ? 50 : 0;
  }
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

function deriveWeeklyTrend(scores: number[]): "improving" | "stable" | "needs_attention" {
  if (scores.length < 4) {
    return "stable";
  }
  const window = Math.min(3, scores.length);
  const firstAvg = scores.slice(0, window).reduce((sum, value) => sum + value, 0) / window;
  const lastAvg = scores.slice(-window).reduce((sum, value) => sum + value, 0) / window;
  const delta = lastAvg - firstAvg;
  if (delta >= 8) {
    return "improving";
  }
  if (delta <= -8) {
    return "needs_attention";
  }
  return "stable";
}

function buildWeeklyDrafts({
  daysTracked,
  avgCalorieAdherence,
  weakestMacro,
  trend,
  bestDayReason,
  goalType,
}: {
  daysTracked: number;
  avgCalorieAdherence: number;
  weakestMacro: "calories" | "protein_g" | "carbs_g" | "fat_g" | null;
  trend: "improving" | "stable" | "needs_attention";
  bestDayReason: string | null;
  goalType: string | null;
}): InsightDraft[] {
  const drafts: InsightDraft[] = [];

  if (daysTracked === 0) {
    drafts.push(
      {
        type: "warning",
        priority: "high",
        title: "No tracked days this week",
        message: "Weekly coaching needs at least one tracked day in this 7-day window.",
        recommendation: "Log meals for 3+ days this week to unlock stronger weekly feedback.",
        actionable: true,
      },
      {
        type: "recommendation",
        priority: "medium",
        title: "Start with consistency",
        message: "More tracked days improve trend confidence and coaching quality.",
        recommendation: "Begin with complete logging today and continue for the next two days.",
        actionable: true,
      }
    );
    return ensureMinimumDrafts(drafts, goalType);
  }

  if (daysTracked < 4) {
    drafts.push({
      type: "consistency",
      priority: "high",
      title: "Logging consistency is the priority",
      message: `Only ${daysTracked}/7 days were tracked this week.`,
      recommendation: "Target at least 5 tracked days next week for better personalization.",
      actionable: true,
    });
  } else {
    drafts.push({
      type: "consistency",
      priority: "low",
      title: "Good weekly tracking rhythm",
      message: `You tracked ${daysTracked}/7 days this week.`,
      recommendation: "Keep this rhythm and tighten one macro for better adherence.",
      actionable: false,
    });
  }

  if (avgCalorieAdherence < 70) {
    drafts.push({
      type: "calorie_balance",
      priority: "medium",
      title: "Calorie adherence can improve",
      message: `Average calorie adherence was ${avgCalorieAdherence}% this week.`,
      recommendation: "Use one repeatable weekday meal template to reduce variability.",
      actionable: true,
    });
  } else {
    drafts.push({
      type: "weekly_summary",
      priority: "low",
      title: "Solid calorie adherence",
      message: `Average calorie adherence reached ${avgCalorieAdherence}% this week.`,
      recommendation: "Maintain this baseline and improve protein consistency next.",
      actionable: false,
    });
  }

  if (weakestMacro === "protein_g") {
    drafts.push({
      type: "protein",
      priority: "medium",
      title: "Protein was the weakest macro",
      message: "Protein consistency lagged behind your other nutrition targets.",
      recommendation: "Anchor each main meal with a clear protein source.",
      actionable: true,
    });
  } else if (weakestMacro === "carbs_g") {
    drafts.push({
      type: "carbs",
      priority: "medium",
      title: "Carb consistency varied",
      message: "Carbohydrate intake was less consistent across tracked days.",
      recommendation: "Keep carb portions steadier and align larger portions with activity.",
      actionable: true,
    });
  } else if (weakestMacro === "fat_g") {
    drafts.push({
      type: "fat",
      priority: "medium",
      title: "Fat intake varied most",
      message: "Fat targets showed the largest day-to-day variability.",
      recommendation: "Use measured oils, nuts, and dressings to improve consistency.",
      actionable: true,
    });
  }

  if (trend === "improving") {
    drafts.push({
      type: "motivation",
      priority: "low",
      title: "Weekly trend is improving",
      message: "Your nutrition quality improved from earlier to later in the week.",
      recommendation: "Repeat the structure from your best day next week.",
      actionable: false,
    });
  } else if (trend === "needs_attention") {
    drafts.push({
      type: "warning",
      priority: "medium",
      title: "Weekly momentum dipped",
      message: "Later-week nutrition quality dropped versus earlier tracked days.",
      recommendation: "Pre-plan one main meal and one protein snack for high-risk days.",
      actionable: true,
    });
  }

  if (bestDayReason) {
    drafts.push({
      type: "weekly_summary",
      priority: "low",
      title: "Best day highlight",
      message: bestDayReason,
      recommendation: "Use this day as your template for next week.",
      actionable: false,
    });
  }

  return ensureMinimumDrafts(drafts, goalType);
}

async function fetchGoalsAndMeals({
  supabase,
  userId,
  startDate,
  endDateExclusive,
  timeZone,
}: {
  supabase: SupabaseServerClient;
  userId: string;
  startDate: string;
  endDateExclusive: string;
  timeZone: string;
}) {
  const [goalsResult, mealsResult] = await Promise.all([
    supabase
      .from("user_goals")
      .select("goal_type,daily_calorie_target,protein_target_g,carbs_target_g,fat_target_g")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meals")
      .select("meal_type,eaten_at,total_calories,total_protein_g,total_carbs_g,total_fat_g")
      .eq("user_id", userId)
      .gte("eaten_at", startOfDateInTimeZone(startDate, timeZone).toISOString())
      .lt("eaten_at", startOfDateInTimeZone(endDateExclusive, timeZone).toISOString())
      .order("eaten_at", { ascending: true })
      .limit(800),
  ]);

  if (goalsResult.error) {
    throw new Error(goalsResult.error.message);
  }
  if (mealsResult.error) {
    throw new Error(mealsResult.error.message);
  }

  return {
    goalsRow: isRecord(goalsResult.data) ? goalsResult.data : null,
    meals: coerceMealRows(mealsResult.data),
  };
}

export async function buildTodayFallbackPayload({
  supabase,
  userId,
  date,
  timeZone,
  fallbackReason,
}: {
  supabase: SupabaseServerClient;
  userId: string;
  date: string;
  timeZone: string;
  fallbackReason: string;
}) {
  const lookbackStart = addDaysToDateISO(date, -13);
  const endDateExclusive = addDaysToDateISO(date, 1);
  const { goalsRow, meals } = await fetchGoalsAndMeals({
    supabase,
    userId,
    startDate: lookbackStart,
    endDateExclusive,
    timeZone,
  });

  const goals = asGoalTargets(goalsRow);
  const goalType = asGoalType(goalsRow);
  const dayMap = dayTotalsFromMeals({
    meals,
    startDate: lookbackStart,
    endDate: date,
    timeZone,
  });
  const today = dayMap.get(date) || emptyDayTotals(date);

  const loggingStreak = computeLoggingStreak(dayMap, date);
  const proteinStreak = computeProteinStreak(dayMap, date, goals.protein_g);
  const calorieAdherence = adherencePercent(today.calories, goals.calories);
  const lateShare =
    today.calories > 0 ? Math.max(0, Math.round((today.late_night_calories / today.calories) * 100)) : 0;

  const drafts = buildTodayDrafts({
    today,
    goals,
    goalType,
    loggingStreak,
    proteinStreak,
  });

  return {
    success: true,
    date,
    timezone: timeZone,
    source: "fallback",
    summary: {
      goals,
      consumed: {
        calories: today.calories,
        protein_g: today.protein_g,
        carbs_g: today.carbs_g,
        fat_g: today.fat_g,
      },
      progress: {
        calories_percent: ratioPercent(today.calories, goals.calories),
        protein_percent: ratioPercent(today.protein_g, goals.protein_g),
        carbs_percent: ratioPercent(today.carbs_g, goals.carbs_g),
        fat_percent: ratioPercent(today.fat_g, goals.fat_g),
      },
      meal_count: today.meal_count,
      calorie_adherence_percent: calorieAdherence,
      logging_streak_days: loggingStreak,
      protein_goal_hit_streak_days: proteinStreak,
      late_night_calorie_share_percent: lateShare,
      goal_type: goalType,
    },
    insights: toInsightItems(drafts, `fallback_today_${date}`),
    fallback_reason: fallbackReason,
  };
}

export async function buildWeeklyFallbackPayload({
  supabase,
  userId,
  date,
  timeZone,
  fallbackReason,
}: {
  supabase: SupabaseServerClient;
  userId: string;
  date: string;
  timeZone: string;
  fallbackReason: string;
}) {
  const weekStart = addDaysToDateISO(date, -6);
  const weekEnd = date;
  const endDateExclusive = addDaysToDateISO(weekEnd, 1);
  const { goalsRow, meals } = await fetchGoalsAndMeals({
    supabase,
    userId,
    startDate: weekStart,
    endDateExclusive,
    timeZone,
  });

  const goals = asGoalTargets(goalsRow);
  const goalType = asGoalType(goalsRow);
  const dayMap = dayTotalsFromMeals({
    meals,
    startDate: weekStart,
    endDate: weekEnd,
    timeZone,
  });

  const dailyMetrics: Array<{
    date: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    meal_count: number;
    calorie_adherence_percent: number;
    protein_adherence_percent: number;
    tracked: boolean;
  }> = [];
  const trackedDays: DayTotals[] = [];
  const qualityScores: number[] = [];

  let cursor = weekStart;
  while (cursor <= weekEnd) {
    const day = dayMap.get(cursor) || emptyDayTotals(cursor);
    const tracked = day.meal_count > 0;
    if (tracked) {
      trackedDays.push(day);
      qualityScores.push(dayQualityScore(day, goals));
    }

    dailyMetrics.push({
      date: cursor,
      calories: day.calories,
      protein_g: day.protein_g,
      carbs_g: day.carbs_g,
      fat_g: day.fat_g,
      meal_count: day.meal_count,
      calorie_adherence_percent: adherencePercent(day.calories, goals.calories),
      protein_adherence_percent: adherencePercent(day.protein_g, goals.protein_g),
      tracked,
    });
    cursor = addDaysToDateISO(cursor, 1);
  }

  const daysTracked = trackedDays.length;
  const avgCalorieAdherence =
    trackedDays.length > 0
      ? Math.round(
          trackedDays.reduce((sum, day) => sum + adherencePercent(day.calories, goals.calories), 0) /
            trackedDays.length
        )
      : 0;
  const avgProteinAdherence =
    trackedDays.length > 0
      ? Math.round(
          trackedDays.reduce((sum, day) => sum + adherencePercent(day.protein_g, goals.protein_g), 0) /
            trackedDays.length
        )
      : 0;
  const avgQualityScore =
    qualityScores.length > 0
      ? qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length
      : 0;
  const consistencyScore = Math.max(
    0,
    Math.min(100, Math.round((daysTracked / 7) * 50 + (avgQualityScore / 100) * 50))
  );

  let bestDay: string | null = null;
  let bestDayReason: string | null = null;
  if (trackedDays.length > 0) {
    const best = trackedDays.reduce((currentBest, day) => {
      if (!currentBest) {
        return day;
      }
      return dayQualityScore(day, goals) > dayQualityScore(currentBest, goals) ? day : currentBest;
    }, null as DayTotals | null);

    if (best) {
      bestDay = best.date;
      bestDayReason = `Best balance came on ${best.date} with ${adherencePercent(best.calories, goals.calories)}% calorie adherence.`;
    }
  }

  const macroAdherenceCandidates: Array<{
    macro: "calories" | "protein_g" | "carbs_g" | "fat_g";
    adherence: number;
  }> = [];
  if (trackedDays.length > 0 && goals.calories > 0) {
    macroAdherenceCandidates.push({
      macro: "calories",
      adherence:
        trackedDays.reduce((sum, day) => sum + adherencePercent(day.calories, goals.calories), 0) /
        trackedDays.length,
    });
  }
  if (trackedDays.length > 0 && goals.protein_g > 0) {
    macroAdherenceCandidates.push({
      macro: "protein_g",
      adherence:
        trackedDays.reduce((sum, day) => sum + adherencePercent(day.protein_g, goals.protein_g), 0) /
        trackedDays.length,
    });
  }
  if (trackedDays.length > 0 && goals.carbs_g > 0) {
    macroAdherenceCandidates.push({
      macro: "carbs_g",
      adherence:
        trackedDays.reduce((sum, day) => sum + adherencePercent(day.carbs_g, goals.carbs_g), 0) /
        trackedDays.length,
    });
  }
  if (trackedDays.length > 0 && goals.fat_g > 0) {
    macroAdherenceCandidates.push({
      macro: "fat_g",
      adherence:
        trackedDays.reduce((sum, day) => sum + adherencePercent(day.fat_g, goals.fat_g), 0) /
        trackedDays.length,
    });
  }

  const weakestMacro =
    macroAdherenceCandidates.length > 0
      ? macroAdherenceCandidates.reduce((lowest, candidate) =>
          candidate.adherence < lowest.adherence ? candidate : lowest
        ).macro
      : null;

  const trend = deriveWeeklyTrend(qualityScores);
  const improvementNote =
    daysTracked === 0
      ? "Start by logging meals consistently this week to unlock higher-confidence coaching."
      : trend === "improving"
        ? "Nutrition consistency improved through the week—repeat your best-day structure."
        : trend === "needs_attention"
          ? "Later-week consistency dipped; pre-plan one anchor meal for busy days."
          : weakestMacro === "protein_g"
            ? "Protein consistency is your clearest weekly improvement area."
            : weakestMacro === "carbs_g"
              ? "Carb distribution is your main weekly opportunity."
              : weakestMacro === "fat_g"
                ? "Fat consistency is the main macro to tighten next week."
                : "You are stable this week—keep building consistency.";

  const drafts = buildWeeklyDrafts({
    daysTracked,
    avgCalorieAdherence,
    weakestMacro,
    trend,
    bestDayReason,
    goalType,
  });

  return {
    success: true,
    timezone: timeZone,
    source: "fallback",
    summary: {
      week_start: weekStart,
      week_end: weekEnd,
      days_tracked: daysTracked,
      avg_calorie_adherence_percent: avgCalorieAdherence,
      avg_protein_adherence_percent: avgProteinAdherence,
      consistency_score: consistencyScore,
      best_day: bestDay,
      best_day_reason: bestDayReason,
      weakest_macro: weakestMacro,
      trend,
      improvement_note: improvementNote,
      goal_type: goalType,
    },
    daily_metrics: dailyMetrics,
    insights: toInsightItems(drafts, `fallback_weekly_${weekStart}_${weekEnd}`),
    fallback_reason: fallbackReason,
  };
}
