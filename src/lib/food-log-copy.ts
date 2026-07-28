import type { FoodLogEntry, MealType } from "~/db/types";

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
  const targetMeal = entriesForMeal(targetDayEntries, mealType);
  const sourceMeal = entriesForMeal(sourceDayEntries, mealType);
  return targetMeal.length === 0 && sourceMeal.length > 0;
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

export type {
  CopyFoodLogResult,
  LogMealTemplateResult,
} from "~/db/food-log-copy-queries";
export {
  copyDayEntriesInDb,
  copyMealEntriesInDb,
  deleteFoodLogEntriesInDb,
  logMealTemplateInDb,
} from "~/db/food-log-copy-queries";
