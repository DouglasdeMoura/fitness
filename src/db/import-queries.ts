import type { FitTrackDatabase } from "./index";
import {
  bodyLogs,
  foodLog,
  programDays,
  programExercises,
  programs,
  workoutSessions,
  workoutSets,
} from "./schema";
import type {
  FoodLogEntry,
  Program,
  ProgramDay,
  ProgramExercise,
  WorkoutSession,
  WorkoutSet,
} from "./types";
import type { BodyLogRecord } from "./user-body-queries";

export interface ImportUserDataInput {
  body_logs?: BodyLogRecord[];
  food_log?: FoodLogEntry[];
  program_days?: ProgramDay[];
  program_exercises?: ProgramExercise[];
  programs?: Program[];
  workout_sets?: WorkoutSet[];
  workouts?: WorkoutSession[];
}

export interface ImportUserDataResult {
  bodyLogs: number;
  days: number;
  exercises: number;
  foodLog: number;
  programs: number;
  sets: number;
  workouts: number;
}

export function importUserData(
  database: FitTrackDatabase,
  userId: number,
  data: ImportUserDataInput
): ImportUserDataResult {
  return database.transaction(() => {
    const rows: ImportUserDataResult = {
      bodyLogs: 0,
      days: 0,
      exercises: 0,
      foodLog: 0,
      programs: 0,
      sets: 0,
      workouts: 0,
    };

    if (data.body_logs?.length) {
      for (const record of data.body_logs) {
        database
          .insert(bodyLogs)
          .values({ ...record, userId })
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

    if (data.food_log?.length) {
      for (const entry of data.food_log) {
        database
          .insert(foodLog)
          .values({
            calories: entry.calories,
            carbsG: entry.carbs_g,
            createdAt: entry.created_at,
            customName: entry.custom_name,
            date: entry.date,
            fatG: entry.fat_g,
            foodId: entry.food_id,
            id: entry.id,
            mealType: entry.meal_type,
            notes: entry.notes,
            proteinG: entry.protein_g,
            servings: entry.servings,
            userId,
          })
          .onConflictDoUpdate({
            set: {
              calories: entry.calories,
              carbsG: entry.carbs_g,
              createdAt: entry.created_at,
              customName: entry.custom_name,
              date: entry.date,
              fatG: entry.fat_g,
              foodId: entry.food_id,
              mealType: entry.meal_type,
              notes: entry.notes,
              proteinG: entry.protein_g,
              servings: entry.servings,
              userId,
            },
            target: foodLog.id,
          })
          .run();
        rows.foodLog++;
      }
    }

    if (data.workouts?.length) {
      for (const session of data.workouts) {
        database
          .insert(workoutSessions)
          .values({
            createdAt: session.created_at,
            date: session.date,
            durationMinutes: session.duration_minutes,
            id: session.id,
            name: session.name,
            notes: session.notes,
            programDayId: session.program_day_id,
            programId: session.program_id,
            userId,
          })
          .onConflictDoUpdate({
            set: {
              createdAt: session.created_at,
              date: session.date,
              durationMinutes: session.duration_minutes,
              name: session.name,
              notes: session.notes,
              programDayId: session.program_day_id,
              programId: session.program_id,
              userId,
            },
            target: workoutSessions.id,
          })
          .run();
        rows.workouts++;
      }
    }

    if (data.workout_sets?.length) {
      for (const set of data.workout_sets) {
        database
          .insert(workoutSets)
          .values({
            createdAt: set.created_at,
            exerciseId: set.exercise_id,
            id: set.id,
            notes: set.notes,
            reps: set.reps,
            restSeconds: set.rest_seconds,
            rpe: set.rpe,
            sessionId: set.session_id,
            setNumber: set.set_number,
            weightKg: set.weight_kg,
          })
          .onConflictDoUpdate({
            set: {
              createdAt: set.created_at,
              exerciseId: set.exercise_id,
              notes: set.notes,
              reps: set.reps,
              restSeconds: set.rest_seconds,
              rpe: set.rpe,
              sessionId: set.session_id,
              setNumber: set.set_number,
              weightKg: set.weight_kg,
            },
            target: workoutSets.id,
          })
          .run();
        rows.sets++;
      }
    }

    if (data.programs?.length) {
      for (const program of data.programs) {
        database
          .insert(programs)
          .values({
            createdAt: program.created_at,
            description: program.description,
            frequencyPerWeek: program.frequency_per_week,
            id: program.id,
            isActive: program.is_active,
            name: program.name,
            periodizationType: program.periodization_type,
            progressionIncrementPct: program.progression_increment_pct,
            userId,
          })
          .onConflictDoUpdate({
            set: {
              createdAt: program.created_at,
              description: program.description,
              frequencyPerWeek: program.frequency_per_week,
              isActive: program.is_active,
              name: program.name,
              periodizationType: program.periodization_type,
              progressionIncrementPct: program.progression_increment_pct,
              userId,
            },
            target: programs.id,
          })
          .run();
        rows.programs++;
      }
    }

    if (data.program_days?.length) {
      for (const day of data.program_days) {
        database
          .insert(programDays)
          .values({
            createdAt: day.created_at,
            dayName: day.day_name,
            id: day.id,
            programId: day.program_id,
            sortOrder: day.sort_order,
          })
          .onConflictDoUpdate({
            set: {
              createdAt: day.created_at,
              dayName: day.day_name,
              programId: day.program_id,
              sortOrder: day.sort_order,
            },
            target: programDays.id,
          })
          .run();
        rows.days++;
      }
    }

    if (data.program_exercises?.length) {
      for (const exercise of data.program_exercises) {
        database
          .insert(programExercises)
          .values({
            createdAt: exercise.created_at,
            exerciseId: exercise.exercise_id,
            id: exercise.id,
            programDayId: exercise.program_day_id,
            restSeconds: exercise.rest_seconds,
            sortOrder: exercise.sort_order,
            targetReps: exercise.target_reps,
            targetRpe: exercise.target_rpe,
            targetSets: exercise.target_sets,
          })
          .onConflictDoUpdate({
            set: {
              createdAt: exercise.created_at,
              exerciseId: exercise.exercise_id,
              programDayId: exercise.program_day_id,
              restSeconds: exercise.rest_seconds,
              sortOrder: exercise.sort_order,
              targetReps: exercise.target_reps,
              targetRpe: exercise.target_rpe,
              targetSets: exercise.target_sets,
            },
            target: programExercises.id,
          })
          .run();
        rows.exercises++;
      }
    }

    return rows;
  });
}
