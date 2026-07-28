/**
 * Pure helpers for the Settings page.
 *
 * Extracted so profile payload shaping, weight validation, export naming, and
 * selector option catalogues can be unit-tested without mounting the route.
 */

import type { ISODateString } from "@astryxdesign/core/Calendar";

import type { UserRecord } from "~/db/user-body-queries";
import type { ActivityLevel, GoalType, Sex } from "~/lib/nutrition";
import { ACTIVITY_LABELS } from "~/lib/nutrition";

export interface ProfileFormState {
  activity: ActivityLevel;
  birthDate: string;
  goal: GoalType;
  heightCm: number | null;
  name: string;
  sex: Sex;
}

/** Payload shape accepted by `updateUser`. */
export interface ProfileUpdatePayload {
  activityLevel: ActivityLevel;
  birthDate: string | null;
  goalType: GoalType;
  heightCm: number | null;
  name: string;
  sex: Sex;
}

export interface SelectorOption {
  label: string;
  value: string;
}

/**
 * Sex choices for Mifflin-St Jeor BMR. "other" uses the male coefficient as a
 * conservative default (see `calculateBMR` in nutrition.ts).
 */
export const SEX_OPTIONS: SelectorOption[] = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Other", value: "other" },
];

/**
 * Goal choices with the surplus/deficit baked into the label so users see the
 * science-backed adjustment before saving.
 * - Build muscle: ~+10% surplus (Slater & Phillips, 2011)
 * - Lose fat: ~-20% deficit (Helms et al., 2014)
 */
export const GOAL_OPTIONS: SelectorOption[] = [
  { label: "Build Muscle (+10% surplus)", value: "build_muscle" },
  { label: "Lose Fat (-20% deficit)", value: "lose_fat" },
  { label: "Maintain Weight", value: "maintain" },
  { label: "Body Recomposition", value: "recomp" },
];

/** Goal options with descriptions for the visual SelectableCard grid (issue #34). */
export interface GoalCardOption {
  description: string;
  label: string;
  value: GoalType;
}

export const GOAL_CARD_OPTIONS: GoalCardOption[] = [
  {
    description: "~10% calorie surplus to support hypertrophy training.",
    label: "Build Muscle",
    value: "build_muscle",
  },
  {
    description:
      "~20% calorie deficit to promote fat loss while preserving muscle.",
    label: "Lose Fat",
    value: "lose_fat",
  },
  {
    description:
      "Eat at maintenance to keep current weight and body composition.",
    label: "Maintain",
    value: "maintain",
  },
  {
    description:
      "Slight deficit with high protein to build muscle while losing fat.",
    label: "Recomp",
    value: "recomp",
  },
];

/** Activity options derived from the shared ACTIVITY_LABELS catalogue. */
export function activityOptions(): SelectorOption[] {
  return (Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(
    ([value, label]) => ({ label, value })
  );
}

/**
 * Maps a user query row into TanStack Form default values for the profile card.
 * Keeps the route free of field-by-field mapping and mirrors programFormDefaults.
 */
export function profileFormDefaults(user: UserRecord): ProfileFormState {
  return {
    activity: user.activityLevel,
    birthDate: user.birthDate || "",
    goal: user.goalType,
    heightCm: user.heightCm ?? null,
    name: user.name,
    sex: user.sex,
  };
}

/**
 * Maps form state into the `updateUser` payload. Empty birth dates become
 * `null` so the column clears instead of storing an empty string.
 */
export function buildProfileUpdate(
  form: ProfileFormState
): ProfileUpdatePayload {
  return {
    activityLevel: form.activity,
    birthDate: form.birthDate || null,
    goalType: form.goal,
    heightCm: form.heightCm,
    name: form.name,
    sex: form.sex,
  };
}

/**
 * Validates a weigh-in before calling `logBodyweight`. Rejects null, NaN,
 * non-positive, and non-finite values — the same guard the previous page used
 * with `parseFloat` + falsy check.
 */
export function parseWeightKg(value: number | null | undefined): number | null {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }
  return value;
}

/** Download filename for the JSON export (`fittrack-export-YYYY-MM-DD.json`). */
export function exportDownloadFilename(date: Date = new Date()): string {
  return `fittrack-export-${date.toISOString().split("T")[0]}.json`;
}

/**
 * Today's date as YYYY-MM-DD in the user's local timezone, typed for use as
 * the `max` on the birth-date picker so users can't select a future birthday.
 *
 * Local time, not UTC: `Date.toISOString()` is UTC and rolls back a calendar
 * day west of Greenwich near midnight, which would incorrectly forbid today.
 * Pads year/month/day so the cast to the YYYY-MM-DD template literal is sound.
 */
export function todayISODate(now: Date = new Date()): ISODateString {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` as ISODateString;
}

/** Shape backing Astryx's `ISODateString` template literal (YYYY-MM-DD). */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coerces a loose DB/form string into a typed `ISODateString`, or null when
 * empty or malformed. The settings form keeps the birth date as a plain
 * string for simple state handling; this bridges it onto the DateInput value
 * prop without weakening the component's strict type.
 */
export function toISODate(
  value: string | null | undefined
): ISODateString | null {
  if (!(value && ISO_DATE_PATTERN.test(value))) {
    return null;
  }
  return value as ISODateString;
}

/** Primary save button label, including the transient "Saved" confirmation. */
export function saveProfileButtonLabel(saved: boolean): string {
  return saved ? "Saved" : "Save Profile";
}

/** Derives the save button label from TanStack Form submit lifecycle state. */
export function profileSaveButtonLabel(formState: {
  isSubmitting: boolean;
  isSubmitSuccessful: boolean;
}): string {
  return saveProfileButtonLabel(
    formState.isSubmitSuccessful && !formState.isSubmitting
  );
}

/**
 * Citations shown in the About card. Kept here so the e2e/unit suites can
 * assert the education copy without scraping JSX.
 */
export const SCIENCE_REFERENCES: readonly {
  topic: string;
  citation: string;
}[] = [
  {
    citation: "Mifflin-St Jeor equation (Frankenfield et al., 2005)",
    topic: "BMR",
  },
  {
    citation: "1.6-2.4 g/kg (Morton et al., 2018; Helms et al., 2014)",
    topic: "Protein",
  },
  { citation: "Epley equation for estimation", topic: "1RM" },
  { citation: "Zourdos et al., 2016 for autoregulation", topic: "RPE/RIR" },
  { citation: "Schoenfeld et al., 2017 dose-response data", topic: "Volume" },
];

/** SVG sparkline point for the weight mini-chart (issue #34). */
export interface WeightChartPoint {
  date: string;
  weightKg: number;
  x: number;
  y: number;
}

/**
 * Transforms weight log entries into normalised SVG sparkline points.
 * Chronological order (oldest left), y inverted so lower weight = higher on canvas.
 */
export function buildWeightChartPoints(
  entries: { date: string; weightKg: number | null }[],
  chartWidth: number,
  chartHeight: number,
  padding: number
): WeightChartPoint[] {
  const valid = entries
    .filter(
      (entry): entry is { date: string; weightKg: number } =>
        entry.weightKg !== null && entry.weightKg > 0
    )
    .toReversed(); // chronological order

  if (valid.length < 2) {
    return [];
  }

  const weights = valid.map((entry) => entry.weightKg);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1; // avoid division by zero

  const w = chartWidth - padding * 2;
  const h = chartHeight - padding * 2;

  return valid.map((entry, index) => ({
    date: entry.date,
    weightKg: entry.weightKg,
    x: padding + (index / Math.max(valid.length - 1, 1)) * w,
    y: padding + h - ((entry.weightKg - minW) / range) * h,
  }));
}

/**
 * Builds an SVG polyline points string from chart points.
 */
export function weightChartPolyline(points: WeightChartPoint[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/**
 * Validates and parses a JSON file for data import.
 * Returns null with an error message on failure.
 */
export function parseImportFile(
  json: string
): { data: Record<string, unknown> } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: "Invalid JSON file." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: "File must contain a JSON object, not an array." };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.app !== "FitTrack") {
    return { error: "Not a valid FitTrack export file." };
  }
  return { data: obj };
}
