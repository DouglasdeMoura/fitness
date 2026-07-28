// Helpers for the "create custom food" form. Kept out of the component so the
// draft → payload mapping and the validity rule can be unit-tested in isolation
// (the unit suite runs in the node environment, without a React host).

import type { Food } from "./db";

/**
 * Form-friendly shape for creating a custom food. Mirrors the persisted Food
 * row but with input-friendly types: numeric fields are `number | null` until
 * the user enters a value, so inputs can render empty instead of "0".
 */
export interface CustomFoodDraft {
  name: string;
  brand: string;
  servingSize: number | null;
  servingUnit: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  barcode: string;
}

/** A fresh draft with the sensible defaults a new custom food starts from. */
export const EMPTY_CUSTOM_FOOD_DRAFT: CustomFoodDraft = {
  barcode: "",
  brand: "",
  calories: null,
  carbs: null,
  fat: null,
  name: "",
  protein: null,
  servingSize: 100,
  servingUnit: "g",
};

/** Persisted shape the `addFood` server function expects (server fills the rest). */
export type CustomFoodPayload = Omit<Food, "id" | "created_at" | "source">;

/**
 * True when the draft has the minimum fields required to persist a custom food.
 * Name and calories are mandatory; everything else defaults to 0 in the payload.
 * @example isCustomFoodDraftValid({ ...EMPTY_CUSTOM_FOOD_DRAFT, name: 'Apple', calories: 52 }) // true
 */
export function isCustomFoodDraftValid(draft: CustomFoodDraft): boolean {
  return draft.name.trim().length > 0 && draft.calories != null;
}

/**
 * Maps a UI draft onto the payload shape expected by the `addFood` server fn.
 * Macros fall back to 0 — Atwater label values treat "not entered" as
 * "no contribution" rather than as an error (USDA NLEA labeling convention).
 * @example customFoodPayload({ ...EMPTY_CUSTOM_FOOD_DRAFT, name: 'Apple', calories: 52 })
 */
export function customFoodPayload(draft: CustomFoodDraft): CustomFoodPayload {
  return {
    barcode: (draft.barcode ?? "").trim() || null,
    brand: draft.brand.trim() || null,
    calories_per_serving: draft.calories ?? 0,
    carbs_g: draft.carbs ?? 0,
    fat_g: draft.fat ?? 0,
    fiber_g: 0,
    name: draft.name.trim(),
    protein_g: draft.protein ?? 0,
    serving_size: draft.servingSize ?? 100,
    serving_unit: draft.servingUnit,
    sodium_mg: 0,
    sugar_g: 0,
  };
}
