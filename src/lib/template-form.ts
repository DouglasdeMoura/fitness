// Pure mappers and validators for the meal-template editor form
// (src/routes/nutrition/templates/$templateId.tsx).
//
// Keeping these out of the route component lets the route focus on rendering
// and makes the query<->form<->payload translations unit-testable without a
// DOM. Mirrors the split already used by ~/lib/settings for the profile form.

import type { MealTemplateDetail, MealTemplateItemInput } from "~/lib/api";
import type { Food } from "~/lib/db";
import type { MealType } from "~/lib/nutrition";

/**
 * A template item as the form edits it. Extends the persisted input with the
 * denormalised food labels needed to render rows and recompute macros without
 * re-fetching. `tempId` gives React + the Astryx Table a stable key before the
 * row is saved (saved rows reuse `item-<id>`).
 */
export type EditableItem = MealTemplateItemInput & {
  tempId: string;
  food_name: string;
  serving_unit: string;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

export interface TemplateFormValues {
  defaultMealType: MealType;
  description: string;
  items: EditableItem[];
  name: string;
}

export interface TemplateSavePayload {
  default_meal_type: MealType;
  description?: string;
  id: number;
  items: MealTemplateItemInput[];
  name: string;
}

/** Empty form values used while the template query is still loading. */
export const EMPTY_TEMPLATE_FORM: TemplateFormValues = {
  defaultMealType: "lunch",
  description: "",
  items: [],
  name: "",
};

/** Stable client-only id for unsaved rows. */
export function makeTempId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Maps a meal-template query row into the form's default field values.
 *
 * @example
 * templateFormDefaults(template) // -> { name, description, defaultMealType, items }
 */
export function templateFormDefaults(
  template: MealTemplateDetail
): TemplateFormValues {
  return {
    defaultMealType: template.default_meal_type,
    description: template.description ?? "",
    items: template.items.map((item, index) => ({
      calories_per_serving: item.calories_per_serving,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
      food_id: item.food_id,
      food_name: item.food_name,
      protein_g: item.protein_g,
      serving_unit: item.serving_unit,
      servings: item.servings,
      sort_order: index + 1,
      tempId: `item-${item.id}`,
    })),
    name: template.name,
  };
}

/**
 * Maps a searched food into a new editable template item.
 * `sortOrder` is the position the item will take in the list.
 */
export function editableItemFromFood(
  food: Food,
  sortOrder: number
): EditableItem {
  return {
    calories_per_serving: food.calories_per_serving,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
    fiber_g: food.fiber_g,
    food_id: food.id,
    food_name: food.name,
    protein_g: food.protein_g,
    serving_unit: food.serving_unit,
    servings: 1,
    sort_order: sortOrder,
    tempId: makeTempId(),
  };
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
  id: number
): TemplateSavePayload {
  const description = values.description.trim();
  return {
    default_meal_type: values.defaultMealType,
    description: description || undefined,
    id,
    items: values.items.map((item, index) => ({
      food_id: item.food_id,
      servings: item.servings,
      sort_order: index + 1,
    })),
    name: values.name.trim(),
  };
}

/**
 * Array validator for the items field. An empty template is allowed (the save
 * handler clears all items), but every present item must reference a food and
 * carry a positive serving count. Returns `undefined` when valid.
 */
export function validateTemplateItems(
  items: EditableItem[]
): string | undefined {
  for (const item of items) {
    if (!item.food_id) {
      return "Every item needs a food";
    }
    if (!item.servings || item.servings <= 0) {
      return `${item.food_name} needs servings greater than 0`;
    }
  }
}

/** Fields collected on the templates list create card (src/routes/nutrition/templates/index.tsx). */
export interface CreateTemplateFormValues {
  defaultMealType: MealType;
  description: string;
  name: string;
}

export const CREATE_TEMPLATE_FORM_DEFAULTS: CreateTemplateFormValues = {
  defaultMealType: "lunch",
  description: "",
  name: "",
};

/** Returns an error message when the name is blank; otherwise `undefined`. */
export function validateCreateTemplateName(name: string): string | undefined {
  if (!name.trim()) {
    return "Template name is required.";
  }
}

/** Maps the create-template form into a saveMealTemplate payload. */
export function buildCreateTemplatePayload(
  values: CreateTemplateFormValues
): Omit<TemplateSavePayload, "id"> {
  return {
    default_meal_type: values.defaultMealType,
    description: values.description.trim() || undefined,
    items: [],
    name: values.name.trim(),
  };
}
