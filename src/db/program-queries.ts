import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  ne,
  sql,
} from "drizzle-orm";

import type { FitTrackDatabase } from "./index";
import {
  exercises,
  programDays,
  programExercises,
  programs,
  workoutSessions,
  workoutSets,
} from "./schema";
import type {
  PeriodizationType,
  Program,
  ProgramDay,
  ProgramExercise,
} from "./types";

export type ProgramRecord = typeof programs.$inferSelect;
export type ProgramDayRecord = typeof programDays.$inferSelect;
export type ProgramExerciseRecord = typeof programExercises.$inferSelect;

export interface ProgramExerciseInput {
  exercise_id: number;
  rest_seconds?: number;
  sort_order: number;
  target_reps: string;
  target_rpe: number;
  target_sets: number;
}

export interface ProgramDayInput {
  day_name: string;
  exercises: ProgramExerciseInput[];
  sort_order: number;
}

export interface SaveProgramInput {
  days: ProgramDayInput[];
  description?: string;
  frequency_per_week: number;
  id?: number;
  is_active?: boolean;
  name: string;
  periodization_type: PeriodizationType;
  progression_increment_pct?: number;
}

export type ProgramDetail = Program & {
  days: (ProgramDay & {
    exercises: (ProgramExercise & {
      exercise_name: string;
      muscle_group: string;
    })[];
  })[];
};

export type ProgramSummary = Program & {
  day_count: number;
};

export interface ProgramDayTarget {
  dup_emphasis?: "strength" | "hypertrophy" | "endurance";
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  program_exercise_id: number;
  progression_note: string;
  rest_seconds: number | null;
  suggested_weight_kg: number | null;
  target_reps: string;
  target_rpe: number;
  target_sets: number;
}

function toLegacyProgram(record: ProgramRecord): Program {
  return {
    created_at: record.createdAt,
    description: record.description,
    frequency_per_week: record.frequencyPerWeek,
    id: record.id,
    is_active: record.isActive,
    name: record.name,
    periodization_type: record.periodizationType,
    progression_increment_pct: record.progressionIncrementPct,
    user_id: record.userId,
  };
}

function toLegacyProgramDay(record: ProgramDayRecord): ProgramDay {
  return {
    created_at: record.createdAt,
    day_name: record.dayName,
    id: record.id,
    program_id: record.programId,
    sort_order: record.sortOrder,
  };
}

function toLegacyProgramExercise(
  record: ProgramExerciseRecord
): ProgramExercise {
  return {
    created_at: record.createdAt,
    exercise_id: record.exerciseId,
    id: record.id,
    program_day_id: record.programDayId,
    rest_seconds: record.restSeconds,
    sort_order: record.sortOrder,
    target_reps: record.targetReps,
    target_rpe: record.targetRpe,
    target_sets: record.targetSets,
  };
}

/** Load a program with nested days and exercises. */
export async function findProgramDetail(
  database: FitTrackDatabase,
  programId: number,
  userId: number
): Promise<ProgramDetail | null> {
  const program = await database.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.userId, userId)),
    with: {
      days: {
        orderBy: [asc(programDays.sortOrder)],
        with: {
          exercises: {
            orderBy: [asc(programExercises.sortOrder)],
            with: { exercise: true },
          },
        },
      },
    },
  });

  if (!program) {
    return null;
  }

  return {
    ...toLegacyProgram(program),
    days: program.days.map((day) => ({
      ...toLegacyProgramDay(day),
      exercises: day.exercises.map((entry) => ({
        ...toLegacyProgramExercise(entry),
        exercise_name: entry.exercise.name,
        muscle_group: entry.exercise.muscleGroup,
      })),
    })),
  };
}

/** List programs with day counts for the programs index. */
export async function listProgramSummaries(
  database: FitTrackDatabase,
  userId: number
): Promise<ProgramSummary[]> {
  const rows = await database
    .select({
      ...getTableColumns(programs),
      day_count: sql<number>`count(distinct ${programDays.id})`,
    })
    .from(programs)
    .leftJoin(programDays, eq(programDays.programId, programs.id))
    .where(eq(programs.userId, userId))
    .groupBy(programs.id)
    .orderBy(desc(programs.isActive), desc(programs.createdAt));

  return rows.map((row) => ({
    ...toLegacyProgram(row),
    day_count: row.day_count,
  }));
}

/** Create or replace a training program and its nested days/exercises. */
export async function saveProgramRecord(
  database: FitTrackDatabase,
  userId: number,
  input: SaveProgramInput
): Promise<number> {
  return database.transaction((tx) => {
    let programId = input.id;

    if (programId) {
      tx.update(programs)
        .set({
          description: input.description ?? null,
          frequencyPerWeek: input.frequency_per_week,
          isActive: input.is_active ? 1 : 0,
          name: input.name,
          periodizationType: input.periodization_type,
          progressionIncrementPct: input.progression_increment_pct ?? 2.5,
        })
        .where(and(eq(programs.id, programId), eq(programs.userId, userId)))
        .run();
    } else {
      const inserted = tx
        .insert(programs)
        .values({
          description: input.description ?? null,
          frequencyPerWeek: input.frequency_per_week,
          isActive: input.is_active ? 1 : 0,
          name: input.name,
          periodizationType: input.periodization_type,
          progressionIncrementPct: input.progression_increment_pct ?? 2.5,
          userId,
        })
        .returning({ id: programs.id })
        .get();
      programId = inserted.id;
    }

    if (input.is_active) {
      tx.update(programs)
        .set({ isActive: 0 })
        .where(
          and(eq(programs.userId, userId), ne(programs.id, programId as number))
        )
        .run();
    }

    const existingDays = tx
      .select({ id: programDays.id })
      .from(programDays)
      .where(eq(programDays.programId, programId as number))
      .all();

    for (const day of existingDays) {
      tx.delete(programExercises)
        .where(eq(programExercises.programDayId, day.id))
        .run();
    }

    tx.delete(programDays)
      .where(eq(programDays.programId, programId as number))
      .run();

    for (const day of input.days) {
      const dayRow = tx
        .insert(programDays)
        .values({
          dayName: day.day_name,
          programId: programId as number,
          sortOrder: day.sort_order,
        })
        .returning({ id: programDays.id })
        .get();

      for (const exercise of day.exercises) {
        tx.insert(programExercises)
          .values({
            exerciseId: exercise.exercise_id,
            programDayId: dayRow.id,
            restSeconds: exercise.rest_seconds ?? null,
            sortOrder: exercise.sort_order,
            targetReps: exercise.target_reps,
            targetRpe: exercise.target_rpe,
            targetSets: exercise.target_sets,
          })
          .run();
      }
    }

    return programId as number;
  });
}

/** Delete one program owned by the user. */
export async function deleteProgramRecord(
  database: FitTrackDatabase,
  programId: number,
  userId: number
): Promise<void> {
  database
    .delete(programs)
    .where(and(eq(programs.id, programId), eq(programs.userId, userId)))
    .run();
}

/** Mark one program active and deactivate the rest. */
export async function setActiveProgramRecord(
  database: FitTrackDatabase,
  programId: number,
  userId: number
): Promise<void> {
  database.transaction((tx) => {
    tx.update(programs)
      .set({ isActive: 0 })
      .where(eq(programs.userId, userId))
      .run();
    tx.update(programs)
      .set({ isActive: 1 })
      .where(and(eq(programs.id, programId), eq(programs.userId, userId)))
      .run();
  });
}

/** Load program/day metadata for target resolution. */
export async function findProgramDayContext(
  database: FitTrackDatabase,
  programId: number,
  programDayId: number,
  userId: number
): Promise<{
  day: ProgramDay;
  exercises: (ProgramExercise & {
    exercise_name: string;
    muscle_group: string;
  })[];
  program: Program;
} | null> {
  const program = await database.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.userId, userId)),
  });
  if (!program) {
    return null;
  }

  const day = await database.query.programDays.findFirst({
    where: and(
      eq(programDays.id, programDayId),
      eq(programDays.programId, programId)
    ),
  });
  if (!day) {
    return null;
  }

  const exerciseRows = await database
    .select({
      exercise_name: exercises.name,
      muscle_group: exercises.muscleGroup,
      programExercise: programExercises,
    })
    .from(programExercises)
    .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
    .where(eq(programExercises.programDayId, programDayId))
    .orderBy(asc(programExercises.sortOrder));

  return {
    day: toLegacyProgramDay(day),
    exercises: exerciseRows.map((row) => ({
      ...toLegacyProgramExercise(row.programExercise),
      exercise_name: row.exercise_name,
      muscle_group: row.muscle_group,
    })),
    program: toLegacyProgram(program),
  };
}

/** Last logged set for an exercise within a program. */
export async function findLastProgramExerciseSet(
  database: FitTrackDatabase,
  userId: number,
  programId: number,
  exerciseId: number
): Promise<{ reps: number; rpe: number; weight_kg: number } | null> {
  const row = database
    .select({
      reps: workoutSets.reps,
      rpe: workoutSets.rpe,
      weight_kg: workoutSets.weightKg,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.programId, programId),
        eq(workoutSets.exerciseId, exerciseId),
        isNotNull(workoutSets.weightKg),
        isNotNull(workoutSets.reps)
      )
    )
    .orderBy(desc(workoutSessions.date), desc(workoutSets.id))
    .limit(1)
    .get();

  if (!row || row.reps === null || row.weight_kg === null) {
    return null;
  }

  return {
    reps: row.reps,
    rpe: row.rpe,
    weight_kg: row.weight_kg,
  };
}

/** Load one program day for starting a workout. */
export async function findProgramDayRecord(
  database: FitTrackDatabase,
  programDayId: number,
  programId: number,
  userId: number
): Promise<ProgramDay | null> {
  const program = await database.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.userId, userId)),
  });
  if (!program) {
    return null;
  }

  const row = await database.query.programDays.findFirst({
    where: and(
      eq(programDays.id, programDayId),
      eq(programDays.programId, programId)
    ),
  });

  return row ? toLegacyProgramDay(row) : null;
}
