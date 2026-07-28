import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";

import type { FitTrackDatabase } from ".";
import { foodLog, foods } from "./schema";

export type FoodRecord = typeof foods.$inferSelect;
export type NewFoodRecord = typeof foods.$inferInsert;
export type FoodLogRecord = typeof foodLog.$inferSelect;
export type NewFoodLogRecord = typeof foodLog.$inferInsert;

/** Search catalog names and brands. Example: `await searchFoodRecords(db, "oat", 20)`. */
export async function searchFoodRecords(
  database: FitTrackDatabase,
  query: string,
  limit: number
): Promise<FoodRecord[]> {
  const pattern = `%${query}%`;
  return database.query.foods.findMany({
    limit,
    orderBy: asc(foods.name),
    where: or(
      sql`${foods.name} LIKE ${pattern}`,
      sql`${foods.brand} LIKE ${pattern}`
    ),
  });
}

/** List catalog foods alphabetically. Example: `await listFoodRecords(db, 100)`. */
export async function listFoodRecords(
  database: FitTrackDatabase,
  limit: number
): Promise<FoodRecord[]> {
  return database.query.foods.findMany({
    limit,
    orderBy: asc(foods.name),
  });
}

/** Insert and return a catalog food. Example: `await insertFoodRecord(db, input)`. */
export async function insertFoodRecord(
  database: FitTrackDatabase,
  food: NewFoodRecord
): Promise<FoodRecord> {
  return database.insert(foods).values(food).returning().get();
}

/** List a user's dated food log. Example: `await listFoodLogRecords(db, 1, date)`. */
export async function listFoodLogRecords(
  database: FitTrackDatabase,
  userId: number,
  date: string
): Promise<FoodLogRecord[]> {
  return database.query.foodLog.findMany({
    orderBy: [asc(foodLog.mealType), asc(foodLog.createdAt)],
    where: and(eq(foodLog.userId, userId), eq(foodLog.date, date)),
  });
}

/** Insert and return a food-log row. Example: `await insertFoodLogRecord(db, input)`. */
export async function insertFoodLogRecord(
  database: FitTrackDatabase,
  entry: NewFoodLogRecord
): Promise<FoodLogRecord> {
  return database.insert(foodLog).values(entry).returning().get();
}

/** Delete one user's food-log row. Example: `await deleteFoodLogRecord(db, 1, 42)`. */
export async function deleteFoodLogRecord(
  database: FitTrackDatabase,
  userId: number,
  entryId: number
): Promise<void> {
  await database
    .delete(foodLog)
    .where(and(eq(foodLog.id, entryId), eq(foodLog.userId, userId)));
}

/** List dated entries with catalog names. Example: `await listFoodLogSummaryRecords(db, 1, date)`. */
export async function listFoodLogSummaryRecords(
  database: FitTrackDatabase,
  userId: number,
  date: string
) {
  return database
    .select({ ...getTableColumns(foodLog), foodName: foods.name })
    .from(foodLog)
    .leftJoin(foods, eq(foods.id, foodLog.foodId))
    .where(and(eq(foodLog.userId, userId), eq(foodLog.date, date)))
    .orderBy(asc(foodLog.mealType), asc(foodLog.createdAt));
}

/** Aggregate daily nutrition since a date. Example: `await listWeeklyNutritionRows(db, 1, date)`. */
export async function listWeeklyNutritionRows(
  database: FitTrackDatabase,
  userId: number,
  sinceDate: string
) {
  return database
    .select({
      calories: sql<number>`sum(${foodLog.calories})`,
      carbsG: sql<number>`sum(${foodLog.carbsG})`,
      date: foodLog.date,
      entries: count(),
      fatG: sql<number>`sum(${foodLog.fatG})`,
      proteinG: sql<number>`sum(${foodLog.proteinG})`,
    })
    .from(foodLog)
    .where(and(eq(foodLog.userId, userId), gte(foodLog.date, sinceDate)))
    .groupBy(foodLog.date)
    .orderBy(desc(foodLog.date));
}

/**
 * CTE narrowing the log to one row per food — the most recently logged one.
 *
 * A window function rather than GROUP BY because `servings` and `mealType` must
 * come from that specific latest row. SQLite's bare-column GROUP BY would pick
 * an arbitrary row per group and quietly suggest the wrong portion size.
 */
function latestFoodLogCte(database: FitTrackDatabase, userId: number) {
  return database.$with("latest").as(
    database
      .select({
        createdAt: foodLog.createdAt,
        date: foodLog.date,
        foodId: foodLog.foodId,
        mealType: foodLog.mealType,
        rn: sql<number>`row_number() over (partition by ${foodLog.foodId} order by ${foodLog.date} desc, ${foodLog.createdAt} desc)`.as(
          "rn"
        ),
        servings: foodLog.servings,
      })
      .from(foodLog)
      .where(and(eq(foodLog.userId, userId), isNotNull(foodLog.foodId)))
  );
}

/** Distinct foods by most recent log. Example: `await listRecentFoodRecords(db, 1, 20)`. */
export async function listRecentFoodRecords(
  database: FitTrackDatabase,
  userId: number,
  limit: number
) {
  const latest = latestFoodLogCte(database, userId);
  return database
    .with(latest)
    .select({
      ...getTableColumns(foods),
      lastMealType: latest.mealType,
      lastServings: latest.servings,
    })
    .from(latest)
    .innerJoin(foods, eq(foods.id, latest.foodId))
    .where(eq(latest.rn, 1))
    .orderBy(desc(latest.date), desc(latest.createdAt))
    .limit(limit);
}

/** Distinct foods by log count since a date. Example: `await listFrequentFoodRecords(db, 1, since, 20)`. */
export async function listFrequentFoodRecords(
  database: FitTrackDatabase,
  userId: number,
  sinceDate: string,
  limit: number
) {
  const latest = latestFoodLogCte(database, userId);
  const frequent = database.$with("freq").as(
    database
      .select({ foodId: foodLog.foodId, logCount: count().as("log_count") })
      .from(foodLog)
      .where(
        and(
          eq(foodLog.userId, userId),
          isNotNull(foodLog.foodId),
          gte(foodLog.date, sinceDate)
        )
      )
      .groupBy(foodLog.foodId)
      .orderBy(desc(count()))
      .limit(limit)
  );
  return database
    .with(latest, frequent)
    .select({
      ...getTableColumns(foods),
      lastMealType: latest.mealType,
      lastServings: latest.servings,
      logCount: frequent.logCount,
    })
    .from(frequent)
    .innerJoin(foods, eq(foods.id, frequent.foodId))
    .innerJoin(
      latest,
      and(eq(latest.foodId, frequent.foodId), eq(latest.rn, 1))
    )
    .orderBy(desc(frequent.logCount));
}

/** All-time log counts plus last-used portion, for search ranking. */
export async function listFoodLogStatsRecords(
  database: FitTrackDatabase,
  userId: number
) {
  const latest = latestFoodLogCte(database, userId);
  const counts = database.$with("counts").as(
    database
      .select({ foodId: foodLog.foodId, logCount: count().as("log_count") })
      .from(foodLog)
      .where(and(eq(foodLog.userId, userId), isNotNull(foodLog.foodId)))
      .groupBy(foodLog.foodId)
  );
  return database
    .with(latest, counts)
    .select({
      foodId: counts.foodId,
      lastMealType: latest.mealType,
      lastServings: latest.servings,
      logCount: counts.logCount,
    })
    .from(counts)
    .innerJoin(latest, and(eq(latest.foodId, counts.foodId), eq(latest.rn, 1)));
}
