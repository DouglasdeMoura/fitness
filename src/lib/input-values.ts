import type { DateInput, TimeInput } from "@astryxdesign/core";
/**
 * Narrowing helpers for Astryx's date and time inputs.
 *
 * `DateInput.value` and `TimeInput.value` are branded template-literal types
 * (`${number}${number}${number}${number}-${number}${number}-${number}${number}`
 * and the ISO time equivalent), so a plain `string` from app state or the
 * database does not satisfy them. Rather than scatter casts at each call site,
 * validate the shape once here and derive the target types from the components
 * themselves, so an Astryx upgrade that changes them fails the build here
 * instead of silently widening.
 *
 * Malformed input returns `undefined` — the field renders empty — rather than
 * throwing. A bad stored value should not blank the whole page.
 *
 * @example value={asDateValue(selectedDate)}
 */
import type { ComponentProps } from "react";

export type AstryxDateValue = NonNullable<
  ComponentProps<typeof DateInput>["value"]
>;
export type AstryxTimeValue = NonNullable<
  ComponentProps<typeof TimeInput>["value"]
>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME_PATTERN = /^\d{2}:\d{2}$/;

/** Narrows `YYYY-MM-DD` to Astryx's DateInput value type. */
export function asDateValue(
  value: string | null | undefined
): AstryxDateValue | undefined {
  if (!value || !ISO_DATE_PATTERN.test(value)) {return undefined;}
  return value as AstryxDateValue;
}

/** Narrows `HH:MM` to Astryx's TimeInput value type. */
export function asTimeValue(
  value: string | null | undefined
): AstryxTimeValue | undefined {
  if (!value || !ISO_TIME_PATTERN.test(value)) {return undefined;}
  return value as AstryxTimeValue;
}
