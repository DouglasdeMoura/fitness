import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import type { NutritionTotals } from "../lib/nutrition";
import {
  calculateFoodMacros,
  emptyTotals,
  sumNutritionTotals,
} from "../lib/nutrition";
import type { FoodRecord } from "./food-nutrition-queries";
import type { FitTrackDatabase } from "./index";
import { foods, mealPlans, mealTemplateItems, mealTemplates } from "./schema";
import type {
  Food,
  MealPlan,
  MealTemplate,
  MealTemplateItem,
  MealType,
} from "./types";

export type MealTemplateRecord = typeof mealTemplates.$inferSelect;
export type MealTemplateItemRecord = typeof mealTemplateItems.$inferSelect;
export type MealPlanRecord = typeof mealPlans.$inferSelect;

export interface MealTemplateItemInput {
  food_id: number;
  servings: number;
  sort_order: number;
}

export type MealTemplateDetail = MealTemplate & {
  items: (MealTemplateItem & {
    calories_per_serving: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    food_name: string;
    protein_g: number;
    serving_unit: string;
  })[];
  totals: NutritionTotals;
};

export type MealTemplateSummary = MealTemplate & {
  item_count: number;
  totals: NutritionTotals;
};

export interface SaveMealTemplateInput {
  default_meal_type: MealType;
  description?: string;
  id?: number;
  items: MealTemplateItemInput[];
  name: string;
}

export interface MealPlanWithTemplateName extends MealPlan {
  template_name: string;
}

function toLegacyMealTemplate(record: MealTemplateRecord): MealTemplate {
  return {
    created_at: record.createdAt,
    default_meal_type: record.defaultMealType,
    description: record.description,
    id: record.id,
    name: record.name,
    user_id: record.userId,
  };
}

function toLegacyMealTemplateItem(
  record: MealTemplateItemRecord
): MealTemplateItem {
  return {
    created_at: record.createdAt,
    food_id: record.foodId,
    id: record.id,
    servings: record.servings,
    sort_order: record.sortOrder,
    template_id: record.templateId,
  };
}

function toLegacyMealPlan(record: MealPlanRecord): MealPlan {
  return {
    created_at: record.createdAt,
    date: record.date,
    id: record.id,
    meal_type: record.mealType,
    template_id: record.templateId,
    user_id: record.userId,
  };
}

function foodMacrosInput(food: FoodRecord): Food {
  return {
    barcode: food.barcode,
    brand: food.brand,
    calories_per_serving: food.caloriesPerServing,
    carbs_g: food.carbsG,
    created_at: food.createdAt,
    fat_g: food.fatG,
    fiber_g: food.fiberG,
    id: food.id,
    name: food.name,
    protein_g: food.proteinG,
    serving_size: food.servingSize,
    serving_unit: food.servingUnit,
    sodium_mg: food.sodiumMg,
    source: food.source,
    sugar_g: food.sugarG,
  };
}

function macrosForTemplateItems(
  items: { food: FoodRecord; servings: number }[]
): NutritionTotals {
  return sumNutritionTotals(
    items.map((item) =>
      calculateFoodMacros(foodMacrosInput(item.food), item.servings)
    )
  );
}

/** Load one meal template with food rows and macro totals. */
export async function findMealTemplateDetail(
  database: FitTrackDatabase,
  templateId: number,
  userId: number
): Promise<MealTemplateDetail | null> {
  const template = await database.query.mealTemplates.findFirst({
    where: and(
      eq(mealTemplates.id, templateId),
      eq(mealTemplates.userId, userId)
    ),
    with: {
      items: {
        orderBy: [asc(mealTemplateItems.sortOrder)],
        with: { food: true },
      },
    },
  });

  if (!template) {
    return null;
  }

  const items = template.items.map((item) => ({
    ...toLegacyMealTemplateItem(item),
    calories_per_serving: item.food.caloriesPerServing,
    carbs_g: item.food.carbsG,
    fat_g: item.food.fatG,
    fiber_g: item.food.fiberG ?? 0,
    food_name: item.food.name,
    protein_g: item.food.proteinG,
    serving_unit: item.food.servingUnit,
  }));

  return {
    ...toLegacyMealTemplate(template),
    items,
    totals: macrosForTemplateItems(
      template.items.map((item) => ({
        food: item.food,
        servings: item.servings,
      }))
    ),
  };
}

/** Aggregate macros for one template without loading full detail. */
export async function templateMacroTotals(
  database: FitTrackDatabase,
  templateId: number,
  userId: number
): Promise<NutritionTotals> {
  const template = await database.query.mealTemplates.findFirst({
    where: and(
      eq(mealTemplates.id, templateId),
      eq(mealTemplates.userId, userId)
    ),
  });
  if (!template) {
    return emptyTotals();
  }

  const items = await database
    .select({
      food: foods,
      servings: mealTemplateItems.servings,
    })
    .from(mealTemplateItems)
    .innerJoin(foods, eq(mealTemplateItems.foodId, foods.id))
    .where(eq(mealTemplateItems.templateId, templateId));

  return macrosForTemplateItems(items);
}

/** List meal templates with item counts and macro totals. */
export async function listMealTemplateSummaries(
  database: FitTrackDatabase,
  userId: number
): Promise<MealTemplateSummary[]> {
  const templates = await database.query.mealTemplates.findMany({
    orderBy: [desc(mealTemplates.createdAt)],
    where: eq(mealTemplates.userId, userId),
    with: {
      items: {
        with: { food: true },
      },
    },
  });

  return templates.map((template) => ({
    ...toLegacyMealTemplate(template),
    item_count: template.items.length,
    totals: macrosForTemplateItems(
      template.items.map((item) => ({
        food: item.food,
        servings: item.servings,
      }))
    ),
  }));
}

/** Create or replace a meal template and its items. */
export async function saveMealTemplateRecord(
  database: FitTrackDatabase,
  userId: number,
  input: SaveMealTemplateInput
): Promise<number> {
  return database.transaction((tx) => {
    let templateId = input.id;

    if (templateId) {
      tx.update(mealTemplates)
        .set({
          defaultMealType: input.default_meal_type,
          description: input.description ?? null,
          name: input.name,
        })
        .where(
          and(
            eq(mealTemplates.id, templateId),
            eq(mealTemplates.userId, userId)
          )
        )
        .run();
    } else {
      const inserted = tx
        .insert(mealTemplates)
        .values({
          defaultMealType: input.default_meal_type,
          description: input.description ?? null,
          name: input.name,
          userId,
        })
        .returning({ id: mealTemplates.id })
        .get();
      templateId = inserted.id;
    }

    tx.delete(mealTemplateItems)
      .where(eq(mealTemplateItems.templateId, templateId as number))
      .run();

    for (const item of input.items) {
      tx.insert(mealTemplateItems)
        .values({
          foodId: item.food_id,
          servings: item.servings,
          sortOrder: item.sort_order,
          templateId: templateId as number,
        })
        .run();
    }

    return templateId as number;
  });
}

/** Delete one meal template owned by the user. */
export async function deleteMealTemplateRecord(
  database: FitTrackDatabase,
  templateId: number,
  userId: number
): Promise<void> {
  database
    .delete(mealTemplates)
    .where(
      and(eq(mealTemplates.id, templateId), eq(mealTemplates.userId, userId))
    )
    .run();
}

/** Meal plan rows for a date range with template names. */
export async function listMealPlansForWeek(
  database: FitTrackDatabase,
  userId: number,
  startDate: string,
  endDate: string
): Promise<MealPlanWithTemplateName[]> {
  const rows = await database
    .select({
      plan: mealPlans,
      template_name: mealTemplates.name,
    })
    .from(mealPlans)
    .innerJoin(mealTemplates, eq(mealPlans.templateId, mealTemplates.id))
    .where(
      and(
        eq(mealPlans.userId, userId),
        gte(mealPlans.date, startDate),
        lte(mealPlans.date, endDate)
      )
    );

  return rows.map((row) => ({
    ...toLegacyMealPlan(row.plan),
    template_name: row.template_name,
  }));
}

/** Upsert one meal-plan slot. */
export async function upsertMealPlanRecord(
  database: FitTrackDatabase,
  userId: number,
  input: { date: string; meal_type: MealType; template_id: number }
): Promise<void> {
  const owned = database
    .select({ id: mealTemplates.id })
    .from(mealTemplates)
    .where(
      and(
        eq(mealTemplates.id, input.template_id),
        eq(mealTemplates.userId, userId)
      )
    )
    .get();

  if (!owned) {
    throw new Error("Meal template not found");
  }

  database
    .insert(mealPlans)
    .values({
      date: input.date,
      mealType: input.meal_type,
      templateId: input.template_id,
      userId,
    })
    .onConflictDoUpdate({
      set: { templateId: input.template_id },
      target: [mealPlans.userId, mealPlans.date, mealPlans.mealType],
    })
    .run();
}

/** Clear one meal-plan slot. */
export async function deleteMealPlanRecord(
  database: FitTrackDatabase,
  userId: number,
  date: string,
  mealType: MealType
): Promise<void> {
  database
    .delete(mealPlans)
    .where(
      and(
        eq(mealPlans.userId, userId),
        eq(mealPlans.date, date),
        eq(mealPlans.mealType, mealType)
      )
    )
    .run();
}

/** Load one planned meal slot. */
export async function findMealPlanRecord(
  database: FitTrackDatabase,
  userId: number,
  date: string,
  mealType: MealType
): Promise<MealPlan | null> {
  const row = await database.query.mealPlans.findFirst({
    where: and(
      eq(mealPlans.userId, userId),
      eq(mealPlans.date, date),
      eq(mealPlans.mealType, mealType)
    ),
  });

  return row ? toLegacyMealPlan(row) : null;
}
