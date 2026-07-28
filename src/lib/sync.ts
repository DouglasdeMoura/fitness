// Shared contract for the offline mutation queue.
//
// Kept separate from api.ts and offline.ts so the server-side replay handler and
// the browser outbox agree on payload shapes without importing one another
// (api.ts pulls in better-sqlite3, offline.ts pulls in IndexedDB globals).

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

/**
 * Payload for each mutation the app can replay after a period offline.
 * Shapes mirror the validators of the matching server functions in api.ts.
 */
export interface QueuedMutationPayloads {
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
  deleteFoodLogEntry: {
    id: number;
  };
  deleteFoodLogEntries: {
    ids: number[];
  };
  copyMealFromDate: {
    fromDate: string;
    toDate: string;
    mealType: MealType;
  };
  copyDayFromDate: {
    fromDate: string;
    toDate: string;
  };
  logMealTemplate: {
    templateId: number;
    date: string;
    mealType: MealType;
  };
  logBodyweight: {
    weight_kg: number;
    body_fat_pct?: number;
    notes?: string;
    date?: string;
  };
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
  createWorkoutSession: {
    name?: string;
    date?: string;
    /** Placeholder id the device uses until the server assigns a real one. */
    temp_ref: string;
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
}

export type QueuedMutationKind = keyof QueuedMutationPayloads;

export type QueuedMutation<K extends QueuedMutationKind = QueuedMutationKind> =
  {
    [Kind in K]: {
      /** UUID minted on the device; the server's idempotency key. */
      client_id: string;
      kind: Kind;
      payload: QueuedMutationPayloads[Kind];
      /** ISO timestamp of when the user performed the action, not when it synced. */
      queued_at: string;
      /** Failed sync attempts so far, used to stop retrying a poisoned entry. */
      attempts: number;
      /** Message from the most recent failed attempt. */
      last_error?: string;
    };
  }[K];

export interface SyncOutcome {
  client_id: string;
  kind: QueuedMutationKind;
  status: "applied" | "duplicate" | "failed";
  /** Primary key of the affected row, when the mutation produced one. */
  result_id?: number;
  error?: string;
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
