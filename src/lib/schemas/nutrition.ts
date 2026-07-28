import { z } from "zod";

import {
  isoDateSchema,
  mealTypeSchema,
  nonNegativeFiniteSchema,
  positiveIntSchema,
  rowIdSchema,
} from "./common";

export const searchFoodsQuerySchema = z.object({
  limit: positiveIntSchema.optional(),
  query: z.string(),
});

export const getFoodByBarcodeQuerySchema = z.object({
  barcode: z.string().min(1),
});

export const addFoodInputSchema = z.object({
  barcode: z.string().nullable().optional(),
  brand: z.string().nullable(),
  calories_per_serving: nonNegativeFiniteSchema,
  carbs_g: nonNegativeFiniteSchema,
  fat_g: nonNegativeFiniteSchema,
  fiber_g: nonNegativeFiniteSchema,
  name: z.string().min(1),
  protein_g: nonNegativeFiniteSchema,
  serving_size: nonNegativeFiniteSchema,
  serving_unit: z.string().min(1),
  sodium_mg: nonNegativeFiniteSchema,
  source: z.string().optional(),
  sugar_g: nonNegativeFiniteSchema,
});

export type AddFoodInput = z.infer<typeof addFoodInputSchema>;

export const addFoodLogEntryInputSchema = z.object({
  calories: nonNegativeFiniteSchema,
  carbs_g: nonNegativeFiniteSchema,
  custom_name: z.string().optional(),
  date: isoDateSchema.optional(),
  fat_g: nonNegativeFiniteSchema,
  food_id: rowIdSchema.optional(),
  meal_type: mealTypeSchema,
  notes: z.string().optional(),
  protein_g: nonNegativeFiniteSchema,
  servings: nonNegativeFiniteSchema,
});

export type AddFoodLogEntryInput = z.infer<typeof addFoodLogEntryInputSchema>;

export const deleteFoodLogEntriesInputSchema = z.object({
  ids: z.array(rowIdSchema).min(1),
});

export const copyMealFromDateInputSchema = z.object({
  fromDate: isoDateSchema,
  mealType: mealTypeSchema,
  toDate: isoDateSchema,
});

export const copyDayFromDateInputSchema = z.object({
  fromDate: isoDateSchema,
  toDate: isoDateSchema,
});

export const logMealTemplateInputSchema = z.object({
  date: isoDateSchema,
  mealType: mealTypeSchema,
  templateId: rowIdSchema,
});

export const mealTemplateItemInputSchema = z.object({
  food_id: rowIdSchema,
  servings: nonNegativeFiniteSchema,
  sort_order: positiveIntSchema,
});

export type MealTemplateItemInput = z.infer<typeof mealTemplateItemInputSchema>;

export const saveMealTemplateInputSchema = z.object({
  default_meal_type: mealTypeSchema,
  description: z.string().optional(),
  id: rowIdSchema.optional(),
  items: z.array(mealTemplateItemInputSchema).min(1),
  name: z.string().min(1),
});

export type SaveMealTemplateInput = z.infer<typeof saveMealTemplateInputSchema>;

export const setMealPlanInputSchema = z.object({
  date: isoDateSchema,
  meal_type: mealTypeSchema,
  template_id: rowIdSchema,
});

export const mealPlanSlotInputSchema = z.object({
  date: isoDateSchema,
  meal_type: mealTypeSchema,
});

export const optionalWeekStartQuerySchema = z
  .object({ start_date: isoDateSchema.optional() })
  .optional()
  .transform((value) => value ?? {});

export const foodLogEntryImportSchema = z.object({
  calories: nonNegativeFiniteSchema,
  carbs_g: nonNegativeFiniteSchema,
  created_at: z.string(),
  custom_name: z.string().nullable(),
  date: isoDateSchema,
  fat_g: nonNegativeFiniteSchema,
  food_id: rowIdSchema.nullable(),
  id: rowIdSchema,
  meal_type: mealTypeSchema,
  notes: z.string().nullable(),
  protein_g: nonNegativeFiniteSchema,
  servings: nonNegativeFiniteSchema,
  user_id: rowIdSchema,
});

export {
  optionalIsoDateQuerySchema as getFoodLogQuerySchema,
  optionalIsoDateQuerySchema as getNutritionSummaryQuerySchema,
  optionalLimitQuerySchema as getAllFoodsQuerySchema,
  rowIdInputSchema as deleteFoodLogEntryInputSchema,
  rowIdInputSchema as deleteMealTemplateInputSchema,
  rowIdInputSchema as getMealTemplateQuerySchema,
} from "./common";
