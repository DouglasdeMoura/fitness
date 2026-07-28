import { z } from "zod";

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
