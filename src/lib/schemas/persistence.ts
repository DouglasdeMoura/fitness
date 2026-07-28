import { z } from "zod";

import { isoTimeSchema, nonNegativeIntSchema } from "./common";

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

/**
 * Minimum shape for a FitTrack export file before deeper import validation
 * (Batch 3 validates the full export).
 */
export const fitTrackExportFileSchema = z
  .object({
    app: z.literal("FitTrack"),
  })
  .passthrough();
