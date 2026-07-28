// Shared contract for the offline mutation queue.
//
// Kept separate from api.ts and offline.ts so the server-side replay handler and
// the browser outbox agree on payload shapes without importing one another
// (api.ts pulls in Drizzle database layer, offline.ts pulls in IndexedDB globals).

import type { MealType } from "./schemas/common";

export type { MealType } from "./schemas/common";
export type { QueuedMutation } from "./schemas/user";

/**
 * Payload for each mutation the app can replay after a period offline.
 * Shapes mirror the validators of the matching server functions in api.ts.
 */
export interface QueuedMutationPayloads {
  addFood: {
    name: string;
    brand?: string | null;
    serving_size: number;
    serving_unit: string;
    calories_per_serving: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g?: number;
    sugar_g?: number;
    sodium_mg?: number;
    barcode?: string | null;
  };
  addFoodLogEntry: {
    food_id?: number;
    custom_name?: string;
    date?: string;
    meal_type: MealType;
    servings: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    notes?: string;
  };
  addWorkoutSet: {
    /** Set on a session that already existed server-side. */
    session_id?: number;
    /** Set on a session that was itself created offline. */
    session_temp_ref?: string;
    exercise_id: number;
    set_number: number;
    reps: number;
    weight_kg: number;
    rpe?: number;
    rest_seconds?: number;
    notes?: string;
  };
  copyDayFromDate: {
    fromDate: string;
    toDate: string;
  };
  copyMealFromDate: {
    fromDate: string;
    toDate: string;
    mealType: MealType;
  };
  createWorkoutSession: {
    name?: string;
    date?: string;
    /** Placeholder id the device uses until the server assigns a real one. */
    temp_ref: string;
  };
  deleteFoodLogEntries: {
    ids: number[];
  };
  deleteFoodLogEntry: {
    id: number;
  };
  logBodyweight: {
    weight_kg: number;
    body_fat_pct?: number;
    notes?: string;
    date?: string;
  };
  logMealTemplate: {
    templateId: number;
    date: string;
    mealType: MealType;
  };
}

export type QueuedMutationKind = keyof QueuedMutationPayloads;

export interface SyncOutcome {
  client_id: string;
  error?: string;
  kind: QueuedMutationKind;
  /** Primary key of the affected row, when the mutation produced one. */
  result_id?: number;
  status: "applied" | "duplicate" | "failed";
}

export interface SyncResult {
  applied: number;
  duplicates: number;
  failed: number;
  outcomes: SyncOutcome[];
  synced_at: string;
}

/**
 * Give up on an entry after this many failed attempts so one malformed
 * mutation cannot wedge the whole queue behind it.
 */
export const MAX_SYNC_ATTEMPTS = 5;

export function makeClientId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeTempRef(): string {
  return `temp:${makeClientId()}`;
}
