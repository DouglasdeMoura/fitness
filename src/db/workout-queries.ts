import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  lt,
  ne,
  sql,
} from "drizzle-orm";

import type { ExerciseSetSnapshot } from "../lib/records";
import type { FitTrackDatabase } from "./index";
import { exercises, workoutSessions, workoutSets } from "./schema";
import type { Exercise, WorkoutSession, WorkoutSet } from "./types";

export type ExerciseRecord = typeof exercises.$inferSelect;
export type WorkoutSessionRecord = typeof workoutSessions.$inferSelect;
export type WorkoutSetRecord = typeof workoutSets.$inferSelect;

export interface SessionSetRow {
  exercise_id: number;
  id: number;
  reps: number | null;
  weight_kg: number | null;
}

export interface LastPerformanceRow {
  date: string;
  reps: number;
  rpe: number;
  weight_kg: number;
}

export interface ExerciseSetHistoryRow {
  id: number;
  reps: number;
  session_id: number;
  weight_kg: number;
}

export interface WeeklyVolumeRow {
  muscle_group: string;
  total_sets: number;
  total_volume: number;
}

export interface WorkoutSetWithExercise extends WorkoutSet {
  exercise_name: string;
  muscle_group: string;
}

export function toLegacyExercise(record: ExerciseRecord): Exercise {
  return {
    category: record.category,
    created_at: record.createdAt,
    equipment: record.equipment,
    id: record.id,
    instructions: record.instructions,
    muscle_group: record.muscleGroup,
    name: record.name,
  };
}

export function toLegacyWorkoutSession(
  record: WorkoutSessionRecord
): WorkoutSession {
  return {
    created_at: record.createdAt,
    date: record.date,
    duration_minutes: record.durationMinutes,
    id: record.id,
    name: record.name,
    notes: record.notes,
    program_day_id: record.programDayId,
    program_id: record.programId,
    user_id: record.userId,
  };
}

export function toLegacyWorkoutSet(record: WorkoutSetRecord): WorkoutSet {
  return {
    created_at: record.createdAt,
    exercise_id: record.exerciseId,
    id: record.id,
    notes: record.notes ?? null,
    reps: record.reps ?? null,
    rest_seconds: record.restSeconds ?? null,
    rpe: record.rpe,
    session_id: record.sessionId,
    set_number: record.setNumber,
    weight_kg: record.weightKg ?? null,
  };
}

/** List catalog exercises, optionally filtered by muscle group. */
export async function listExerciseRecords(
  database: FitTrackDatabase,
  muscleGroup?: string
): Promise<ExerciseRecord[]> {
  return database.query.exercises.findMany({
    orderBy: [asc(exercises.name)],
    where: muscleGroup ? eq(exercises.muscleGroup, muscleGroup) : undefined,
  });
}

/** List a user's workout sessions, newest first. */
export async function listWorkoutSessionRecords(
  database: FitTrackDatabase,
  userId: number,
  options: { date?: string; limit?: number } = {}
): Promise<WorkoutSessionRecord[]> {
  const limit = options.limit ?? 30;
  if (options.date) {
    return database.query.workoutSessions.findMany({
      orderBy: [desc(workoutSessions.date), desc(workoutSessions.id)],
      where: and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.date, options.date)
      ),
    });
  }

  return database.query.workoutSessions.findMany({
    limit,
    orderBy: [desc(workoutSessions.date), desc(workoutSessions.id)],
    where: eq(workoutSessions.userId, userId),
  });
}

/** Load one session with sets and exercise metadata. */
export async function findWorkoutSessionWithSets(
  database: FitTrackDatabase,
  sessionId: number
): Promise<{
  session: WorkoutSession;
  sets: WorkoutSetWithExercise[];
} | null> {
  const result = await database.query.workoutSessions.findFirst({
    where: eq(workoutSessions.id, sessionId),
    with: {
      sets: {
        orderBy: [asc(workoutSets.exerciseId), asc(workoutSets.setNumber)],
        with: { exercise: true },
      },
    },
  });

  if (!result) {
    return null;
  }

  return {
    session: toLegacyWorkoutSession(result),
    sets: result.sets.map((set) => ({
      ...toLegacyWorkoutSet(set),
      exercise_name: set.exercise.name,
      muscle_group: set.exercise.muscleGroup,
    })),
  };
}

/** Insert a workout session and return its id. */
export async function insertWorkoutSessionRecord(
  database: FitTrackDatabase,
  input: {
    date: string;
    name: string;
    programDayId?: number | null;
    programId?: number | null;
    userId: number;
  }
): Promise<number> {
  const row = database
    .insert(workoutSessions)
    .values({
      date: input.date,
      name: input.name,
      programDayId: input.programDayId ?? null,
      programId: input.programId ?? null,
      userId: input.userId,
    })
    .returning({ id: workoutSessions.id })
    .get();

  return row.id;
}

/** Insert a set and return the persisted row. */
export async function insertWorkoutSetRecord(
  database: FitTrackDatabase,
  input: {
    exerciseId: number;
    notes?: string | null;
    reps: number;
    restSeconds?: number | null;
    rpe?: number;
    sessionId: number;
    setNumber: number;
    weightKg: number;
  }
): Promise<WorkoutSetRecord> {
  return database
    .insert(workoutSets)
    .values({
      exerciseId: input.exerciseId,
      notes: input.notes ?? null,
      reps: input.reps,
      restSeconds: input.restSeconds ?? null,
      rpe: input.rpe ?? 7,
      sessionId: input.sessionId,
      setNumber: input.setNumber,
      weightKg: input.weightKg,
    })
    .returning()
    .get();
}

/** Delete one workout set by id. */
export async function deleteWorkoutSetRecord(
  database: FitTrackDatabase,
  setId: number
): Promise<void> {
  database.delete(workoutSets).where(eq(workoutSets.id, setId)).run();
}

/** Sets logged in one session for volume and PR helpers. */
export async function listSessionSetRows(
  database: FitTrackDatabase,
  sessionId: number
): Promise<SessionSetRow[]> {
  return database
    .select({
      exercise_id: workoutSets.exerciseId,
      id: workoutSets.id,
      reps: workoutSets.reps,
      weight_kg: workoutSets.weightKg,
    })
    .from(workoutSets)
    .where(eq(workoutSets.sessionId, sessionId))
    .orderBy(asc(workoutSets.exerciseId), asc(workoutSets.setNumber));
}

/** Chronological set history for PR detection. */
export async function listExerciseHistoryRows(
  database: FitTrackDatabase,
  userId: number,
  exerciseId: number
): Promise<ExerciseSetSnapshot[]> {
  const rows = await database
    .select({
      id: workoutSets.id,
      reps: workoutSets.reps,
      session_id: workoutSets.sessionId,
      weight_kg: workoutSets.weightKg,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSets.exerciseId, exerciseId),
        isNotNull(workoutSets.weightKg),
        isNotNull(workoutSets.reps)
      )
    )
    .orderBy(asc(workoutSessions.date), asc(workoutSets.id));

  return rows.flatMap((row) =>
    row.reps === null || row.weight_kg === null
      ? []
      : [
          {
            id: row.id,
            reps: row.reps,
            session_id: row.session_id,
            weight_kg: row.weight_kg,
          },
        ]
  );
}

/** Prior session with the same name for volume comparison. */
export async function findPreviousNamedSessionRecord(
  database: FitTrackDatabase,
  userId: number,
  session: WorkoutSession
): Promise<WorkoutSession | null> {
  const sessionName = session.name ?? "Workout";
  const row = await database.query.workoutSessions.findFirst({
    orderBy: [desc(workoutSessions.date), desc(workoutSessions.id)],
    where: and(
      eq(workoutSessions.userId, userId),
      eq(workoutSessions.name, sessionName),
      lt(workoutSessions.id, session.id)
    ),
  });

  return row ? toLegacyWorkoutSession(row) : null;
}

/** Load one session owned by a user. */
export async function findWorkoutSessionForUser(
  database: FitTrackDatabase,
  sessionId: number,
  userId: number
): Promise<WorkoutSession | null> {
  const row = await database.query.workoutSessions.findFirst({
    where: and(
      eq(workoutSessions.id, sessionId),
      eq(workoutSessions.userId, userId)
    ),
  });

  return row ? toLegacyWorkoutSession(row) : null;
}

/** Persist computed session duration. */
export async function updateWorkoutSessionDuration(
  database: FitTrackDatabase,
  sessionId: number,
  durationMinutes: number
): Promise<void> {
  database
    .update(workoutSessions)
    .set({ durationMinutes })
    .where(eq(workoutSessions.id, sessionId))
    .run();
}

/** Most recent logged set for an exercise, optionally excluding a session. */
export async function findLastPerformanceRow(
  database: FitTrackDatabase,
  userId: number,
  exerciseId: number,
  excludeSessionId: number | null
): Promise<LastPerformanceRow | null> {
  const conditions = [
    eq(workoutSessions.userId, userId),
    eq(workoutSets.exerciseId, exerciseId),
    isNotNull(workoutSets.weightKg),
    isNotNull(workoutSets.reps),
  ];

  if (excludeSessionId !== null) {
    conditions.push(ne(workoutSets.sessionId, excludeSessionId));
  }

  const row = database
    .select({
      date: workoutSessions.date,
      reps: workoutSets.reps,
      rpe: workoutSets.rpe,
      weight_kg: workoutSets.weightKg,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(and(...conditions))
    .orderBy(desc(workoutSessions.date), desc(workoutSets.id))
    .limit(1)
    .get();

  if (!row || row.reps === null || row.weight_kg === null) {
    return null;
  }

  return {
    date: row.date,
    reps: row.reps,
    rpe: row.rpe,
    weight_kg: row.weight_kg,
  };
}

/** Chronological set history for one exercise. */
export async function listExerciseSetHistoryRows(
  database: FitTrackDatabase,
  userId: number,
  exerciseId: number
): Promise<ExerciseSetHistoryRow[]> {
  const rows = await database
    .select({
      id: workoutSets.id,
      reps: workoutSets.reps,
      session_id: workoutSets.sessionId,
      weight_kg: workoutSets.weightKg,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSets.exerciseId, exerciseId),
        isNotNull(workoutSets.weightKg),
        isNotNull(workoutSets.reps)
      )
    )
    .orderBy(asc(workoutSessions.date), asc(workoutSets.id));

  return rows.flatMap((row) =>
    row.reps === null || row.weight_kg === null
      ? []
      : [
          {
            id: row.id,
            reps: row.reps,
            session_id: row.session_id,
            weight_kg: row.weight_kg,
          },
        ]
  );
}

/**
 * Weekly set and volume totals per muscle group.
 * Schoenfeld et al. 2017: 10-20 sets per muscle group per week for hypertrophy.
 */
export async function listWeeklyVolumeRows(
  database: FitTrackDatabase,
  userId: number
): Promise<WeeklyVolumeRow[]> {
  return database
    .select({
      muscle_group: exercises.muscleGroup,
      total_sets: count(workoutSets.id),
      total_volume: sql<number>`coalesce(sum(${workoutSets.reps} * ${workoutSets.weightKg}), 0)`,
    })
    .from(workoutSets)
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, sql`date('now', '-7 days')`)
      )
    )
    .groupBy(exercises.muscleGroup)
    .orderBy(desc(count(workoutSets.id)));
}
