import { z } from "zod";

import { isoTimeSchema, nonNegativeIntSchema } from "./common";
import { importDataInputSchema } from "./user";
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
    exported_at: z.string().min(1),
    user: z.record(z.string(), z.unknown()),
    version: z.string().min(1),
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
