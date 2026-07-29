import { db as drizzleDb } from "~/db";
import { findProgramDayRecord } from "~/db/program-queries";
import { deletePushSubscriptionByEndpoint } from "~/db/push-queries";
import { listAppliedClientIds } from "~/db/sync-queries";
import {
  deleteWorkoutSetRecord,
  findWorkoutSessionForUser,
  findWorkoutSetIdForUser,
  insertWorkoutSessionRecord,
  insertWorkoutSetRecord,
  toLegacyWorkoutSet,
} from "~/db/workout-queries";

import { todayString } from "./nutrition";
import { requireAuth } from "./require-auth";
import type { AddWorkoutSetInput } from "./schemas/workout";

export async function executeAddWorkoutSet(data: AddWorkoutSetInput) {
  const { user } = await requireAuth();
  const owned = await findWorkoutSessionForUser(
    drizzleDb,
    data.session_id,
    user.id
  );
  if (!owned) {
    return null;
  }
  const record = await insertWorkoutSetRecord(drizzleDb, user.id, {
    exerciseId: data.exercise_id,
    notes: data.notes ?? null,
    reps: data.reps,
    restSeconds: data.rest_seconds ?? null,
    rpe: data.rpe,
    sessionId: data.session_id,
    setNumber: data.set_number,
    weightKg: data.weight_kg,
  });
  if (!record) {
    return null;
  }
  return toLegacyWorkoutSet(record);
}

export async function executeDeleteWorkoutSet(data: { id: number }) {
  const { user } = await requireAuth();
  const ownedSetId = await findWorkoutSetIdForUser(drizzleDb, data.id, user.id);
  if (ownedSetId !== null) {
    await deleteWorkoutSetRecord(drizzleDb, ownedSetId, user.id);
  }
  return { success: true as const };
}

export async function executeGetSyncedClientIds(data: {
  client_ids: string[];
}) {
  const { user } = await requireAuth();
  const ids = data.client_ids ?? [];
  if (ids.length === 0) {
    return { client_ids: [] as string[] };
  }
  return { client_ids: listAppliedClientIds(drizzleDb, user.id, ids) };
}

export async function executeUnsubscribePush(data: { endpoint: string }) {
  const { user } = await requireAuth();
  deletePushSubscriptionByEndpoint(drizzleDb, user.id, data.endpoint);
  return { ok: true as const };
}

export async function executeStartWorkoutFromProgram(data: {
  programDayId: number;
  programId: number;
}) {
  const { user } = await requireAuth();
  const day = await findProgramDayRecord(
    drizzleDb,
    data.programDayId,
    data.programId,
    user.id
  );
  if (!day) {
    throw new Error("Program day not found");
  }

  const sessionId = await insertWorkoutSessionRecord(drizzleDb, {
    date: todayString(),
    name: day.day_name,
    programDayId: data.programDayId,
    programId: data.programId,
    userId: user.id,
  });

  return { dayName: day.day_name, sessionId };
}
