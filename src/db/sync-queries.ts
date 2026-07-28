import { and, eq, inArray, sql } from "drizzle-orm";

import {
  canCopyDayFromDate,
  canCopyMealFromDate,
  entriesForMeal,
} from "../lib/food-log-copy";
import { todayString } from "../lib/nutrition";
import type { QueuedMutation, SyncOutcome, SyncResult } from "../lib/sync";
import {
  copyDayEntriesInDb,
  copyMealEntriesInDb,
  deleteFoodLogEntriesInDb,
  logMealTemplateInDb,
} from "./food-log-copy-queries";
import type { FitTrackDatabase } from "./index";
import {
  bodyLogs,
  foodLog,
  foods,
  syncQueue,
  workoutSessions,
  workoutSets,
} from "./schema";

function findAppliedSyncResult(database: FitTrackDatabase, clientId: string) {
  return database
    .select({ resultId: syncQueue.resultId })
    .from(syncQueue)
    .where(
      and(eq(syncQueue.clientId, clientId), eq(syncQueue.status, "applied"))
    )
    .get();
}

function findSyncResultByTempRef(database: FitTrackDatabase, tempRef: string) {
  return database
    .select({ resultId: syncQueue.resultId })
    .from(syncQueue)
    .where(and(eq(syncQueue.tempRef, tempRef), eq(syncQueue.status, "applied")))
    .get();
}

function recordSyncOutcome(
  database: FitTrackDatabase,
  userId: number,
  row: {
    client_id: string;
    error: string | null;
    kind: string;
    payload: string;
    queued_at: string;
    result_id: number | null;
    status: "applied" | "failed";
    temp_ref: string | null;
  }
): void {
  database
    .insert(syncQueue)
    .values({
      clientId: row.client_id,
      error: row.error,
      kind: row.kind,
      payload: row.payload,
      queuedAt: row.queued_at,
      resultId: row.result_id,
      status: row.status,
      tempRef: row.temp_ref,
      userId,
    })
    .onConflictDoUpdate({
      set: {
        appliedAt: sql`datetime('now')`,
        error: row.error,
        resultId: row.result_id,
        status: row.status,
      },
      target: syncQueue.clientId,
    })
    .run();
}

export function listAppliedClientIds(
  database: FitTrackDatabase,
  userId: number,
  clientIds: string[]
): string[] {
  if (clientIds.length === 0) {
    return [];
  }
  return database
    .select({ clientId: syncQueue.clientId })
    .from(syncQueue)
    .where(
      and(
        eq(syncQueue.status, "applied"),
        eq(syncQueue.userId, userId),
        inArray(syncQueue.clientId, clientIds)
      )
    )
    .all()
    .map((row) => row.clientId);
}

export function processSyncMutations(
  database: FitTrackDatabase,
  userId: number,
  mutations: QueuedMutation[]
): SyncResult {
  const sessionIds = new Map<string, number>();

  const resolveSessionId = (
    mutation: Extract<QueuedMutation, { kind: "addWorkoutSet" }>
  ): number => {
    if (typeof mutation.payload.session_id === "number") {
      return mutation.payload.session_id;
    }
    const ref = mutation.payload.session_temp_ref;
    if (!ref) {
      throw new Error(
        "workout set is missing both session_id and session_temp_ref"
      );
    }
    const inBatch = sessionIds.get(ref);
    if (inBatch) {
      return inBatch;
    }
    const stored = findSyncResultByTempRef(database, ref);
    if (!stored?.resultId) {
      throw new Error(`unknown workout session reference "${ref}"`);
    }
    return stored.resultId;
  };

  const apply = (mutation: QueuedMutation): number | undefined => {
    switch (mutation.kind) {
      case "addFoodLogEntry": {
        const { payload } = mutation;
        const record = database
          .insert(foodLog)
          .values({
            calories: payload.calories,
            carbsG: payload.carbs_g,
            customName: payload.custom_name ?? null,
            date: payload.date || todayString(),
            fatG: payload.fat_g,
            foodId: payload.food_id ?? null,
            mealType: payload.meal_type,
            notes: payload.notes ?? null,
            proteinG: payload.protein_g,
            servings: payload.servings,
            userId,
          })
          .returning({ id: foodLog.id })
          .get();
        return record.id;
      }
      case "deleteFoodLogEntry": {
        database
          .delete(foodLog)
          .where(
            and(eq(foodLog.id, mutation.payload.id), eq(foodLog.userId, userId))
          )
          .run();
        return mutation.payload.id;
      }
      case "deleteFoodLogEntries": {
        deleteFoodLogEntriesInDb(database, userId, mutation.payload.ids);
        return mutation.payload.ids[0];
      }
      case "copyMealFromDate": {
        const { payload } = mutation;
        const result = copyMealEntriesInDb(
          database,
          userId,
          payload.fromDate,
          payload.toDate,
          payload.mealType,
          canCopyMealFromDate,
          entriesForMeal
        );
        return result.entries[0]?.id;
      }
      case "copyDayFromDate": {
        const { payload } = mutation;
        const result = copyDayEntriesInDb(
          database,
          userId,
          payload.fromDate,
          payload.toDate,
          canCopyDayFromDate
        );
        return result.entries[0]?.id;
      }
      case "logMealTemplate": {
        const { payload } = mutation;
        const result = logMealTemplateInDb(
          database,
          userId,
          payload.templateId,
          payload.date,
          payload.mealType
        );
        return result.entries[0]?.id;
      }
      case "logBodyweight": {
        const { payload } = mutation;
        const date = payload.date || todayString();
        const record = database
          .insert(bodyLogs)
          .values({
            bodyFatPct: payload.body_fat_pct ?? null,
            date,
            notes: payload.notes ?? null,
            userId,
            weightKg: payload.weight_kg,
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
        const { payload } = mutation;
        const record = database
          .insert(foods)
          .values({
            barcode: payload.barcode ?? null,
            brand: payload.brand ?? null,
            caloriesPerServing: payload.calories_per_serving,
            carbsG: payload.carbs_g,
            fatG: payload.fat_g,
            fiberG: payload.fiber_g ?? 0,
            name: payload.name,
            proteinG: payload.protein_g,
            servingSize: payload.serving_size,
            servingUnit: payload.serving_unit,
            sodiumMg: payload.sodium_mg ?? 0,
            source: "user",
            sugarG: payload.sugar_g ?? 0,
          })
          .returning({ id: foods.id })
          .get();
        return record.id;
      }
      case "createWorkoutSession": {
        const { payload } = mutation;
        const record = database
          .insert(workoutSessions)
          .values({
            date: payload.date || todayString(),
            name: payload.name || "Workout",
            userId,
          })
          .returning({ id: workoutSessions.id })
          .get();
        return record.id;
      }
      case "addWorkoutSet": {
        const { payload } = mutation;
        const sessionId = resolveSessionId(mutation);
        const record = database
          .insert(workoutSets)
          .values({
            exerciseId: payload.exercise_id,
            notes: payload.notes ?? null,
            reps: payload.reps,
            restSeconds: payload.rest_seconds ?? null,
            rpe: payload.rpe ?? 7,
            sessionId,
            setNumber: payload.set_number,
            weightKg: payload.weight_kg,
          })
          .returning({ id: workoutSets.id })
          .get();
        return record.id;
      }
      default: {
        return undefined;
      }
    }
  };

  const applyAndRecord = (mutation: QueuedMutation): number | undefined =>
    database.transaction(() => {
      const resultId = apply(mutation);
      recordSyncOutcome(database, userId, {
        client_id: mutation.client_id,
        error: null,
        kind: mutation.kind,
        payload: JSON.stringify(mutation.payload),
        queued_at: mutation.queued_at,
        result_id: resultId ?? null,
        status: "applied",
        temp_ref:
          mutation.kind === "createWorkoutSession"
            ? mutation.payload.temp_ref
            : null,
      });
      return resultId;
    });

  const outcomes: SyncOutcome[] = [];

  for (const mutation of mutations) {
    const already = findAppliedSyncResult(database, mutation.client_id);
    if (already) {
      if (mutation.kind === "createWorkoutSession" && already.resultId) {
        sessionIds.set(mutation.payload.temp_ref, already.resultId);
      }
      outcomes.push({
        client_id: mutation.client_id,
        kind: mutation.kind,
        result_id: already.resultId ?? undefined,
        status: "duplicate",
      });
      continue;
    }

    try {
      const resultId = applyAndRecord(mutation);
      if (mutation.kind === "createWorkoutSession" && resultId) {
        sessionIds.set(mutation.payload.temp_ref, resultId);
      }
      outcomes.push({
        client_id: mutation.client_id,
        kind: mutation.kind,
        result_id: resultId,
        status: "applied",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordSyncOutcome(database, userId, {
        client_id: mutation.client_id,
        error: message,
        kind: mutation.kind,
        payload: JSON.stringify(mutation.payload),
        queued_at: mutation.queued_at,
        result_id: null,
        status: "failed",
        temp_ref: null,
      });
      outcomes.push({
        client_id: mutation.client_id,
        error: message,
        kind: mutation.kind,
        status: "failed",
      });
    }
  }

  return {
    applied: outcomes.filter((outcome) => outcome.status === "applied").length,
    duplicates: outcomes.filter((outcome) => outcome.status === "duplicate")
      .length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    outcomes,
    synced_at: new Date().toISOString(),
  };
}
