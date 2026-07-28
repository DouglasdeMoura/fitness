import { z } from "zod";

import { isoTimeSchema, nonNegativeIntSchema } from "./common";
import { importDataInputSchema, userExportSchema } from "./user";
import type { ImportDataInput } from "./user";

const nullableFiniteNumberSchema = z.number().finite().nullable();

/** Session-persisted rest timer snapshot (`fittrack-rest-timer`). */
export const restTimerSnapshotSchema = z.object({
  durationMs: nullableFiniteNumberSchema,
  endAtMs: nullableFiniteNumberSchema,
  lastRpe: nullableFiniteNumberSchema,
});

export type RestTimerSnapshot = z.infer<typeof restTimerSnapshotSchema>;

/** JSON column storing scheduled meal reminder times. */
export const storedIsoTimeArraySchema = z.array(isoTimeSchema);

/** JSON column storing workout reminder weekdays (0 = Sunday). */
export const storedWeekdayArraySchema = z.array(nonNegativeIntSchema);

/** Full FitTrack JSON export shape validated before import. */
export const fitTrackExportFileSchema = z
  .object({
    app: z.literal("FitTrack"),
    exported_at: z.string().datetime(),
    user: userExportSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "semantic version"),
  })
  .merge(importDataInputSchema);

export function extractImportDataFromExport(
  exportFile: z.infer<typeof fitTrackExportFileSchema>
): ImportDataInput {
  return {
    body_logs: exportFile.body_logs,
    food_log: exportFile.food_log,
    program_days: exportFile.program_days,
    program_exercises: exportFile.program_exercises,
    programs: exportFile.programs,
    workout_sets: exportFile.workout_sets,
    workouts: exportFile.workouts,
  };
}

/**
 * Validate a parsed export object and return import payload or a user-facing error.
 */
export function parseFitTrackExportFile(
  parsed: unknown
): { data: ImportDataInput } | { error: string } {
  const result = fitTrackExportFileSchema.safeParse(parsed);
  if (!result.success) {
    return { error: z.prettifyError(result.error) };
  }
  return { data: extractImportDataFromExport(result.data) };
}

/**
 * Structured observability log for corrupted persisted values (AGENTS.md).
 * Never throws — a bad stored value must not blank the page.
 */
export function logPersistedValidationFailure(
  context: string,
  value: unknown,
  detail: string
): void {
  if (typeof console === "undefined" || typeof console.warn !== "function") {
    return;
  }
  console.warn(
    JSON.stringify({
      context,
      detail,
      event: "persisted_validation_failed",
      value,
    })
  );
}

/**
 * Parse an already-parsed persisted value with a Zod schema.
 * On failure, logs structured JSON and returns the documented fallback.
 */
export function parsePersistedValue<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fallback: T,
  context: string
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    logPersistedValidationFailure(
      context,
      value,
      z.prettifyError(result.error)
    );
    return fallback;
  }
  return result.data;
}

/**
 * Parse untrusted persisted JSON with a Zod schema.
 * On failure, logs structured JSON and returns the documented fallback.
 *
 * @example parsePersistedJson(storedIsoTimeArraySchema, row.meal_times, [], "notification_preferences.meal_times")
 */
export function parsePersistedJson<T>(
  schema: z.ZodType<T>,
  raw: string | null,
  fallback: T,
  context: string
): T {
  if (!raw) {
    return fallback;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logPersistedValidationFailure(context, raw, "invalid JSON");
    return fallback;
  }
  return parsePersistedValue(schema, parsed, fallback, context);
}

/**
 * Parse a persisted value when absence of a valid value means drop it
 * (offline outbox entries written by an older app version).
 */
export function tryParsePersistedValue<T>(
  schema: z.ZodType<T>,
  value: unknown,
  context: string
): T | null {
  const result = schema.safeParse(value);
  if (!result.success) {
    logPersistedValidationFailure(
      context,
      value,
      z.prettifyError(result.error)
    );
    return null;
  }
  return result.data;
}
