import { z } from "zod";

/** Calendar dates in API payloads (`YYYY-MM-DD`). */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Clock times for reminder schedules (`HH:MM`). */
export const ISO_TIME_PATTERN = /^\d{2}:\d{2}$/;

export const isoDateSchema = z.string().regex(ISO_DATE_PATTERN, "YYYY-MM-DD");

export const isoTimeSchema = z.string().regex(ISO_TIME_PATTERN, "HH:MM");

/** Strictly positive integers — row ids and counts. */
export const positiveIntSchema = z.number().int().positive().finite();

export const rowIdSchema = positiveIntSchema;

export const nonNegativeIntSchema = z.number().int().nonnegative().finite();

export const nonNegativeFiniteSchema = z.number().finite().min(0);

export const optionalLimitSchema = positiveIntSchema.optional();

export const optionalRowIdSchema = rowIdSchema.optional();

export const nullableRowIdSchema = rowIdSchema.nullable().optional();

export const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);

export type MealType = z.infer<typeof mealTypeSchema>;

export const periodizationTypeSchema = z.enum(["linear", "dup"]);

export type PeriodizationType = z.infer<typeof periodizationTypeSchema>;

export const optionalIsoDateQuerySchema = z
  .object({ date: isoDateSchema.optional() })
  .optional()
  .transform((value) => value ?? {});

export const optionalAsOfQuerySchema = z
  .object({ asOf: isoDateSchema.optional() })
  .optional()
  .transform((value) => value ?? {});

export const optionalLimitQuerySchema = z
  .object({ limit: optionalLimitSchema })
  .optional()
  .transform((value) => value ?? {});

export const rowIdInputSchema = z.object({ id: rowIdSchema });

/**
 * Parse untrusted server-function input with a Zod schema.
 * Failures name the offending value and expected shape (AGENTS.md).
 */
export function parseServerInput<T extends z.ZodType>(
  schema: T,
  input: unknown
): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(z.prettifyError(result.error));
  }
  return result.data;
}

/** TanStack Start `.validator()` adapter for a Zod schema. */
export function serverInputValidator<T extends z.ZodType>(schema: T) {
  return (input: unknown): z.infer<T> => parseServerInput(schema, input);
}
