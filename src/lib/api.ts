import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";

import { db as drizzleDb } from "~/db";
import { importUserData } from "~/db/import-queries";
import {
  getProgressHighlights as loadProgressHighlights,
  countWorkoutDaysSince,
  listDistinctFoodLogDates,
  listDistinctWorkoutSessionDates,
  listWeeklyNutritionAggregates,
  listWeeklyWorkoutSetRows,
} from "~/db/progress-queries";
import { listAppliedClientIds, processSyncMutations } from "~/db/sync-queries";
import type { Food, FoodLogEntry, MealType, WorkoutSession } from "~/db/types";

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
import type { ProgramDayTarget } from "../db/program-queries";
import {
  bodyLogs,
  foodLog,
  foods,
  workoutSessions,
  workoutSets,
} from "../db/schema";
import {
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
import {
  canCopyDayFromDate,
  canCopyMealFromDate,
  copyDayEntriesInDb,
  copyMealEntriesInDb,
  deleteFoodLogEntriesInDb,
  entriesForMeal,
  logMealTemplateInDb,
} from "./food-log-copy";
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
import type { NotificationPreferences } from "./push";
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
import { requireAuth } from "./require-auth";
import { serverInputValidator } from "./schemas/common";
import {
  addFoodInputSchema,
  addFoodLogEntryInputSchema,
  copyDayFromDateInputSchema,
  copyMealFromDateInputSchema,
  deleteFoodLogEntryInputSchema,
  deleteFoodLogEntriesInputSchema,
  deleteMealTemplateInputSchema,
  getAllFoodsQuerySchema,
  getFoodByBarcodeQuerySchema,
  getFoodLogQuerySchema,
  getMealTemplateQuerySchema,
  getNutritionSummaryQuerySchema,
  logMealTemplateInputSchema,
  mealPlanSlotInputSchema,
  optionalWeekStartQuerySchema,
  saveMealTemplateInputSchema,
  searchFoodsQuerySchema,
  setMealPlanInputSchema,
} from "./schemas/nutrition";
import {
  getBodyLogsQuerySchema,
  getConsistencyQuerySchema,
  getSyncedClientIdsInputSchema,
  getWeeklyReviewAvailabilityQuerySchema,
  getWeeklyReviewQuerySchema,
  importDataInputSchema,
  logBodyweightInputSchema,
  pushSubscriptionInputSchema,
  syncQueuedMutationsInputSchema,
  unsubscribePushInputSchema,
  updateNotificationPreferencesSchema,
  userProfileUpdateSchema,
} from "./schemas/user";
import {
  addWorkoutSetInputSchema,
  createWorkoutSessionInputSchema,
  deleteProgramInputSchema,
  deleteWorkoutSetInputSchema,
  finishWorkoutSessionInputSchema,
  getExerciseSetHistoryQuerySchema,
  getProgramQuerySchema,
  getWorkoutSessionQuerySchema,
  getWorkoutSessionSummaryQuerySchema,
  lastPerformanceQuerySchema,
  optionalMuscleGroupQuerySchema,
  programDayTargetsQuerySchema,
  saveProgramInputSchema,
  setActiveProgramInputSchema,
  startWorkoutFromProgramInputSchema,
  workoutSessionsQuerySchema,
} from "./schemas/workout";
import type { SaveProgramInput } from "./schemas/workout";
import type { SyncResult } from "./sync";
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

// --- User ---

export const getUser = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await requireAuth();
  return user;
});

export const updateUser = createServerFn({ method: "POST" })
  .validator(serverInputValidator(userProfileUpdateSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(getBodyLogsQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    return listBodyLogRecords(drizzleDb, user.id, ctx.data?.limit || 90);
  });

export const logBodyweight = createServerFn({ method: "POST" })
  .validator(serverInputValidator(logBodyweightInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    return upsertBodyweightRecord(drizzleDb, user.id, {
      bodyFatPct: ctx.data.body_fat_pct,
      date: ctx.data.date || todayString(),
      notes: ctx.data.notes,
      weightKg: ctx.data.weight_kg,
    });
  });

export const getLatestBodyweight = createServerFn({ method: "GET" }).handler(
  async () => {
    const { user } = await requireAuth();
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
    const { user } = await requireAuth();
    const bodyweight = await findLatestBodyweightRecord(drizzleDb, user.id);
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
  .validator(serverInputValidator(searchFoodsQuerySchema))
  .handler(async (ctx) => {
    await requireAuth();
    const records = await searchFoodRecords(
      drizzleDb,
      ctx.data.query,
      ctx.data.limit || 20
    );
    return records.map(toLegacyFoodRecord);
  });

export const getAllFoods = createServerFn({ method: "GET" })
  .validator(serverInputValidator(getAllFoodsQuerySchema))
  .handler(async (ctx) => {
    await requireAuth();
    const records = await listFoodRecords(drizzleDb, ctx.data?.limit || 100);
    return records.map(toLegacyFoodRecord);
  });

/** Resolve a scanned GTIN against foods the user has logged before (issue #58). */
export const getFoodByBarcode = createServerFn({ method: "GET" })
  .validator(serverInputValidator(getFoodByBarcodeQuerySchema))
  .handler(async (ctx) => {
    await requireAuth();
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
  .validator(serverInputValidator(addFoodInputSchema))
  .handler(async (ctx) => {
    await requireAuth();
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
    const { user } = await requireAuth();
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
    const { user } = await requireAuth();
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
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(getFoodLogQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    const date = ctx.data?.date || todayString();
    const entries = await listFoodLogRecords(drizzleDb, user.id, date);
    return entries.map(toLegacyFoodLogEntry);
  });

export const addFoodLogEntry = createServerFn({ method: "POST" })
  .validator(serverInputValidator(addFoodLogEntryInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(deleteFoodLogEntryInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    await deleteFoodLogRecord(drizzleDb, user.id, ctx.data.id);
    return { success: true };
  });

export const deleteFoodLogEntries = createServerFn({ method: "POST" })
  .validator(serverInputValidator(deleteFoodLogEntriesInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    return deleteFoodLogEntriesInDb(drizzleDb, user.id, ctx.data.ids);
  });

export const copyMealFromDate = createServerFn({ method: "POST" })
  .validator(serverInputValidator(copyMealFromDateInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    const { fromDate, toDate, mealType } = ctx.data;
    return copyMealEntriesInDb(
      drizzleDb,
      user.id,
      fromDate,
      toDate,
      mealType,
      canCopyMealFromDate,
      entriesForMeal
    );
  });

export const copyDayFromDate = createServerFn({ method: "POST" })
  .validator(serverInputValidator(copyDayFromDateInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    const { fromDate, toDate } = ctx.data;
    return copyDayEntriesInDb(
      drizzleDb,
      user.id,
      fromDate,
      toDate,
      canCopyDayFromDate
    );
  });

export const logMealTemplate = createServerFn({ method: "POST" })
  .validator(serverInputValidator(logMealTemplateInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    const { templateId, date, mealType } = ctx.data;
    return logMealTemplateInDb(drizzleDb, user.id, templateId, date, mealType);
  });

export const getNutritionSummary = createServerFn({ method: "GET" })
  .validator(serverInputValidator(getNutritionSummaryQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(optionalMuscleGroupQuerySchema))
  .handler(async (ctx) => {
    await requireAuth();
    const records = await listExerciseRecords(
      drizzleDb,
      ctx.data?.muscle_group
    );
    return records.map(toLegacyExercise);
  });

// --- Workouts ---

export const getWorkoutSessions = createServerFn({ method: "GET" })
  .validator(serverInputValidator(workoutSessionsQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    const records = await listWorkoutSessionRecords(drizzleDb, user.id, {
      date: ctx.data?.date,
      limit: ctx.data?.limit || 30,
    });
    return records.map(toLegacyWorkoutSession);
  });

export const getWorkoutSession = createServerFn({ method: "GET" })
  .validator(serverInputValidator(getWorkoutSessionQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    const owned = await findWorkoutSessionForUser(
      drizzleDb,
      ctx.data.id,
      user.id
    );
    if (!owned) {
      return null;
    }
    return findWorkoutSessionWithSets(drizzleDb, ctx.data.id);
  });

export const createWorkoutSession = createServerFn({ method: "POST" })
  .validator(serverInputValidator(createWorkoutSessionInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(addWorkoutSetInputSchema))
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
  .validator(serverInputValidator(deleteWorkoutSetInputSchema))
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
  .validator(serverInputValidator(finishWorkoutSessionInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(getWorkoutSessionSummaryQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(lastPerformanceQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(getExerciseSetHistoryQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
    const { user } = await requireAuth();
    return listProgramSummaries(drizzleDb, user.id);
  }
);

export const getProgram = createServerFn({ method: "GET" })
  .validator(serverInputValidator(getProgramQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    return findProgramDetail(drizzleDb, ctx.data.id, user.id);
  });

export const saveProgram = createServerFn({ method: "POST" })
  .validator(serverInputValidator(saveProgramInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    const programId = await saveProgramRecord(
      drizzleDb,
      user.id,
      ctx.data satisfies SaveProgramInput
    );
    return findProgramDetail(drizzleDb, programId, user.id);
  });

export const deleteProgram = createServerFn({ method: "POST" })
  .validator(serverInputValidator(deleteProgramInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    await deleteProgramRecord(drizzleDb, ctx.data.id, user.id);
    return { success: true };
  });

export const setActiveProgram = createServerFn({ method: "POST" })
  .validator(serverInputValidator(setActiveProgramInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    await setActiveProgramRecord(drizzleDb, ctx.data.id, user.id);
    return { success: true };
  });

export const getProgramDayTargets = createServerFn({ method: "GET" })
  .validator(serverInputValidator(programDayTargetsQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(startWorkoutFromProgramInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
    const { user } = await requireAuth();
    return listMealTemplateSummaries(drizzleDb, user.id);
  }
);

export const getMealTemplate = createServerFn({ method: "GET" })
  .validator(serverInputValidator(getMealTemplateQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    return findMealTemplateDetail(drizzleDb, ctx.data.id, user.id);
  });

export const saveMealTemplate = createServerFn({ method: "POST" })
  .validator(serverInputValidator(saveMealTemplateInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    const templateId = await saveMealTemplateRecord(
      drizzleDb,
      user.id,
      ctx.data
    );
    return findMealTemplateDetail(drizzleDb, templateId, user.id);
  });

export const deleteMealTemplate = createServerFn({ method: "POST" })
  .validator(serverInputValidator(deleteMealTemplateInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    await deleteMealTemplateRecord(drizzleDb, ctx.data.id, user.id);
    return { success: true };
  });

export const getWeekMealPlan = createServerFn({ method: "GET" })
  .validator(serverInputValidator(optionalWeekStartQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(setMealPlanInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    await upsertMealPlanRecord(drizzleDb, user.id, ctx.data);
    return { success: true };
  });

export const clearMealPlan = createServerFn({ method: "POST" })
  .validator(serverInputValidator(mealPlanSlotInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    await deleteMealPlanRecord(
      drizzleDb,
      user.id,
      ctx.data.date,
      ctx.data.meal_type
    );
    return { success: true };
  });

export const logMealFromPlan = createServerFn({ method: "POST" })
  .validator(serverInputValidator(mealPlanSlotInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
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
    const { user } = await requireAuth();
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
    const { user } = await requireAuth();
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
    const { user } = await requireAuth();
    return loadProgressHighlights(drizzleDb, user.id);
  }
);

// --- Data Export ---

export const exportData = createServerFn({ method: "GET" }).handler(
  async () => {
    const { user } = await requireAuth();
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
  .validator(serverInputValidator(importDataInputSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    const result = importUserData(drizzleDb, user.id, ctx.data);
    return { success: true, ...result };
  });

// --- Dashboard Stats ---

export const getDashboardStats = createServerFn({ method: "GET" }).handler(
  async () => {
    const { user } = await requireAuth();
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

    const workoutDaysThisMonth = countWorkoutDaysSince(
      drizzleDb,
      user.id,
      addDays(today, -30)
    );

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
      workoutDaysThisMonth,
    };
  }
);

// --- Consistency ---

/** Burke et al. 2011: rolling adherence and streak metrics for retention. */
export const getConsistency = createServerFn({ method: "GET" })
  .validator(serverInputValidator(getConsistencyQuerySchema))
  .handler(async (ctx): Promise<ConsistencyMetrics> => {
    const { user } = await requireAuth();
    const asOf = ctx.data.asOf ?? todayString();
    const windowStart = addDays(asOf, -27);

    const rows = listDistinctFoodLogDates(
      drizzleDb,
      user.id,
      windowStart,
      asOf
    ).map((date) => ({ date }));

    return assembleConsistencyMetrics(
      rows.map((row) => row.date),
      asOf
    );
  });

// --- Weekly Review (issue #64) ---

export type WeeklyReview = WeeklyReviewPayload;

async function collectActivityDates(
  database: typeof drizzleDb,
  userId: number
): Promise<string[]> {
  const foodDates = listDistinctFoodLogDates(database, userId);
  const sessionDates = listDistinctWorkoutSessionDates(database, userId);
  const bodyDates = await database.query.bodyLogs.findMany({
    columns: { date: true },
    where: and(eq(bodyLogs.userId, userId), isNotNull(bodyLogs.weightKg)),
  });

  return [
    ...new Set([
      ...foodDates,
      ...sessionDates,
      ...bodyDates.map((row) => row.date),
    ]),
  ];
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
  database: typeof drizzleDb,
  userId: number,
  asOf: string,
  calorieTarget: number,
  proteinTargetG: number
): Promise<WeeklyReview | null> {
  const week = lastCompleteWeekRange(asOf);
  const prior = priorWeekRange(week);
  const bodyLogStart = addDays(week.start, -6);

  const foodRows = listWeeklyNutritionAggregates(
    database,
    userId,
    prior.start,
    week.end
  );

  const dailyNutrition = new Map(
    foodRows.map((row) => [
      row.date,
      { calories: row.calories, protein_g: row.protein_g },
    ])
  );

  const setRows = listWeeklyWorkoutSetRows(
    database,
    userId,
    prior.start,
    week.end
  );

  const sessionDates = listDistinctWorkoutSessionDates(
    database,
    userId,
    prior.start,
    week.end
  );

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
  .validator(serverInputValidator(getWeeklyReviewAvailabilityQuerySchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    const asOf = ctx.data.asOf ?? todayString();
    const activityDates = await collectActivityDates(drizzleDb, user.id);
    return { available: hasReviewableWeek(asOf, activityDates) };
  });

/** Last complete week's review metrics and headline (issue #64). */
export const getWeeklyReview = createServerFn({ method: "GET" })
  .validator(serverInputValidator(getWeeklyReviewQuerySchema))
  .handler(async (ctx): Promise<WeeklyReview | null> => {
    const { user } = await requireAuth();
    const asOf = ctx.data.asOf ?? todayString();
    const targets = await getDailyTargets();
    return loadWeeklyReviewFromDb(
      drizzleDb,
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
    const { user } = await requireAuth();
    const targets = await getDailyTargets();
    const sinceDate = addDays(todayString(), -OFFLINE_HISTORY_DAYS);
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

    const workoutSessionRecords = await listWorkoutSessionRecords(
      drizzleDb,
      user.id,
      { limit: 500 }
    );
    const workout_sessions = workoutSessionRecords
      .filter((session) => session.date >= sinceDate)
      .map(toLegacyWorkoutSession);

    const workout_sets = drizzleDb
      .select({ set: workoutSets })
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
      .where(
        and(
          eq(workoutSessions.userId, user.id),
          gte(workoutSessions.date, sinceDate)
        )
      )
      .orderBy(workoutSets.sessionId, workoutSets.setNumber)
      .all()
      .map((row) => toLegacyWorkoutSet(row.set));

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
  .validator(serverInputValidator(syncQueuedMutationsInputSchema))
  .handler(async (ctx): Promise<SyncResult> => {
    const { user } = await requireAuth();
    return processSyncMutations(drizzleDb, user.id, ctx.data?.mutations ?? []);
  });

/**
 * Entries the server has already accepted, so a device can drop anything from
 * its outbox that landed on a previous attempt whose response it never saw.
 */
export const getSyncedClientIds = createServerFn({ method: "POST" })
  .validator(serverInputValidator(getSyncedClientIdsInputSchema))
  .handler(async (ctx) => {
    const ids = ctx.data?.client_ids ?? [];
    if (ids.length === 0) {
      return { client_ids: [] as string[] };
    }
    return { client_ids: listAppliedClientIds(drizzleDb, ids) };
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
    const { user } = await requireAuth();
    return {
      configured: publicKey !== null,
      publicKey,
      subscribed: hasPushSubscription(drizzleDb, user.id),
    };
  }
);

export const subscribePush = createServerFn({ method: "POST" })
  .validator(serverInputValidator(pushSubscriptionInputSchema))
  .handler(async (ctx) => {
    const publicKey = readVapidPublicKey();
    if (!publicKey) {
      return { ok: false as const, reason: "not-configured" as const };
    }
    const { user } = await requireAuth();
    upsertPushSubscription(drizzleDb, user.id, ctx.data);
    return { ok: true as const };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .validator(serverInputValidator(unsubscribePushInputSchema))
  .handler(async (ctx) => {
    deletePushSubscriptionByEndpoint(drizzleDb, ctx.data.endpoint);
    return { ok: true as const };
  });

export const sendTestPush = createServerFn({ method: "POST" }).handler(
  async () => {
    const vapid = readVapidConfig();
    if (!vapid) {
      return { ok: false as const, reason: "not-configured" as const };
    }
    const { user } = await requireAuth();
    const subscriptions = listPushSubscriptionsForUser(drizzleDb, user.id);
    if (subscriptions.length === 0) {
      return { ok: false as const, reason: "no-subscription" as const };
    }
    if (process.env.E2E_PUSH_MOCK === "1") {
      return { ok: true as const };
    }
    const { deliverPushToUser } = await import("./push-server");
    const results = await deliverPushToUser(
      drizzleDb,
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
    const { user } = await requireAuth();
    return getNotificationPreferences(drizzleDb, user.id);
  }
);

export const updateNotificationPreferences = createServerFn({ method: "POST" })
  .validator(serverInputValidator(updateNotificationPreferencesSchema))
  .handler(async (ctx) => {
    const { user } = await requireAuth();
    return upsertNotificationPreferences(drizzleDb, user.id, ctx.data);
  });
