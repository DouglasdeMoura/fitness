import type Database from "better-sqlite3";

import type { FoodLogEntry } from "./db";
import type { MealType } from "./nutrition";
import { addDays } from "./nutrition";

/** Entries for one meal on a given day. */
export function entriesForMeal(
  entries: FoodLogEntry[],
  mealType: MealType
): FoodLogEntry[] {
  return entries.filter((entry) => entry.meal_type === mealType);
}

/**
 * Meal copy is available when the target meal is empty and the source meal is not.
 * @example canCopyMealFromDate([], sourceBreakfast, 'breakfast') // sourceBreakfast.length > 0
 */
export function canCopyMealFromDate(
  targetDayEntries: FoodLogEntry[],
  sourceDayEntries: FoodLogEntry[],
  mealType: MealType
): boolean {
  return (
    entriesForMeal(targetDayEntries, mealType).length === 0 &&
    entriesForMeal(sourceDayEntries, mealType).length > 0
  );
}

/**
 * Day copy is available when the target day is empty and the source day is not.
 * @example canCopyDayFromDate([], [{ id: 1, ... }]) // true
 */
export function canCopyDayFromDate(
  targetDayEntries: FoodLogEntry[],
  sourceDayEntries: FoodLogEntry[]
): boolean {
  return targetDayEntries.length === 0 && sourceDayEntries.length > 0;
}

/** Calendar day immediately before `date` (YYYY-MM-DD). */
export function previousDay(date: string): string {
  return addDays(date, -1);
}

export interface CopyFoodLogResult {
  entries: FoodLogEntry[];
}

const SELECT_BY_DATE = `
  SELECT * FROM food_log
  WHERE user_id = ? AND date = ?
  ORDER BY meal_type, created_at
`;

const INSERT_ENTRY = `
  INSERT INTO food_log (
    user_id, food_id, custom_name, date, meal_type,
    servings, calories, protein_g, carbs_g, fat_g, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function loadDayEntries(
  db: Database.Database,
  userId: number,
  date: string
): FoodLogEntry[] {
  return db.prepare(SELECT_BY_DATE).all(userId, date) as FoodLogEntry[];
}

function insertClonedEntry(
  db: Database.Database,
  userId: number,
  source: FoodLogEntry,
  toDate: string,
  mealType: MealType
): FoodLogEntry {
  const result = db
    .prepare(INSERT_ENTRY)
    .run(
      userId,
      source.food_id,
      source.custom_name,
      toDate,
      mealType,
      source.servings,
      source.calories,
      source.protein_g,
      source.carbs_g,
      source.fat_g,
      source.notes
    );
  return db
    .prepare("SELECT * FROM food_log WHERE id = ?")
    .get(result.lastInsertRowid) as FoodLogEntry;
}

/**
 * Clone every entry of one meal from `fromDate` onto `toDate` in a single transaction.
 * @example copyMealEntriesInDb(db, 1, '2026-07-26', '2026-07-27', 'breakfast')
 */
export function copyMealEntriesInDb(
  db: Database.Database,
  userId: number,
  fromDate: string,
  toDate: string,
  mealType: MealType
): CopyFoodLogResult {
  const targetDay = loadDayEntries(db, userId, toDate);
  const sourceDay = loadDayEntries(db, userId, fromDate);
  if (!canCopyMealFromDate(targetDay, sourceDay, mealType)) {
    throw new Error(
      `Cannot copy ${mealType} from ${fromDate} to ${toDate}: target meal must be empty and source meal must have entries`
    );
  }

  const sources = entriesForMeal(sourceDay, mealType);
  const copy = db.transaction(() =>
    sources.map((source) =>
      insertClonedEntry(db, userId, source, toDate, mealType)
    )
  );
  return { entries: copy() };
}

/**
 * Clone an entire day from `fromDate` onto `toDate` in a single transaction.
 * @example copyDayEntriesInDb(db, 1, '2026-07-26', '2026-07-27')
 */
export function copyDayEntriesInDb(
  db: Database.Database,
  userId: number,
  fromDate: string,
  toDate: string
): CopyFoodLogResult {
  const targetDay = loadDayEntries(db, userId, toDate);
  const sourceDay = loadDayEntries(db, userId, fromDate);
  if (!canCopyDayFromDate(targetDay, sourceDay)) {
    throw new Error(
      `Cannot copy day from ${fromDate} to ${toDate}: target day must be empty and source day must have entries`
    );
  }

  const copy = db.transaction(() =>
    sourceDay.map((source) =>
      insertClonedEntry(db, userId, source, toDate, source.meal_type)
    )
  );
  return { entries: copy() };
}

/**
 * Delete food-log rows by id for undo after a copy. Runs in one transaction.
 * @example deleteFoodLogEntriesInDb(db, 1, [12, 13, 14])
 */
export function deleteFoodLogEntriesInDb(
  db: Database.Database,
  userId: number,
  ids: number[]
): { deleted_ids: number[] } {
  if (ids.length === 0) {
    throw new Error("deleteFoodLogEntriesInDb requires at least one id");
  }

  const remove = db.prepare(
    "DELETE FROM food_log WHERE id = ? AND user_id = ?"
  );
  const deleted = db.transaction(() => {
    const removed: number[] = [];
    for (const id of ids) {
      const outcome = remove.run(id, userId);
      if (outcome.changes > 0) {
        removed.push(id);
      }
    }
    return removed;
  })();

  if (deleted.length !== ids.length) {
    throw new Error(
      `Expected to delete ${ids.length} food_log rows but removed ${deleted.length}: ids=${JSON.stringify(ids)}`
    );
  }

  return { deleted_ids: deleted };
}
