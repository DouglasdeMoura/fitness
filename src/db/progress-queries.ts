import { and, desc, eq, gte, isNotNull, lte, sql, sum } from "drizzle-orm";

import type { FitTrackDatabase } from "./index";
import { exercises, foodLog, workoutSessions, workoutSets } from "./schema";

export interface ProgressHighlights {
  bestLift: { exercise: string; weightKg: number; reps: number } | null;
  monthlyVolumeKg: number;
  workoutStreak: number;
}

export function getProgressHighlights(
  database: FitTrackDatabase,
  userId: number,
  now = new Date()
): ProgressHighlights {
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const bestLiftRow = database
    .select({
      exercise: exercises.name,
      reps: workoutSets.reps,
      weightKg: workoutSets.weightKg,
    })
    .from(workoutSets)
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, monthStart),
        isNotNull(workoutSets.weightKg)
      )
    )
    .orderBy(desc(workoutSets.weightKg))
    .limit(1)
    .get();

  const bestLift = bestLiftRow?.weightKg
    ? {
        exercise: bestLiftRow.exercise,
        reps: bestLiftRow.reps ?? 0,
        weightKg: bestLiftRow.weightKg,
      }
    : null;

  const volumeRow = database
    .select({
      total: sql<number>`coalesce(sum(${workoutSets.reps} * ${workoutSets.weightKg}), 0)`,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, monthStart)
      )
    )
    .get();

  const today = now.toISOString().slice(0, 10);
  const streakRows = database
    .select({ date: workoutSessions.date })
    .from(workoutSessions)
    .where(
      and(eq(workoutSessions.userId, userId), lte(workoutSessions.date, today))
    )
    .groupBy(workoutSessions.date)
    .orderBy(desc(workoutSessions.date))
    .limit(90)
    .all();

  let streak = 0;
  const streakDates = new Set(streakRows.map((row) => row.date));
  const checkDate = new Date(now);
  while (true) {
    const d = checkDate.toISOString().slice(0, 10);
    if (streakDates.has(d)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (streak === 0 && d === today) {
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    bestLift,
    monthlyVolumeKg: Math.round(volumeRow?.total ?? 0),
    workoutStreak: streak,
  };
}

export function listDistinctFoodLogDates(
  database: FitTrackDatabase,
  userId: number,
  start?: string,
  end?: string
): string[] {
  const conditions = [eq(foodLog.userId, userId)];
  if (start) {
    conditions.push(gte(foodLog.date, start));
  }
  if (end) {
    conditions.push(lte(foodLog.date, end));
  }
  return database
    .selectDistinct({ date: foodLog.date })
    .from(foodLog)
    .where(and(...conditions))
    .orderBy(foodLog.date)
    .all()
    .map((row) => row.date);
}

export function listDistinctWorkoutSessionDates(
  database: FitTrackDatabase,
  userId: number,
  start?: string,
  end?: string
): string[] {
  const conditions = [eq(workoutSessions.userId, userId)];
  if (start) {
    conditions.push(gte(workoutSessions.date, start));
  }
  if (end) {
    conditions.push(lte(workoutSessions.date, end));
  }
  return database
    .selectDistinct({ date: workoutSessions.date })
    .from(workoutSessions)
    .where(and(...conditions))
    .orderBy(workoutSessions.date)
    .all()
    .map((row) => row.date);
}

export function listWeeklyNutritionAggregates(
  database: FitTrackDatabase,
  userId: number,
  start: string,
  end: string
) {
  return database
    .select({
      calories: sum(foodLog.calories),
      date: foodLog.date,
      protein_g: sum(foodLog.proteinG),
    })
    .from(foodLog)
    .where(
      and(
        eq(foodLog.userId, userId),
        gte(foodLog.date, start),
        lte(foodLog.date, end)
      )
    )
    .groupBy(foodLog.date)
    .all()
    .map((row) => ({
      calories: Number(row.calories ?? 0),
      date: row.date,
      protein_g: Number(row.protein_g ?? 0),
    }));
}

export function listWeeklyWorkoutSetRows(
  database: FitTrackDatabase,
  userId: number,
  start: string,
  end: string
) {
  return database
    .select({
      date: workoutSessions.date,
      exercise_id: workoutSets.exerciseId,
      reps: workoutSets.reps,
      weight_kg: workoutSets.weightKg,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, start),
        lte(workoutSessions.date, end)
      )
    )
    .all();
}

export function countWorkoutDaysSince(
  database: FitTrackDatabase,
  userId: number,
  sinceDate: string
): number {
  return database
    .selectDistinct({ date: workoutSessions.date })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, sinceDate)
      )
    )
    .all().length;
}
