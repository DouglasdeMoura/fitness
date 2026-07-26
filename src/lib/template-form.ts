// Pure mappers and validators for the meal-template editor form
// (src/routes/nutrition/templates/$templateId.tsx).
//
// Keeping these out of the route component lets the route focus on rendering
// and makes the query<->form<->payload translations unit-testable without a
// DOM. Mirrors the split already used by ~/lib/settings for the profile form.

import type { MealTemplateDetail, MealTemplateItemInput } from '~/lib/api'
import type { Food } from '~/lib/db'
import type { MealType } from '~/lib/nutrition'

/**
 * A template item as the form edits it. Extends the persisted input with the
 * denormalised food labels needed to render rows and recompute macros without
 * re-fetching. `tempId` gives React + the Astryx Table a stable key before the
 * row is saved (saved rows reuse `item-<id>`).
 */
export type EditableItem = MealTemplateItemInput & {
  tempId: string
  food_name: string
  serving_unit: string
  calories_per_serving: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

export type TemplateFormValues = {
  name: string
  description: string
  defaultMealType: MealType
  items: EditableItem[]
}

export type TemplateSavePayload = {
  id: number
  name: string
  description?: string
  default_meal_type: MealType
  items: MealTemplateItemInput[]
}

/** Empty form values used while the template query is still loading. */
export const EMPTY_TEMPLATE_FORM: TemplateFormValues = {
  name: '',
  description: '',
  defaultMealType: 'lunch',
  items: [],
}

/** Stable client-only id for unsaved rows. */
export function makeTempId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Maps a meal-template query row into the form's default field values.
 *
 * @example
 * templateFormDefaults(template) // -> { name, description, defaultMealType, items }
 */
export function templateFormDefaults(template: MealTemplateDetail): TemplateFormValues {
  return {
    name: template.name,
    description: template.description ?? '',
    defaultMealType: template.default_meal_type,
    items: template.items.map((item, index) => ({
      tempId: `item-${item.id}`,
      food_id: item.food_id,
      servings: item.servings,
      sort_order: index + 1,
      food_name: item.food_name,
      serving_unit: item.serving_unit,
      calories_per_serving: item.calories_per_serving,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
    })),
  }
}

/**
 * Maps a searched food into a new editable template item.
 * `sortOrder` is the position the item will take in the list.
 */
export function editableItemFromFood(food: Food, sortOrder: number): EditableItem {
  return {
    tempId: makeTempId(),
    food_id: food.id,
    servings: 1,
    sort_order: sortOrder,
    food_name: food.name,
    serving_unit: food.serving_unit,
    calories_per_serving: food.calories_per_serving,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
    fiber_g: food.fiber_g,
  }
}

/**
 * Maps form values into the saveMealTemplate server-fn input.
 *
 * Reindexes sort_order from array position so removals never leave gaps, and
 * trims text fields. An empty description becomes `undefined` so the column
 * stores NULL rather than an empty string.
 */
export function buildTemplateSavePayload(
  values: TemplateFormValues,
  id: number,
): TemplateSavePayload {
  const description = values.description.trim()
  return {
    id,
    name: values.name.trim(),
    description: description || undefined,
    default_meal_type: values.defaultMealType,
    items: values.items.map((item, index) => ({
      food_id: item.food_id,
      servings: item.servings,
      sort_order: index + 1,
    })),
  }
}

/**
 * Array validator for the items field. An empty template is allowed (the save
 * handler clears all items), but every present item must reference a food and
 * carry a positive serving count. Returns `undefined` when valid.
 */
export function validateTemplateItems(items: EditableItem[]): string | undefined {
  for (const item of items) {
    if (!item.food_id) return 'Every item needs a food'
    if (!item.servings || item.servings <= 0) {
      return `${item.food_name} needs servings greater than 0`
    }
  }
  return undefined
}
