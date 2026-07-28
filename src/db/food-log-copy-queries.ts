import { and, asc, eq } from "drizzle-orm";

import type { MealType } from "../lib/nutrition";
import { calculateFoodMacros } from "../lib/nutrition";
import type { FoodLogRecord } from "./food-nutrition-queries";
import type { FitTrackDatabase } from "./index";
import { foodLog, foods, mealTemplateItems, mealTemplates } from "./schema";
import type { FoodLogEntry, MealTemplate } from "./types";

export function toLegacyFoodLogEntry(entry: FoodLogRecord): FoodLogEntry {
  return {
    calories: entry.calories,
    carbs_g: entry.carbsG,
    created_at: entry.createdAt,
    custom_name: entry.customName,
    date: entry.date,
    fat_g: entry.fatG,
    food_id: entry.foodId,
    id: entry.id,
    meal_type: entry.mealType,
    notes: entry.notes,
    protein_g: entry.proteinG,
    servings: entry.servings,
    user_id: entry.userId,
  };
}

export interface CopyFoodLogResult {
  entries: FoodLogEntry[];
}

function loadLegacyDayEntries(
  database: FitTrackDatabase,
  userId: number,
  date: string
): FoodLogEntry[] {
  return database
    .select()
    .from(foodLog)
    .where(and(eq(foodLog.userId, userId), eq(foodLog.date, date)))
    .orderBy(asc(foodLog.mealType), asc(foodLog.createdAt))
    .all()
    .map(toLegacyFoodLogEntry);
}

function insertClonedEntry(
  database: FitTrackDatabase,
  userId: number,
  source: FoodLogEntry,
  toDate: string,
  mealType: MealType
): FoodLogEntry {
  const record = database
    .insert(foodLog)
    .values({
      calories: source.calories,
      carbsG: source.carbs_g,
      customName: source.custom_name,
      date: toDate,
      fatG: source.fat_g,
      foodId: source.food_id,
      mealType,
      notes: source.notes,
      proteinG: source.protein_g,
      servings: source.servings,
      userId,
    })
    .returning()
    .get();
  return toLegacyFoodLogEntry(record);
}

export function copyMealEntriesInDb(
  database: FitTrackDatabase,
  userId: number,
  fromDate: string,
  toDate: string,
  mealType: MealType,
  canCopy: (
    targetDay: FoodLogEntry[],
    sourceDay: FoodLogEntry[],
    meal: MealType
  ) => boolean,
  entriesForMeal: (entries: FoodLogEntry[], meal: MealType) => FoodLogEntry[]
): CopyFoodLogResult {
  const targetDay = loadLegacyDayEntries(database, userId, toDate);
  const sourceDay = loadLegacyDayEntries(database, userId, fromDate);
  if (!canCopy(targetDay, sourceDay, mealType)) {
    throw new Error(
      `Cannot copy ${mealType} from ${fromDate} to ${toDate}: target meal must be empty and source meal must have entries`
    );
  }

  const sources = entriesForMeal(sourceDay, mealType);
  const entries = database.transaction(() =>
    sources.map((source) =>
      insertClonedEntry(database, userId, source, toDate, mealType)
    )
  );
  return { entries };
}

export function copyDayEntriesInDb(
  database: FitTrackDatabase,
  userId: number,
  fromDate: string,
  toDate: string,
  canCopy: (targetDay: FoodLogEntry[], sourceDay: FoodLogEntry[]) => boolean
): CopyFoodLogResult {
  const targetDay = loadLegacyDayEntries(database, userId, toDate);
  const sourceDay = loadLegacyDayEntries(database, userId, fromDate);
  if (!canCopy(targetDay, sourceDay)) {
    throw new Error(
      `Cannot copy day from ${fromDate} to ${toDate}: target day must be empty and source day must have entries`
    );
  }

  const entries = database.transaction(() =>
    sourceDay.map((source) =>
      insertClonedEntry(database, userId, source, toDate, source.meal_type)
    )
  );
  return { entries };
}

export function deleteFoodLogEntriesInDb(
  database: FitTrackDatabase,
  userId: number,
  ids: number[]
): { deleted_ids: number[] } {
  if (ids.length === 0) {
    throw new Error("deleteFoodLogRecordsInDb requires at least one id");
  }

  const deleted = database.transaction(() => {
    const removed: number[] = [];
    for (const id of ids) {
      const result = database
        .delete(foodLog)
        .where(and(eq(foodLog.id, id), eq(foodLog.userId, userId)))
        .run();
      if (result.changes > 0) {
        removed.push(id);
      }
    }
    return removed;
  });

  if (deleted.length !== ids.length) {
    throw new Error(
      `Expected to delete ${ids.length} food_log rows but removed ${deleted.length}: ids=${JSON.stringify(ids)}`
    );
  }

  return { deleted_ids: deleted };
}

export interface LogMealTemplateResult {
  entries: FoodLogEntry[];
  template_name: string;
  total_calories: number;
}

function toLegacyMealTemplate(record: {
  createdAt: string;
  defaultMealType: MealType;
  description: string | null;
  id: number;
  name: string;
  userId: number;
}): MealTemplate {
  return {
    created_at: record.createdAt,
    default_meal_type: record.defaultMealType,
    description: record.description,
    id: record.id,
    name: record.name,
    user_id: record.userId,
  };
}

export function logMealTemplateInDb(
  database: FitTrackDatabase,
  userId: number,
  templateId: number,
  date: string,
  mealType: MealType
): LogMealTemplateResult {
  const templateRow = database
    .select()
    .from(mealTemplates)
    .where(
      and(eq(mealTemplates.id, templateId), eq(mealTemplates.userId, userId))
    )
    .get();
  if (!templateRow) {
    throw new Error(`Meal template ${templateId} not found for user ${userId}`);
  }
  const template = toLegacyMealTemplate(templateRow);

  const items = database
    .select({
      caloriesPerServing: foods.caloriesPerServing,
      carbsG: foods.carbsG,
      fatG: foods.fatG,
      fiberG: foods.fiberG,
      foodId: mealTemplateItems.foodId,
      proteinG: foods.proteinG,
      servings: mealTemplateItems.servings,
    })
    .from(mealTemplateItems)
    .innerJoin(foods, eq(mealTemplateItems.foodId, foods.id))
    .where(eq(mealTemplateItems.templateId, templateId))
    .orderBy(asc(mealTemplateItems.sortOrder))
    .all();

  if (items.length === 0) {
    throw new Error(
      `Meal template "${template.name}" (id ${templateId}) has no items to log`
    );
  }

  const logged = database.transaction(() => {
    const entries: FoodLogEntry[] = [];
    let totalCalories = 0;
    for (const item of items) {
      const macros = calculateFoodMacros(
        {
          calories_per_serving: item.caloriesPerServing,
          carbs_g: item.carbsG,
          fat_g: item.fatG,
          fiber_g: item.fiberG,
          protein_g: item.proteinG,
        },
        item.servings
      );
      totalCalories += macros.calories;
      const record = database
        .insert(foodLog)
        .values({
          calories: macros.calories,
          carbsG: macros.carbs_g,
          customName: null,
          date,
          fatG: macros.fat_g,
          foodId: item.foodId,
          mealType,
          notes: `From template: ${template.name}`,
          proteinG: macros.protein_g,
          servings: item.servings,
          userId,
        })
        .returning()
        .get();
      entries.push(toLegacyFoodLogEntry(record));
    }
    return { entries, total_calories: totalCalories };
  });

  return { ...logged, template_name: template.name };
}
