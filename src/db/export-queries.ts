import { eq } from "drizzle-orm";

import type { FitTrackDatabase } from ".";
import {
  bodyLogs,
  foodLog,
  programDays,
  programExercises,
  programs,
  workoutSessions,
  workoutSets,
} from "./schema";

const FOOD_LOG_EXPORT_COLUMNS = {
  calories: foodLog.calories,
  carbs_g: foodLog.carbsG,
  created_at: foodLog.createdAt,
  custom_name: foodLog.customName,
  date: foodLog.date,
  fat_g: foodLog.fatG,
  food_id: foodLog.foodId,
  id: foodLog.id,
  meal_type: foodLog.mealType,
  notes: foodLog.notes,
  protein_g: foodLog.proteinG,
  servings: foodLog.servings,
  user_id: foodLog.userId,
};

const WORKOUT_EXPORT_COLUMNS = {
  created_at: workoutSessions.createdAt,
  date: workoutSessions.date,
  duration_minutes: workoutSessions.durationMinutes,
  id: workoutSessions.id,
  name: workoutSessions.name,
  notes: workoutSessions.notes,
  program_day_id: workoutSessions.programDayId,
  program_id: workoutSessions.programId,
  user_id: workoutSessions.userId,
};

const WORKOUT_SET_EXPORT_COLUMNS = {
  created_at: workoutSets.createdAt,
  exercise_id: workoutSets.exerciseId,
  id: workoutSets.id,
  notes: workoutSets.notes,
  reps: workoutSets.reps,
  rest_seconds: workoutSets.restSeconds,
  rpe: workoutSets.rpe,
  session_id: workoutSets.sessionId,
  set_number: workoutSets.setNumber,
  weight_kg: workoutSets.weightKg,
};

const PROGRAM_EXPORT_COLUMNS = {
  created_at: programs.createdAt,
  description: programs.description,
  frequency_per_week: programs.frequencyPerWeek,
  id: programs.id,
  is_active: programs.isActive,
  name: programs.name,
  periodization_type: programs.periodizationType,
  progression_increment_pct: programs.progressionIncrementPct,
  user_id: programs.userId,
};

const PROGRAM_DAY_EXPORT_COLUMNS = {
  created_at: programDays.createdAt,
  day_name: programDays.dayName,
  id: programDays.id,
  program_id: programDays.programId,
  sort_order: programDays.sortOrder,
};

const PROGRAM_EXERCISE_EXPORT_COLUMNS = {
  created_at: programExercises.createdAt,
  exercise_id: programExercises.exerciseId,
  id: programExercises.id,
  program_day_id: programExercises.programDayId,
  rest_seconds: programExercises.restSeconds,
  sort_order: programExercises.sortOrder,
  target_reps: programExercises.targetReps,
  target_rpe: programExercises.targetRpe,
  target_sets: programExercises.targetSets,
};

/** Export one user's body and food logs. Example: `await exportNutritionRecords(db, 1)`. */
export async function exportNutritionRecords(
  database: FitTrackDatabase,
  userId: number
) {
  const [body_logs, food_log] = await Promise.all([
    database.query.bodyLogs.findMany({ where: eq(bodyLogs.userId, userId) }),
    database
      .select(FOOD_LOG_EXPORT_COLUMNS)
      .from(foodLog)
      .where(eq(foodLog.userId, userId)),
  ]);
  return { body_logs, food_log };
}

async function exportWorkoutRecords(
  database: FitTrackDatabase,
  userId: number
) {
  const [workouts, workout_sets] = await Promise.all([
    database
      .select(WORKOUT_EXPORT_COLUMNS)
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, userId)),
    database
      .select(WORKOUT_SET_EXPORT_COLUMNS)
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
      .where(eq(workoutSessions.userId, userId)),
  ]);
  return { workout_sets, workouts };
}

async function exportProgramRecords(
  database: FitTrackDatabase,
  userId: number
) {
  const [programRows, dayRows, exerciseRows] = await Promise.all([
    database
      .select(PROGRAM_EXPORT_COLUMNS)
      .from(programs)
      .where(eq(programs.userId, userId)),
    database
      .select(PROGRAM_DAY_EXPORT_COLUMNS)
      .from(programDays)
      .innerJoin(programs, eq(programDays.programId, programs.id))
      .where(eq(programs.userId, userId)),
    database
      .select(PROGRAM_EXERCISE_EXPORT_COLUMNS)
      .from(programExercises)
      .innerJoin(programDays, eq(programExercises.programDayId, programDays.id))
      .innerJoin(programs, eq(programDays.programId, programs.id))
      .where(eq(programs.userId, userId)),
  ]);
  return {
    program_days: dayRows,
    program_exercises: exerciseRows,
    programs: programRows,
  };
}

/** Export one user's linked workout and program records. Example: `await exportTrainingRecords(db, 1)`. */
export async function exportTrainingRecords(
  database: FitTrackDatabase,
  userId: number
) {
  const [workoutRecords, programRecords] = await Promise.all([
    exportWorkoutRecords(database, userId),
    exportProgramRecords(database, userId),
  ]);
  return { ...programRecords, ...workoutRecords };
}
