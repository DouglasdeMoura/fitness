import { createServerFn } from "@tanstack/react-start";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
} from "drizzle-orm";

import { db as drizzleDb } from "../db";
import {
  exportNutritionRecords,
  exportTrainingRecords,
} from "../db/export-queries";
import type { FoodLogRecord, FoodRecord } from "../db/food-nutrition-queries";
import {
  deleteFoodLogRecord,
  insertFoodLogRecord,
  insertFoodRecord,
  listFoodLogRecords,
  listFoodLogStatsRecords,
  listFoodLogSummaryRecords,
  listFoodRecords,
  listFrequentFoodRecords,
  listRecentFoodRecords,
  listWeeklyNutritionRows,
  searchFoodRecords,
} from "../db/food-nutrition-queries";
import {
  deleteMealPlanRecord,
  deleteMealTemplateRecord,
  findMealPlanRecord,
  findMealTemplateDetail,
  listMealPlansForWeek,
  listMealTemplateSummaries,
  saveMealTemplateRecord,
  templateMacroTotals,
  upsertMealPlanRecord,
} from "../db/meal-plan-queries";
import type { MealTemplateItemInput } from "../db/meal-plan-queries";
import {
  deleteProgramRecord,
  findLastProgramExerciseSet,
  findProgramDayContext,
  findProgramDayRecord,
  findProgramDetail,
  listProgramSummaries,
  saveProgramRecord,
  setActiveProgramRecord,
} from "../db/program-queries";
import type {
  ProgramDayInput,
  ProgramDayTarget,
  SaveProgramInput,
} from "../db/program-queries";
import {
  bodyLogs,
  foodLog,
  foods,
  workoutSessions,
  workoutSets,
} from "../db/schema";
import type { BodyLogRecord, UserProfileUpdate } from "../db/user-body-queries";
import {
  ensureDefaultUserRecord,
  findLatestBodyweightRecord,
  listBodyLogRecords,
  updateUserRecord,
  upsertBodyweightRecord,
} from "../db/user-body-queries";
import {
  deleteWorkoutSetRecord,
  findLastPerformanceRow,
  findPreviousNamedSessionRecord,
  findWorkoutSessionForUser,
  findWorkoutSessionWithSets,
  insertWorkoutSessionRecord,
  insertWorkoutSetRecord,
  listExerciseHistoryRows,
  listExerciseRecords,
  listExerciseSetHistoryRows,
  listSessionSetRows,
  listWeeklyVolumeRows,
  listWorkoutSessionRecords,
  toLegacyExercise,
  toLegacyWorkoutSession,
  toLegacyWorkoutSet,
  updateWorkoutSessionDuration,
} from "../db/workout-queries";
import type { SessionSetRow } from "../db/workout-queries";
import { barcodeLookupVariants, normalizeBarcode } from "./barcode";
import type { ConsistencyMetrics } from "./consistency";
import { assembleConsistencyMetrics } from "./consistency";
import type {
  Food,
  FoodLogEntry,
  MealType,
  PeriodizationType,
  Program,
  ProgramDay,
  ProgramExercise,
  WorkoutSession,
  WorkoutSet,
} from "./db";
import { getDb } from "./db";
import {
  copyDayEntriesInDb,
  copyMealEntriesInDb,
  deleteFoodLogEntriesInDb,
} from "./food-log-copy";
import { logMealTemplateInDb } from "./meal-template-log";
import type { MacroTargets, NutritionTotals } from "./nutrition";
import {
  addDays,
  calculateAge,
  calculateBMR,
  calculateFoodMacros,
  calculateMacroTargets,
  calculateTDEE,
  emptyTotals,
  getWeekStart,
  sumFoodLogEntryTotals,
  sumNutritionTotals,
  todayString,
} from "./nutrition";
import type {
  NotificationPreferences,
  NotificationPreferencesUpdate,
  PushSubscriptionInput,
} from "./push";
import {
  deletePushSubscriptionByEndpoint,
  getNotificationPreferences,
  hasPushSubscription,
  listPushSubscriptionsForUser,
  readVapidConfig,
  readVapidPublicKey,
  TEST_PUSH_PAYLOAD,
  upsertNotificationPreferences,
  upsertPushSubscription,
} from "./push";
import { recordKindsBySetId } from "./records";
import type { QueuedMutation, SyncOutcome, SyncResult } from "./sync";
import type { WeeklyReviewPayload } from "./weekly-review";
import {
  assembleWeeklyReview,
  hasReviewableWeek,
  lastCompleteWeekRange,
  priorWeekRange,
} from "./weekly-review";
import {
  compareSessionVolumes,
  computeSessionVolumeStats,
  durationMinutesBetween,
  formatSessionVolumeComparison,
  resolveProgramTargets,
} from "./workout";

// --- Ensure default user exists ---

export const ensureDefaultUser = createServerFn({ method: "GET" }).handler(
  async () => ensureDefaultUserRecord(drizzleDb)
);

// --- User ---

export const getUser = createServerFn({ method: "GET" }).handler(async () =>
  ensureDefaultUserRecord(drizzleDb)
);

export const updateUser = createServerFn({ method: "POST" })
  .validator((profileUpdate: UserProfileUpdate) => profileUpdate)
  .handler(async (ctx) => {
    const user = await getUser();
    const hasChanges = Object.values(ctx.data).some(
      (fieldValue) => fieldValue !== undefined
    );
    if (!hasChanges) {
      return user;
    }
    return updateUserRecord(drizzleDb, user.id, ctx.data);
  });

// --- Body Logs ---

export const getBodyLogs = createServerFn({ method: "GET" })
  .validator((query: { limit?: number }) => query)
  .handler(async (ctx) => {
    const user = await getUser();
    return listBodyLogRecords(drizzleDb, user.id, ctx.data?.limit || 90);
  });

export const logBodyweight = createServerFn({ method: "POST" })
  .validator(
    (input: {
      weight_kg: number;
      body_fat_pct?: number;
      notes?: string;
      date?: string;
    }) => input
  )
  .handler(async (ctx) => {
    const user = await getUser();
    return upsertBodyweightRecord(drizzleDb, user.id, {
      bodyFatPct: ctx.data.body_fat_pct,
      date: ctx.data.date || todayString(),
      notes: ctx.data.notes,
      weightKg: ctx.data.weight_kg,
    });
  });

export const getLatestBodyweight = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await getUser();
    return findLatestBodyweightRecord(drizzleDb, user.id);
  }
);

// --- Calculated Targets ---
export type DailyTargets = MacroTargets & {
  weightKg: number;
  bmr: number;
  tdee: number;
  age: number;
};

export const getDailyTargets = createServerFn({ method: "GET" }).handler(
  async (): Promise<DailyTargets> => {
    const user = await getUser();
    const bodyweight = await getLatestBodyweight();
    const weightKg = bodyweight?.weightKg || 75;

    let bmr = 0;
    let tdee = 0;
    let age = 30;

    if (user.birthDate) {
      age = calculateAge(user.birthDate);
    }
    if (user.heightCm) {
      bmr = calculateBMR(weightKg, user.heightCm, age, user.sex);
      tdee = calculateTDEE(bmr, user.activityLevel);
    }

    const macros = calculateMacroTargets(weightKg, tdee, user.goalType);

    return { age, bmr: Math.round(bmr), tdee, weightKg, ...macros };
  }
);

function toLegacyFoodRecord(food: FoodRecord): Food {
  return {
    barcode: food.barcode,
    brand: food.brand,
    calories_per_serving: food.caloriesPerServing,
    carbs_g: food.carbsG,
    created_at: food.createdAt,
    fat_g: food.fatG,
    fiber_g: food.fiberG,
    id: food.id,
    name: food.name,
    protein_g: food.proteinG,
    serving_size: food.servingSize,
    serving_unit: food.servingUnit,
    sodium_mg: food.sodiumMg,
    source: food.source,
    sugar_g: food.sugarG,
  };
}

function toLegacyFoodLogEntry(entry: FoodLogRecord): FoodLogEntry {
  return {
    calories: entry.calories,
    carbs_g: entry.carbsG,
    created_at: entry.createdAt,
    custom_name: entry.customName,
    date: entry.date,
    fat_g: entry.fatG,
    food_id: entry.foodId,
    id: entry.id,
    meal_type: entry.mealType,
    notes: entry.notes,
    protein_g: entry.proteinG,
    servings: entry.servings,
    user_id: entry.userId,
  };
}

// --- Foods ---

export const searchFoods = createServerFn({ method: "GET" })
  .validator((data: { query: string; limit?: number }) => data)
  .handler(async (ctx) => {
    const records = await searchFoodRecords(
      drizzleDb,
      ctx.data.query,
      ctx.data.limit || 20
    );
    return records.map(toLegacyFoodRecord);
  });

export const getAllFoods = createServerFn({ method: "GET" })
  .validator((data: { limit?: number } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const records = await listFoodRecords(drizzleDb, ctx.data?.limit || 100);
    return records.map(toLegacyFoodRecord);
  });

/** Resolve a scanned GTIN against foods the user has logged before (issue #58). */
export const getFoodByBarcode = createServerFn({ method: "GET" })
  .validator((data: { barcode: string }) => data)
  .handler(async (ctx) => {
    const normalized = normalizeBarcode(ctx.data.barcode);
    if (!normalized) {
      return null;
    }
    const record = await drizzleDb.query.foods.findFirst({
      where: inArray(foods.barcode, barcodeLookupVariants(normalized)),
    });
    return record ? toLegacyFoodRecord(record) : null;
  });

export const addFood = createServerFn({ method: "POST" })
  .validator(
    (data: Omit<Food, "id" | "created_at" | "source"> & { source?: string }) =>
      data
  )
  .handler(async (ctx) => {
    const food = ctx.data;
    const record = await insertFoodRecord(drizzleDb, {
      barcode: food.barcode ?? null,
      brand: food.brand,
      caloriesPerServing: food.calories_per_serving,
      carbsG: food.carbs_g,
      fatG: food.fat_g,
      fiberG: food.fiber_g,
      name: food.name,
      proteinG: food.protein_g,
      servingSize: food.serving_size,
      servingUnit: food.serving_unit,
      sodiumMg: food.sodium_mg,
      source: food.source || "user",
      sugarG: food.sugar_g,
    });
    return toLegacyFoodRecord(record);
  });

export type LoggedFoodSummary = Food & {
  last_servings: number;
  last_meal_type: MealType;
  log_count?: number;
};

export interface FoodLogStats {
  food_id: number;
  last_meal_type: MealType;
  last_servings: number;
  log_count: number;
}

/** Shortlist size for the recent/frequent quick-log rows (issue #54). */
const LOGGED_FOOD_SHORTLIST = 20;

/** Trailing window for "frequent", long enough to survive a holiday. */
const FREQUENT_FOOD_WINDOW_DAYS = 90;

function toLegacyLoggedFood(
  record: FoodRecord & {
    lastMealType: MealType;
    lastServings: number;
    logCount?: number;
  }
): LoggedFoodSummary {
  const summary: LoggedFoodSummary = {
    ...toLegacyFoodRecord(record),
    last_meal_type: record.lastMealType,
    last_servings: record.lastServings,
  };
  if (record.logCount !== undefined) {
    summary.log_count = record.logCount;
  }
  return summary;
}

/** Distinct foods ordered by most recent log date (derived, not denormalised). */
export const getRecentFoods = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await ensureDefaultUser();
    const records = await listRecentFoodRecords(
      drizzleDb,
      user.id,
      LOGGED_FOOD_SHORTLIST
    );
    return records.map(toLegacyLoggedFood);
  }
);

/** Distinct foods ordered by log count over the trailing 90 days. */
export const getFrequentFoods = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await ensureDefaultUser();
    // Computed here rather than as SQL date('now', ...) so the window is
    // pinned by the caller's clock and the query stays repeatable in tests.
    const sinceDate = addDays(todayString(), -FREQUENT_FOOD_WINDOW_DAYS);
    const records = await listFrequentFoodRecords(
      drizzleDb,
      user.id,
      sinceDate,
      LOGGED_FOOD_SHORTLIST
    );
    return records.map(toLegacyLoggedFood);
  }
);

/** All-time log counts plus last-used servings/meal for search ranking. */
export const getLoggedFoodStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<FoodLogStats[]> => {
    const user = await ensureDefaultUser();
    const records = await listFoodLogStatsRecords(drizzleDb, user.id);
    // foodId is nullable on the column (quick-add rows carry none), but the
    // query filters those out; this narrows the type without a cast.
    return records.flatMap((record) =>
      record.foodId === null
        ? []
        : [
            {
              food_id: record.foodId,
              last_meal_type: record.lastMealType,
              last_servings: record.lastServings,
              log_count: record.logCount,
            },
          ]
    );
  }
);

// --- Food Log ---

export const getFoodLog = createServerFn({ method: "GET" })
  .validator((data: { date?: string }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const date = ctx.data?.date || todayString();
    const entries = await listFoodLogRecords(drizzleDb, user.id, date);
    return entries.map(toLegacyFoodLogEntry);
  });

export const addFoodLogEntry = createServerFn({ method: "POST" })
  .validator(
    (data: {
      food_id?: number;
      custom_name?: string;
      date?: string;
      meal_type: "breakfast" | "lunch" | "dinner" | "snack";
      servings: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      notes?: string;
    }) => data
  )
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const entry = ctx.data;
    const record = await insertFoodLogRecord(drizzleDb, {
      calories: entry.calories,
      carbsG: entry.carbs_g,
      customName: entry.custom_name ?? null,
      date: entry.date || todayString(),
      fatG: entry.fat_g,
      foodId: entry.food_id ?? null,
      mealType: entry.meal_type,
      notes: entry.notes ?? null,
      proteinG: entry.protein_g,
      servings: entry.servings,
      userId: user.id,
    });
    return toLegacyFoodLogEntry(record);
  });

export const deleteFoodLogEntry = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    await deleteFoodLogRecord(drizzleDb, user.id, ctx.data.id);
    return { success: true };
  });

export const deleteFoodLogEntries = createServerFn({ method: "POST" })
  .validator((data: { ids: number[] }) => data)
  .handler(async (ctx) => {
    const db = getDb();
    const user = await ensureDefaultUser();
    return deleteFoodLogEntriesInDb(db, user.id, ctx.data.ids);
  });

export const copyMealFromDate = createServerFn({ method: "POST" })
  .validator(
    (data: { fromDate: string; toDate: string; mealType: MealType }) => data
  )
  .handler(async (ctx) => {
    const db = getDb();
    const user = await ensureDefaultUser();
    const { fromDate, toDate, mealType } = ctx.data;
    return copyMealEntriesInDb(db, user.id, fromDate, toDate, mealType);
  });

export const copyDayFromDate = createServerFn({ method: "POST" })
  .validator((data: { fromDate: string; toDate: string }) => data)
  .handler(async (ctx) => {
    const db = getDb();
    const user = await ensureDefaultUser();
    const { fromDate, toDate } = ctx.data;
    return copyDayEntriesInDb(db, user.id, fromDate, toDate);
  });

export const logMealTemplate = createServerFn({ method: "POST" })
  .validator(
    (data: { templateId: number; date: string; mealType: MealType }) => data
  )
  .handler(async (ctx) => {
    const db = getDb();
    const user = await ensureDefaultUser();
    const { templateId, date, mealType } = ctx.data;
    return logMealTemplateInDb(db, user.id, templateId, date, mealType);
  });

export const getNutritionSummary = createServerFn({ method: "GET" })
  .validator((data: { date?: string }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const date = ctx.data?.date || todayString();
    const records = await listFoodLogSummaryRecords(drizzleDb, user.id, date);
    const entries = records.map((record) => ({
      ...toLegacyFoodLogEntry(record),
      food_name: record.foodName,
    }));
    return { entries, totals: sumFoodLogEntryTotals(entries) };
  });

// --- Exercises ---

export const getExercises = createServerFn({ method: "GET" })
  .validator((data: { muscle_group?: string } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const records = await listExerciseRecords(
      drizzleDb,
      ctx.data?.muscle_group
    );
    return records.map(toLegacyExercise);
  });

// --- Workouts ---

export const getWorkoutSessions = createServerFn({ method: "GET" })
  .validator(
    (data: { limit?: number; date?: string } | undefined) => data ?? {}
  )
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const records = await listWorkoutSessionRecords(drizzleDb, user.id, {
      date: ctx.data?.date,
      limit: ctx.data?.limit || 30,
    });
    return records.map(toLegacyWorkoutSession);
  });

export const getWorkoutSession = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => findWorkoutSessionWithSets(drizzleDb, ctx.data.id));

export const createWorkoutSession = createServerFn({ method: "POST" })
  .validator(
    (data: {
      name?: string;
      date?: string;
      program_id?: number;
      program_day_id?: number;
    }) => data
  )
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const date = ctx.data.date || todayString();
    const id = await insertWorkoutSessionRecord(drizzleDb, {
      date,
      name: ctx.data.name || "Workout",
      programDayId: ctx.data.program_day_id ?? null,
      programId: ctx.data.program_id ?? null,
      userId: user.id,
    });
    return { id };
  });

export const addWorkoutSet = createServerFn({ method: "POST" })
  .validator(
    (data: {
      session_id: number;
      exercise_id: number;
      set_number: number;
      reps: number;
      weight_kg: number;
      rpe?: number;
      rest_seconds?: number;
      notes?: string;
    }) => data
  )
  .handler(async (ctx) => {
    const d = ctx.data;
    const record = await insertWorkoutSetRecord(drizzleDb, {
      exerciseId: d.exercise_id,
      notes: d.notes ?? null,
      reps: d.reps,
      restSeconds: d.rest_seconds ?? null,
      rpe: d.rpe,
      sessionId: d.session_id,
      setNumber: d.set_number,
      weightKg: d.weight_kg,
    });
    return toLegacyWorkoutSet(record);
  });

export const deleteWorkoutSet = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    await deleteWorkoutSetRecord(drizzleDb, ctx.data.id);
    return { success: true };
  });

export interface WorkoutSessionSummary {
  comparisonSentence: string;
  date: string;
  durationMinutes: number | null;
  exerciseCount: number;
  name: string;
  personalRecordCount: number;
  sessionId: number;
  setCount: number;
  totalVolume: number;
}

async function countSessionPersonalRecords(
  userId: number,
  sets: SessionSetRow[]
): Promise<number> {
  const exerciseIds = [...new Set(sets.map((set) => set.exercise_id))];
  let prSetCount = 0;

  for (const exerciseId of exerciseIds) {
    const chronological = await listExerciseHistoryRows(
      drizzleDb,
      userId,
      exerciseId
    );
    const kindsBySetId = recordKindsBySetId(chronological);
    for (const set of sets) {
      if (set.exercise_id !== exerciseId) {
        continue;
      }
      if ((kindsBySetId.get(set.id) ?? []).length > 0) {
        prSetCount += 1;
      }
    }
  }

  return prSetCount;
}

async function buildWorkoutSessionSummary(
  userId: number,
  session: WorkoutSession
): Promise<WorkoutSessionSummary> {
  const sets = await listSessionSetRows(drizzleDb, session.id);
  const stats = computeSessionVolumeStats(sets);
  const previousSession = await findPreviousNamedSessionRecord(
    drizzleDb,
    userId,
    session
  );
  const previousStats = previousSession
    ? computeSessionVolumeStats(
        await listSessionSetRows(drizzleDb, previousSession.id)
      )
    : null;
  const comparison = compareSessionVolumes(stats, previousStats);

  return {
    comparisonSentence: formatSessionVolumeComparison(
      stats.totalVolume,
      session.name,
      comparison
    ),
    date: session.date,
    durationMinutes: session.duration_minutes,
    exerciseCount: stats.exerciseCount,
    name: session.name ?? "Workout",
    personalRecordCount: await countSessionPersonalRecords(userId, sets),
    sessionId: session.id,
    setCount: stats.setCount,
    totalVolume: stats.totalVolume,
  };
}

export const finishWorkoutSession = createServerFn({ method: "POST" })
  .validator((data: { id: number; finishedAt?: string }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const session = await findWorkoutSessionForUser(
      drizzleDb,
      ctx.data.id,
      user.id
    );

    if (!session) {
      throw new Error(
        `finishWorkoutSession: session id ${ctx.data.id} not found for user ${user.id}`
      );
    }

    const finishedAt = ctx.data.finishedAt ?? new Date().toISOString();
    const durationMinutes = durationMinutesBetween(
      session.created_at,
      finishedAt
    );

    await updateWorkoutSessionDuration(drizzleDb, session.id, durationMinutes);

    return buildWorkoutSessionSummary(user.id, {
      ...session,
      duration_minutes: durationMinutes,
    });
  });

export const getWorkoutSessionSummary = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const session = await findWorkoutSessionForUser(
      drizzleDb,
      ctx.data.id,
      user.id
    );

    if (!session) {
      return null;
    }

    return buildWorkoutSessionSummary(user.id, session);
  });

export interface LastPerformanceResult {
  date: string;
  reps: number;
  rpe: number;
  weight_kg: number;
}

/** Most recent logged set for an exercise before the active session (PRD 10 Batch 1). */
export const getLastPerformance = createServerFn({ method: "GET" })
  .validator(
    (data: { exerciseId: number; excludeSessionId?: number | null }) => data
  )
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    return findLastPerformanceRow(
      drizzleDb,
      user.id,
      ctx.data.exerciseId,
      ctx.data.excludeSessionId ?? null
    );
  });

export interface ExerciseSetHistoryRow {
  id: number;
  reps: number;
  session_id: number;
  weight_kg: number;
}

/** Chronological set history for an exercise — feeds pure PR detection (issue #61). */
export const getExerciseSetHistory = createServerFn({ method: "GET" })
  .validator((data: { exerciseId: number }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const sets = await listExerciseSetHistoryRows(
      drizzleDb,
      user.id,
      ctx.data.exerciseId
    );
    return { sets };
  });

// --- Training Programs ---

export type {
  ProgramDayInput,
  ProgramDayTarget,
  ProgramDetail,
  ProgramExerciseInput,
  ProgramSummary,
} from "../db/program-queries";

export const getPrograms = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await ensureDefaultUser();
    return listProgramSummaries(drizzleDb, user.id);
  }
);

export const getProgram = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    return findProgramDetail(drizzleDb, ctx.data.id, user.id);
  });

export const saveProgram = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id?: number;
      name: string;
      description?: string;
      frequency_per_week: number;
      periodization_type: PeriodizationType;
      progression_increment_pct?: number;
      is_active?: boolean;
      days: ProgramDayInput[];
    }) => data
  )
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const programId = await saveProgramRecord(
      drizzleDb,
      user.id,
      ctx.data satisfies SaveProgramInput
    );
    return findProgramDetail(drizzleDb, programId, user.id);
  });

export const deleteProgram = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    await deleteProgramRecord(drizzleDb, ctx.data.id, user.id);
    return { success: true };
  });

export const setActiveProgram = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    await setActiveProgramRecord(drizzleDb, ctx.data.id, user.id);
    return { success: true };
  });

export const getProgramDayTargets = createServerFn({ method: "GET" })
  .validator((data: { programId: number; programDayId: number }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const context = await findProgramDayContext(
      drizzleDb,
      ctx.data.programId,
      ctx.data.programDayId,
      user.id
    );
    if (!context) {
      return null;
    }

    const { day, exercises, program } = context;
    const targets: ProgramDayTarget[] = [];

    for (const exercise of exercises) {
      const lastSet = await findLastProgramExerciseSet(
        drizzleDb,
        user.id,
        program.id,
        exercise.exercise_id
      );

      const prescription = {
        rest_seconds: exercise.rest_seconds,
        target_reps: exercise.target_reps ?? "8-12",
        target_rpe: exercise.target_rpe ?? 8,
        target_sets: exercise.target_sets ?? 3,
      };

      const resolved = resolveProgramTargets(
        program.periodization_type,
        prescription,
        lastSet
          ? {
              reps: lastSet.reps,
              rpe: lastSet.rpe,
              weight_kg: lastSet.weight_kg,
            }
          : null,
        program.progression_increment_pct
      );

      targets.push({
        dup_emphasis: resolved.dup_emphasis,
        exercise_id: exercise.exercise_id,
        exercise_name: exercise.exercise_name,
        muscle_group: exercise.muscle_group,
        program_exercise_id: exercise.id,
        progression_note: resolved.progression_note,
        rest_seconds: exercise.rest_seconds,
        suggested_weight_kg: resolved.suggested_weight_kg,
        target_reps: prescription.target_reps,
        target_rpe: prescription.target_rpe,
        target_sets: prescription.target_sets,
      });
    }

    return {
      day,
      program,
      targets,
    };
  });

export const startWorkoutFromProgram = createServerFn({ method: "POST" })
  .validator((data: { programId: number; programDayId: number }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const day = await findProgramDayRecord(
      drizzleDb,
      ctx.data.programDayId,
      ctx.data.programId
    );
    if (!day) {
      throw new Error("Program day not found");
    }

    const date = todayString();
    const sessionId = await insertWorkoutSessionRecord(drizzleDb, {
      date,
      name: day.day_name,
      programDayId: ctx.data.programDayId,
      programId: ctx.data.programId,
      userId: user.id,
    });

    const dayTargets = await getProgramDayTargets({
      data: {
        programDayId: ctx.data.programDayId,
        programId: ctx.data.programId,
      },
    });

    return {
      dayName: day.day_name,
      sessionId,
      targets: dayTargets?.targets ?? [],
    };
  });

// --- Meal Templates & Planning ---

export type {
  MealTemplateDetail,
  MealTemplateItemInput,
  MealTemplateSummary,
} from "../db/meal-plan-queries";

export interface MealPlanSlot {
  date: string;
  macros: NutritionTotals;
  meal_type: MealType;
  plan_id: number | null;
  template_id: number | null;
  template_name: string | null;
}

export interface WeekMealPlan {
  days: {
    date: string;
    day_label: string;
    slots: MealPlanSlot[];
    day_totals: NutritionTotals;
  }[];
  end_date: string;
  start_date: string;
  targets: Awaited<ReturnType<typeof getDailyTargets>>;
  week_totals: NutritionTotals;
}

export const getMealTemplates = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await ensureDefaultUser();
    return listMealTemplateSummaries(drizzleDb, user.id);
  }
);

export const getMealTemplate = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    return findMealTemplateDetail(drizzleDb, ctx.data.id, user.id);
  });

export const saveMealTemplate = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id?: number;
      name: string;
      description?: string;
      default_meal_type: MealType;
      items: MealTemplateItemInput[];
    }) => data
  )
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const templateId = await saveMealTemplateRecord(
      drizzleDb,
      user.id,
      ctx.data
    );
    return findMealTemplateDetail(drizzleDb, templateId, user.id);
  });

export const deleteMealTemplate = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    await deleteMealTemplateRecord(drizzleDb, ctx.data.id, user.id);
    return { success: true };
  });

export const getWeekMealPlan = createServerFn({ method: "GET" })
  .validator((data: { start_date?: string } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const startDate = getWeekStart(ctx.data?.start_date || todayString());
    const endDate = addDays(startDate, 6);
    const targets = await getDailyTargets();

    const plans = await listMealPlansForWeek(
      drizzleDb,
      user.id,
      startDate,
      endDate
    );

    const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
    const days = [];
    let weekTotals = emptyTotals();

    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(startDate, offset);
      const slots: MealPlanSlot[] = [];
      let dayTotals = emptyTotals();

      for (const mealType of mealTypes) {
        const plan = plans.find(
          (entry) => entry.date === date && entry.meal_type === mealType
        );
        const macros = plan
          ? await templateMacroTotals(drizzleDb, plan.template_id)
          : emptyTotals();
        dayTotals = sumNutritionTotals([dayTotals, macros]);
        slots.push({
          date,
          macros,
          meal_type: mealType,
          plan_id: plan?.id ?? null,
          template_id: plan?.template_id ?? null,
          template_name: plan?.template_name ?? null,
        });
      }

      weekTotals = sumNutritionTotals([weekTotals, dayTotals]);
      days.push({
        date,
        day_label: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
          weekday: "short",
        }),
        day_totals: dayTotals,
        slots,
      });
    }

    return {
      days,
      end_date: endDate,
      start_date: startDate,
      targets,
      week_totals: weekTotals,
    } satisfies WeekMealPlan;
  });

export const setMealPlan = createServerFn({ method: "POST" })
  .validator(
    (data: { date: string; meal_type: MealType; template_id: number }) => data
  )
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    await upsertMealPlanRecord(drizzleDb, user.id, ctx.data);
    return { success: true };
  });

export const clearMealPlan = createServerFn({ method: "POST" })
  .validator((data: { date: string; meal_type: MealType }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    await deleteMealPlanRecord(
      drizzleDb,
      user.id,
      ctx.data.date,
      ctx.data.meal_type
    );
    return { success: true };
  });

export const logMealFromPlan = createServerFn({ method: "POST" })
  .validator((data: { date: string; meal_type: MealType }) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const plan = await findMealPlanRecord(
      drizzleDb,
      user.id,
      ctx.data.date,
      ctx.data.meal_type
    );

    if (!plan) {
      throw new Error("No meal planned for this slot");
    }

    const template = await findMealTemplateDetail(
      drizzleDb,
      plan.template_id,
      user.id
    );
    if (!template) {
      throw new Error("Meal template not found");
    }

    const logged = template.items.map((item) => {
      const macros = calculateFoodMacros(item, item.servings);
      const record = drizzleDb
        .insert(foodLog)
        .values({
          calories: macros.calories,
          carbsG: macros.carbs_g,
          date: ctx.data.date,
          fatG: macros.fat_g,
          foodId: item.food_id,
          mealType: ctx.data.meal_type,
          notes: `From template: ${template.name}`,
          proteinG: macros.protein_g,
          servings: item.servings,
          userId: user.id,
        })
        .returning()
        .get();
      return toLegacyFoodLogEntry(record);
    });

    return { entries: logged, template_name: template.name };
  });

// --- Weekly Volume Analysis ---
// Based on Schoenfeld et al. 2017: 10-20 sets per muscle group per week for hypertrophy

export interface MuscleVolume {
  max_recommended: number;
  min_recommended: number;
  muscle_group: string;
  status: "under" | "optimal" | "high";
  total_sets: number;
  total_volume: number;
}

export const getWeeklyVolume = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await ensureDefaultUser();
    const rows = await listWeeklyVolumeRows(drizzleDb, user.id);

    const guidelines: Record<string, { min: number; max: number }> = {
      arms: { max: 16, min: 8 },
      back: { max: 20, min: 10 },
      chest: { max: 16, min: 8 },
      core: { max: 16, min: 8 },
      full_body: { max: 20, min: 10 },
      legs: { max: 20, min: 10 },
      shoulders: { max: 16, min: 8 },
    };

    return rows.map((row) => {
      const g = guidelines[row.muscle_group] || { max: 16, min: 8 };
      const status: MuscleVolume["status"] =
        row.total_sets < g.min
          ? "under"
          : row.total_sets > g.max
            ? "high"
            : "optimal";
      return {
        ...row,
        max_recommended: g.max,
        min_recommended: g.min,
        status,
      };
    });
  }
);

// --- Weekly Nutrition Reports ---

export interface WeeklyNutritionDay {
  calories: number;
  carbs_g: number;
  date: string;
  entries: number;
  fat_g: number;
  protein_g: number;
}

export interface WeeklyNutritionReport {
  avg: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  daily: WeeklyNutritionDay[];
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    days: number;
  };
}

export const getWeeklyNutrition = createServerFn({ method: "GET" }).handler(
  async (): Promise<WeeklyNutritionReport> => {
    const user = await ensureDefaultUser();
    const sinceDate = addDays(todayString(), -7);
    const records = await listWeeklyNutritionRows(
      drizzleDb,
      user.id,
      sinceDate
    );
    const daily = records.map((record) => ({
      calories: record.calories,
      carbs_g: record.carbsG,
      date: record.date,
      entries: record.entries,
      fat_g: record.fatG,
      protein_g: record.proteinG,
    }));
    const totals = daily.reduce(
      (acc, row) => ({
        calories: acc.calories + row.calories,
        carbs_g: acc.carbs_g + row.carbs_g,
        days: acc.days + 1,
        fat_g: acc.fat_g + row.fat_g,
        protein_g: acc.protein_g + row.protein_g,
      }),
      { calories: 0, carbs_g: 0, days: 0, fat_g: 0, protein_g: 0 }
    );
    const divisor = totals.days || 1;
    const avg = {
      calories: Math.round(totals.calories / divisor),
      carbs_g: Math.round(totals.carbs_g / divisor),
      fat_g: Math.round(totals.fat_g / divisor),
      protein_g: Math.round(totals.protein_g / divisor),
    };
    return { avg, daily, totals };
  }
);

// --- Progress Highlights (PRD 06 Batch 4 / issue #33) ---

export interface ProgressHighlights {
  /** Heaviest lift logged this month, with exercise name. */
  bestLift: { exercise: string; weightKg: number; reps: number } | null;
  /** Total volume (kg) lifted this calendar month. */
  monthlyVolumeKg: number;
  /** Consecutive days with at least one workout, counting back from today. */
  workoutStreak: number;
}

/**
 * Aggregated highlights for the progress page storytelling cards.
 *
 * Best lift is the single heaviest weight moved this month (any rep count).
 * Monthly volume sums all weight × reps for sets in the calendar month.
 * Streak counts consecutive calendar days with at least one workout session,
 * starting from today and moving backward.
 */
export const getProgressHighlights = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProgressHighlights> => {
    const db = getDb();
    const user = await ensureDefaultUser();
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // Best lift this month
    const bestLiftRow = db
      .prepare(
        `SELECT e.name AS exercise, ws.weight_kg, ws.reps
     FROM workout_sets ws
     JOIN exercises e ON ws.exercise_id = e.id
     JOIN workout_sessions wse ON ws.session_id = wse.id
     WHERE wse.user_id = ? AND wse.date >= ?
       AND ws.weight_kg IS NOT NULL
     ORDER BY ws.weight_kg DESC
     LIMIT 1`
      )
      .get(user.id, monthStart) as
      | { exercise: string; weight_kg: number; reps: number }
      | undefined;

    const bestLift = bestLiftRow
      ? {
          exercise: bestLiftRow.exercise,
          reps: bestLiftRow.reps,
          weightKg: bestLiftRow.weight_kg,
        }
      : null;

    // Monthly volume
    const volumeRow = db
      .prepare(
        `SELECT COALESCE(SUM(ws.reps * ws.weight_kg), 0) AS total
     FROM workout_sets ws
     JOIN workout_sessions wse ON ws.session_id = wse.id
     WHERE wse.user_id = ? AND wse.date >= ?`
      )
      .get(user.id, monthStart) as { total: number };

    // Workout streak: count consecutive days with sessions back from today
    const today = now.toISOString().slice(0, 10);
    const streakRow = db
      .prepare(
        `SELECT date
     FROM workout_sessions
     WHERE user_id = ? AND date <= ?
     GROUP BY date
     ORDER BY date DESC
     LIMIT 90`
      )
      .all(user.id, today) as { date: string }[];

    let streak = 0;
    const streakDates = new Set(streakRow.map((r) => r.date));
    // Walk backwards from today, counting consecutive days with workouts
    const checkDate = new Date(now);
    while (true) {
      const d = checkDate.toISOString().slice(0, 10);
      if (streakDates.has(d)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // Also check yesterday in case today hasn't had a workout yet
        if (streak === 0 && d === today) {
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      }
    }

    return {
      bestLift,
      monthlyVolumeKg: Math.round(volumeRow.total),
      workoutStreak: streak,
    };
  }
);

// --- Data Export ---

export const exportData = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await ensureDefaultUser();
    const [nutritionRecords, trainingRecords] = await Promise.all([
      exportNutritionRecords(drizzleDb, user.id),
      exportTrainingRecords(drizzleDb, user.id),
    ]);
    return {
      app: "FitTrack",
      exported_at: new Date().toISOString(),
      ...nutritionRecords,
      ...trainingRecords,
      user: { ...user },
      version: "0.1.0",
    };
  }
);

/**
 * Import previously exported FitTrack data.
 * Inserts all records into the current user's database, preserving original
 * dates and IDs to avoid conflicts. Uses a transaction for atomicity.
 */
export const importData = createServerFn({ method: "POST" })
  .validator(
    (data: {
      body_logs?: BodyLogRecord[];
      food_log?: FoodLogEntry[];
      workouts?: WorkoutSession[];
      workout_sets?: WorkoutSet[];
      programs?: Program[];
      program_days?: ProgramDay[];
      program_exercises?: ProgramExercise[];
    }) => data
  )
  .handler(async (ctx) => {
    const db = getDb();
    const user = await ensureDefaultUser();

    const importAll = db.transaction(() => {
      const rows = {
        bodyLogs: 0,
        days: 0,
        exercises: 0,
        foodLog: 0,
        programs: 0,
        sets: 0,
        workouts: 0,
      };

      if (ctx.data.body_logs?.length) {
        for (const record of ctx.data.body_logs) {
          drizzleDb
            .insert(bodyLogs)
            .values({ ...record, userId: user.id })
            .onConflictDoUpdate({
              set: {
                bodyFatPct: record.bodyFatPct,
                createdAt: record.createdAt,
                muscleMassKg: record.muscleMassKg,
                notes: record.notes,
                waistCm: record.waistCm,
                weightKg: record.weightKg,
              },
              target: [bodyLogs.userId, bodyLogs.date],
            })
            .run();
          rows.bodyLogs++;
        }
      }

      if (ctx.data.food_log?.length) {
        const insert = db.prepare(
          `INSERT OR REPLACE INTO food_log (id, user_id, food_id, custom_name, date, meal_type, servings, calories, protein_g, carbs_g, fat_g, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const r of ctx.data.food_log) {
          insert.run(
            r.id,
            user.id,
            r.food_id,
            r.custom_name,
            r.date,
            r.meal_type,
            r.servings,
            r.calories,
            r.protein_g,
            r.carbs_g,
            r.fat_g,
            r.notes,
            r.created_at
          );
          rows.foodLog++;
        }
      }

      if (ctx.data.workouts?.length) {
        const insert = db.prepare(
          `INSERT OR REPLACE INTO workout_sessions (id, user_id, date, name, duration_minutes, notes, program_id, program_day_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const r of ctx.data.workouts) {
          insert.run(
            r.id,
            user.id,
            r.date,
            r.name,
            r.duration_minutes,
            r.notes,
            r.program_id,
            r.program_day_id,
            r.created_at
          );
          rows.workouts++;
        }
      }

      if (ctx.data.workout_sets?.length) {
        const insert = db.prepare(
          `INSERT OR REPLACE INTO workout_sets (id, session_id, exercise_id, set_number, reps, weight_kg, rpe, rest_seconds, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const r of ctx.data.workout_sets) {
          insert.run(
            r.id,
            r.session_id,
            r.exercise_id,
            r.set_number,
            r.reps,
            r.weight_kg,
            r.rpe,
            r.rest_seconds,
            r.notes,
            r.created_at
          );
          rows.sets++;
        }
      }

      if (ctx.data.programs?.length) {
        const insert = db.prepare(
          `INSERT OR REPLACE INTO programs (id, user_id, name, description, frequency_per_week, periodization_type, progression_increment_pct, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const r of ctx.data.programs) {
          insert.run(
            r.id,
            user.id,
            r.name,
            r.description,
            r.frequency_per_week,
            r.periodization_type,
            r.progression_increment_pct,
            r.is_active,
            r.created_at
          );
          rows.programs++;
        }
      }

      if (ctx.data.program_days?.length) {
        const insert = db.prepare(
          `INSERT OR REPLACE INTO program_days (id, program_id, day_name, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?)`
        );
        for (const r of ctx.data.program_days) {
          insert.run(
            r.id,
            r.program_id,
            r.day_name,
            r.sort_order,
            r.created_at
          );
          rows.days++;
        }
      }

      if (ctx.data.program_exercises?.length) {
        const insert = db.prepare(
          `INSERT OR REPLACE INTO program_exercises (id, program_day_id, exercise_id, target_sets, target_reps, target_rpe, rest_seconds, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const r of ctx.data.program_exercises) {
          insert.run(
            r.id,
            r.program_day_id,
            r.exercise_id,
            r.target_sets,
            r.target_reps,
            r.target_rpe,
            r.rest_seconds,
            r.sort_order,
            r.created_at
          );
          rows.exercises++;
        }
      }

      return rows;
    });

    const result = importAll();
    return { success: true, ...result };
  });

// --- Dashboard Stats ---

export const getDashboardStats = createServerFn({ method: "GET" }).handler(
  async () => {
    const db = getDb();
    const user = await getUser();
    const targets = await getDailyTargets();

    const today = todayString();
    const todayEntries = (
      await listFoodLogRecords(drizzleDb, user.id, today)
    ).map(toLegacyFoodLogEntry);

    const consumed = todayEntries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.calories,
        carbs_g: acc.carbs_g + e.carbs_g,
        fat_g: acc.fat_g + e.fat_g,
        protein_g: acc.protein_g + e.protein_g,
      }),
      { calories: 0, carbs_g: 0, fat_g: 0, protein_g: 0 }
    );

    const last30Days = db
      .prepare(
        `SELECT DISTINCT date FROM workout_sessions WHERE user_id = ? AND date >= date('now', '-30 days')`
      )
      .all(user.id) as { date: string }[];

    const recentBodyweight = await drizzleDb.query.bodyLogs.findMany({
      limit: 30,
      orderBy: desc(bodyLogs.date),
      where: and(eq(bodyLogs.userId, user.id), isNotNull(bodyLogs.weightKg)),
    });

    return {
      consumed,
      recentBodyweight,
      remaining: {
        calories: targets.calories - consumed.calories,
        carbs_g: targets.carbs_g - consumed.carbs_g,
        fat_g: targets.fat_g - consumed.fat_g,
        protein_g: targets.protein_g - consumed.protein_g,
      },
      targets,
      user,
      workoutDaysThisMonth: last30Days.length,
    };
  }
);

// --- Consistency ---

/** Burke et al. 2011: rolling adherence and streak metrics for retention. */
export const getConsistency = createServerFn({ method: "GET" })
  .validator((data: { asOf?: string } | undefined) => data ?? {})
  .handler(async (ctx): Promise<ConsistencyMetrics> => {
    const db = getDb();
    const user = await ensureDefaultUser();
    const asOf = ctx.data.asOf ?? todayString();
    const windowStart = addDays(asOf, -27);

    const rows = db
      .prepare(
        "SELECT DISTINCT date FROM food_log WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date"
      )
      .all(user.id, windowStart, asOf) as { date: string }[];

    return assembleConsistencyMetrics(
      rows.map((row) => row.date),
      asOf
    );
  });

// --- Weekly Review (issue #64) ---

export type WeeklyReview = WeeklyReviewPayload;

async function collectActivityDates(
  db: ReturnType<typeof getDb>,
  userId: number
): Promise<string[]> {
  const foodDates = db
    .prepare("SELECT DISTINCT date FROM food_log WHERE user_id = ?")
    .all(userId) as { date: string }[];
  const sessionDates = db
    .prepare("SELECT DISTINCT date FROM workout_sessions WHERE user_id = ?")
    .all(userId) as { date: string }[];
  const bodyDates = await drizzleDb.query.bodyLogs.findMany({
    columns: { date: true },
    where: and(eq(bodyLogs.userId, userId), isNotNull(bodyLogs.weightKg)),
  });

  return [...foodDates, ...sessionDates, ...bodyDates].map((row) => row.date);
}

async function countPersonalRecordsInRange(
  userId: number,
  range: { start: string; end: string }
): Promise<number> {
  const sets = await drizzleDb
    .select({
      exercise_id: workoutSets.exerciseId,
      id: workoutSets.id,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, range.start),
        lte(workoutSessions.date, range.end),
        isNotNull(workoutSets.weightKg),
        isNotNull(workoutSets.reps)
      )
    )
    .orderBy(asc(workoutSessions.date), asc(workoutSets.id));

  const exerciseIds = [...new Set(sets.map((set) => set.exercise_id))];
  let prCount = 0;

  for (const exerciseId of exerciseIds) {
    const history = await listExerciseHistoryRows(
      drizzleDb,
      userId,
      exerciseId
    );
    const kindsBySetId = recordKindsBySetId(history);
    for (const set of sets) {
      if (set.exercise_id !== exerciseId) {
        continue;
      }
      if ((kindsBySetId.get(set.id) ?? []).length > 0) {
        prCount += 1;
      }
    }
  }

  return prCount;
}

async function loadWeeklyReviewFromDb(
  db: ReturnType<typeof getDb>,
  userId: number,
  asOf: string,
  calorieTarget: number,
  proteinTargetG: number
): Promise<WeeklyReview | null> {
  const week = lastCompleteWeekRange(asOf);
  const prior = priorWeekRange(week);
  const bodyLogStart = addDays(week.start, -6);

  const foodRows = db
    .prepare(
      `SELECT date,
              SUM(calories) AS calories,
              SUM(protein_g) AS protein_g
       FROM food_log
       WHERE user_id = ? AND date >= ? AND date <= ?
       GROUP BY date`
    )
    .all(userId, prior.start, week.end) as {
    date: string;
    calories: number;
    protein_g: number;
  }[];

  const dailyNutrition = new Map(
    foodRows.map((row) => [
      row.date,
      { calories: row.calories, protein_g: row.protein_g },
    ])
  );

  const setRows = db
    .prepare(
      `SELECT ws.exercise_id, ws.reps, ws.weight_kg, wse.date
       FROM workout_sets ws
       JOIN workout_sessions wse ON ws.session_id = wse.id
       WHERE wse.user_id = ? AND wse.date >= ? AND wse.date <= ?`
    )
    .all(userId, prior.start, week.end) as {
    exercise_id: number;
    reps: number | null;
    weight_kg: number | null;
    date: string;
  }[];

  const sessionDates = (
    db
      .prepare(
        `SELECT DISTINCT date FROM workout_sessions
         WHERE user_id = ? AND date >= ? AND date <= ?`
      )
      .all(userId, prior.start, week.end) as { date: string }[]
  ).map((row) => row.date);

  const weeklyBodyLogs = await drizzleDb.query.bodyLogs.findMany({
    orderBy: asc(bodyLogs.date),
    where: and(
      eq(bodyLogs.userId, userId),
      gte(bodyLogs.date, bodyLogStart),
      lte(bodyLogs.date, week.end)
    ),
  });

  const personalRecordCount = await countPersonalRecordsInRange(userId, week);

  return assembleWeeklyReview({
    asOf,
    bodyLogs: weeklyBodyLogs,
    calorieTarget,
    dailyNutrition,
    personalRecordCount,
    proteinTargetG,
    sessionDates,
    workoutSets: setRows,
  });
}

/** Whether the dashboard should link to the weekly review (issue #64). */
export const getWeeklyReviewAvailability = createServerFn({ method: "GET" })
  .validator((data: { asOf?: string } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const db = getDb();
    const user = await getUser();
    const asOf = ctx.data.asOf ?? todayString();
    const activityDates = await collectActivityDates(db, user.id);
    return { available: hasReviewableWeek(asOf, activityDates) };
  });

/** Last complete week's review metrics and headline (issue #64). */
export const getWeeklyReview = createServerFn({ method: "GET" })
  .validator((data: { asOf?: string } | undefined) => data ?? {})
  .handler(async (ctx): Promise<WeeklyReview | null> => {
    const db = getDb();
    const user = await getUser();
    const asOf = ctx.data.asOf ?? todayString();
    const targets = await getDailyTargets();
    return loadWeeklyReviewFromDb(
      db,
      user.id,
      asOf,
      targets.calories,
      targets.protein_g
    );
  });

// --- Offline Support ---

/**
 * Days of history sent to a device for offline use. Covers the trailing 7-day
 * windows that the volume and nutrition reports read from, with a week of slack
 * so a device that has been offline for several days can still render its own
 * recent history without a round trip.
 */
const OFFLINE_HISTORY_DAYS = 14;

/**
 * Everything the app needs to stay useful with no network: the full food and
 * exercise reference data, plus the user's recent logs and current targets.
 * The client stores this in IndexedDB and the service worker keeps a copy of
 * the response, so a cold start offline still has data to render.
 */
export const getOfflineBundle = createServerFn({ method: "GET" }).handler(
  async () => {
    const db = getDb();
    const user = await ensureDefaultUser();
    const targets = await getDailyTargets();
    const sinceDate = addDays(todayString(), -OFFLINE_HISTORY_DAYS);
    const since = `-${OFFLINE_HISTORY_DAYS} days`;
    const exercises = await getExercises();
    const foodRecords = await drizzleDb.query.foods.findMany({
      orderBy: asc(foods.name),
    });
    const foodsCatalog = foodRecords.map(toLegacyFoodRecord);
    const foodLogRecords = await drizzleDb.query.foodLog.findMany({
      orderBy: [desc(foodLog.date), asc(foodLog.mealType)],
      where: and(eq(foodLog.userId, user.id), gte(foodLog.date, sinceDate)),
    });
    const recentFoodLog = foodLogRecords.map(toLegacyFoodLogEntry);

    const workout_sessions = db
      .prepare(
        `SELECT * FROM workout_sessions
     WHERE user_id = ? AND date >= date('now', ?)
     ORDER BY date DESC`
      )
      .all(user.id, since) as WorkoutSession[];

    const workout_sets = db
      .prepare(
        `SELECT ws.* FROM workout_sets ws
     JOIN workout_sessions wse ON ws.session_id = wse.id
     WHERE wse.user_id = ? AND wse.date >= date('now', ?)
     ORDER BY ws.session_id, ws.set_number`
      )
      .all(user.id, since) as WorkoutSet[];

    const body_logs = await listBodyLogRecords(drizzleDb, user.id, 90);

    return {
      body_logs,
      exercises,
      food_log: recentFoodLog,
      foods: foodsCatalog,
      generated_at: new Date().toISOString(),
      history_days: OFFLINE_HISTORY_DAYS,
      targets,
      user,
      workout_sessions,
      workout_sets,
    };
  }
);

/**
 * Replay mutations a device recorded while offline.
 *
 * Ordering matters: entries arrive oldest-first so a workout session created
 * offline is inserted before the sets that reference it. Each entry is applied
 * in its own transaction alongside its sync_queue row, so one bad mutation
 * fails on its own instead of discarding the rest of the batch.
 */
export const syncQueuedMutations = createServerFn({ method: "POST" })
  .validator((data: { mutations: QueuedMutation[] }) => data)
  .handler(async (ctx): Promise<SyncResult> => {
    const db = getDb();
    const user = await ensureDefaultUser();
    const mutations = ctx.data?.mutations ?? [];

    const findApplied = db.prepare(
      `SELECT result_id FROM sync_queue WHERE client_id = ? AND status = 'applied'`
    );
    const findByTempRef = db.prepare(
      `SELECT result_id FROM sync_queue WHERE temp_ref = ? AND status = 'applied'`
    );
    const recordOutcome = db.prepare(
      `INSERT INTO sync_queue (client_id, kind, payload, temp_ref, result_id, status, error, queued_at)
       VALUES (@client_id, @kind, @payload, @temp_ref, @result_id, @status, @error, @queued_at)
       ON CONFLICT(client_id) DO UPDATE SET
         result_id = excluded.result_id,
         status = excluded.status,
         error = excluded.error,
         applied_at = datetime('now')`
    );

    // Sessions created earlier in this same batch, keyed by their device-side
    // placeholder id. Falls back to sync_queue when the session was created in
    // an earlier batch that already landed.
    const sessionIds = new Map<string, number>();

    const resolveSessionId = (
      m: Extract<QueuedMutation, { kind: "addWorkoutSet" }>
    ): number => {
      if (typeof m.payload.session_id === "number") {
        return m.payload.session_id;
      }
      const ref = m.payload.session_temp_ref;
      if (!ref) {
        throw new Error(
          "workout set is missing both session_id and session_temp_ref"
        );
      }
      const inBatch = sessionIds.get(ref);
      if (inBatch) {
        return inBatch;
      }
      const stored = findByTempRef.get(ref) as
        | { result_id: number | null }
        | undefined;
      if (!stored?.result_id) {
        throw new Error(`unknown workout session reference "${ref}"`);
      }
      return stored.result_id;
    };

    const apply = (m: QueuedMutation): number | undefined => {
      switch (m.kind) {
        case "addFoodLogEntry": {
          const d = m.payload;
          const res = db
            .prepare(
              `INSERT INTO food_log (user_id, food_id, custom_name, date, meal_type, servings, calories, protein_g, carbs_g, fat_g, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              user.id,
              d.food_id ?? null,
              d.custom_name ?? null,
              d.date || todayString(),
              d.meal_type,
              d.servings,
              d.calories,
              d.protein_g,
              d.carbs_g,
              d.fat_g,
              d.notes ?? null
            );
          return res.lastInsertRowid as number;
        }
        case "deleteFoodLogEntry": {
          db.prepare("DELETE FROM food_log WHERE id = ? AND user_id = ?").run(
            m.payload.id,
            user.id
          );
          return m.payload.id;
        }
        case "deleteFoodLogEntries": {
          deleteFoodLogEntriesInDb(db, user.id, m.payload.ids);
          return m.payload.ids[0];
        }
        case "copyMealFromDate": {
          const d = m.payload;
          const result = copyMealEntriesInDb(
            db,
            user.id,
            d.fromDate,
            d.toDate,
            d.mealType
          );
          return result.entries[0]?.id;
        }
        case "copyDayFromDate": {
          const d = m.payload;
          const result = copyDayEntriesInDb(db, user.id, d.fromDate, d.toDate);
          return result.entries[0]?.id;
        }
        case "logMealTemplate": {
          const d = m.payload;
          const result = logMealTemplateInDb(
            db,
            user.id,
            d.templateId,
            d.date,
            d.mealType
          );
          return result.entries[0]?.id;
        }
        case "logBodyweight": {
          const d = m.payload;
          const date = d.date || todayString();
          const record = drizzleDb
            .insert(bodyLogs)
            .values({
              bodyFatPct: d.body_fat_pct ?? null,
              date,
              notes: d.notes ?? null,
              userId: user.id,
              weightKg: d.weight_kg,
            })
            .onConflictDoUpdate({
              set: {
                bodyFatPct: sql`coalesce(excluded.body_fat_pct, ${bodyLogs.bodyFatPct})`,
                notes: sql`excluded.notes`,
                weightKg: sql`excluded.weight_kg`,
              },
              target: [bodyLogs.userId, bodyLogs.date],
            })
            .returning({ id: bodyLogs.id })
            .get();
          return record.id;
        }
        case "addFood": {
          const d = m.payload;
          const res = db
            .prepare(
              `INSERT INTO foods (name, brand, serving_size, serving_unit, calories_per_serving, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, barcode, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')`
            )
            .run(
              d.name,
              d.brand ?? null,
              d.serving_size,
              d.serving_unit,
              d.calories_per_serving,
              d.protein_g,
              d.carbs_g,
              d.fat_g,
              d.fiber_g ?? 0,
              d.sugar_g ?? 0,
              d.sodium_mg ?? 0,
              d.barcode ?? null
            );
          return res.lastInsertRowid as number;
        }
        case "createWorkoutSession": {
          const d = m.payload;
          const res = db
            .prepare(
              "INSERT INTO workout_sessions (user_id, date, name) VALUES (?, ?, ?)"
            )
            .run(user.id, d.date || todayString(), d.name || "Workout");
          return res.lastInsertRowid as number;
        }
        case "addWorkoutSet": {
          const d = m.payload;
          const sessionId = resolveSessionId(m);
          const res = db
            .prepare(
              `INSERT INTO workout_sets (session_id, exercise_id, set_number, reps, weight_kg, rpe, rest_seconds, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              sessionId,
              d.exercise_id,
              d.set_number,
              d.reps,
              d.weight_kg,
              d.rpe ?? 7,
              d.rest_seconds ?? null,
              d.notes ?? null
            );
          return res.lastInsertRowid as number;
        }
        default: {
          return undefined;
        }
      }
    };

    const applyAndRecord = db.transaction((m: QueuedMutation) => {
      const result_id = apply(m);
      recordOutcome.run({
        client_id: m.client_id,
        error: null,
        kind: m.kind,
        payload: JSON.stringify(m.payload),
        queued_at: m.queued_at,
        result_id: result_id ?? null,
        status: "applied",
        temp_ref: m.kind === "createWorkoutSession" ? m.payload.temp_ref : null,
      });
      return result_id;
    });

    const outcomes: SyncOutcome[] = [];

    for (const m of mutations) {
      const already = findApplied.get(m.client_id) as
        | { result_id: number | null }
        | undefined;
      if (already) {
        if (m.kind === "createWorkoutSession" && already.result_id) {
          sessionIds.set(m.payload.temp_ref, already.result_id);
        }
        outcomes.push({
          client_id: m.client_id,
          kind: m.kind,
          result_id: already.result_id ?? undefined,
          status: "duplicate",
        });
        continue;
      }

      try {
        const result_id = applyAndRecord(m);
        if (m.kind === "createWorkoutSession" && result_id) {
          sessionIds.set(m.payload.temp_ref, result_id);
        }
        outcomes.push({
          client_id: m.client_id,
          kind: m.kind,
          result_id,
          status: "applied",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recordOutcome.run({
          client_id: m.client_id,
          error: message,
          kind: m.kind,
          payload: JSON.stringify(m.payload),
          queued_at: m.queued_at,
          result_id: null,
          status: "failed",
          temp_ref: null,
        });
        outcomes.push({
          client_id: m.client_id,
          error: message,
          kind: m.kind,
          status: "failed",
        });
      }
    }

    return {
      applied: outcomes.filter((o) => o.status === "applied").length,
      duplicates: outcomes.filter((o) => o.status === "duplicate").length,
      failed: outcomes.filter((o) => o.status === "failed").length,
      outcomes,
      synced_at: new Date().toISOString(),
    };
  });

/**
 * Entries the server has already accepted, so a device can drop anything from
 * its outbox that landed on a previous attempt whose response it never saw.
 */
export const getSyncedClientIds = createServerFn({ method: "POST" })
  .validator((data: { client_ids: string[] }) => data)
  .handler(async (ctx) => {
    const ids = ctx.data?.client_ids ?? [];
    if (ids.length === 0) {
      return { client_ids: [] as string[] };
    }
    const db = getDb();
    const placeholders = ids.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT client_id FROM sync_queue
       WHERE status = 'applied' AND client_id IN (${placeholders})`
      )
      .all(...ids) as { client_id: string }[];
    return { client_ids: rows.map((r) => r.client_id) };
  });

// --- Web Push (issue #65) ---

export interface PushStatus {
  configured: boolean;
  publicKey: string | null;
  subscribed: boolean;
}

export const getPushStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<PushStatus> => {
    const publicKey = readVapidPublicKey();
    const user = await ensureDefaultUser();
    const db = getDb();
    return {
      configured: publicKey !== null,
      publicKey,
      subscribed: hasPushSubscription(db, user.id),
    };
  }
);

export const subscribePush = createServerFn({ method: "POST" })
  .validator((data: PushSubscriptionInput) => data)
  .handler(async (ctx) => {
    const publicKey = readVapidPublicKey();
    if (!publicKey) {
      return { ok: false as const, reason: "not-configured" as const };
    }
    const user = await ensureDefaultUser();
    const db = getDb();
    upsertPushSubscription(db, user.id, ctx.data);
    return { ok: true as const };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .validator((data: { endpoint: string }) => data)
  .handler(async (ctx) => {
    const db = getDb();
    deletePushSubscriptionByEndpoint(db, ctx.data.endpoint);
    return { ok: true as const };
  });

export const sendTestPush = createServerFn({ method: "POST" }).handler(
  async () => {
    const vapid = readVapidConfig();
    if (!vapid) {
      return { ok: false as const, reason: "not-configured" as const };
    }
    const user = await ensureDefaultUser();
    const db = getDb();
    const subscriptions = listPushSubscriptionsForUser(db, user.id);
    if (subscriptions.length === 0) {
      return { ok: false as const, reason: "no-subscription" as const };
    }
    if (process.env.E2E_PUSH_MOCK === "1") {
      return { ok: true as const };
    }
    const { deliverPushToUser } = await import("./push-server");
    const results = await deliverPushToUser(
      db,
      vapid,
      user.id,
      TEST_PUSH_PAYLOAD
    );
    const sent = results.some((result) => result.status === "sent");
    return sent
      ? { ok: true as const }
      : { ok: false as const, reason: "delivery-failed" as const };
  }
);

// --- Reminder preferences (issue #66) ---

export const getReminderPreferences = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificationPreferences> => {
    const user = await ensureDefaultUser();
    const db = getDb();
    return getNotificationPreferences(db, user.id);
  }
);

export const updateNotificationPreferences = createServerFn({ method: "POST" })
  .validator((data: NotificationPreferencesUpdate) => data)
  .handler(async (ctx) => {
    const user = await ensureDefaultUser();
    const db = getDb();
    return upsertNotificationPreferences(db, user.id, ctx.data);
  });
