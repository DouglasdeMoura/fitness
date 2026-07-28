/**
 * Pure helpers for the Settings page.
 *
 * Extracted so profile payload shaping, weight validation, export naming, and
 * selector option catalogues can be unit-tested without mounting the route.
 */

import type {ISODateString} from '@astryxdesign/core/Calendar'
import type { User } from '~/lib/db'
import {
  ACTIVITY_LABELS,
  type ActivityLevel,
  type GoalType,
  type Sex,
} from '~/lib/nutrition'

export type ProfileFormState = {
  name: string
  heightCm: number | null
  sex: Sex
  activity: ActivityLevel
  goal: GoalType
  birthDate: string
}

/** Payload shape accepted by `updateUser`. */
export type ProfileUpdatePayload = {
  name: string
  height_cm: number | null
  sex: Sex
  activity_level: ActivityLevel
  goal_type: GoalType
  birth_date: string | null
}

export type SelectorOption = { label: string; value: string }

/**
 * Sex choices for Mifflin-St Jeor BMR. "other" uses the male coefficient as a
 * conservative default (see `calculateBMR` in nutrition.ts).
 */
export const SEX_OPTIONS: SelectorOption[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

/**
 * Goal choices with the surplus/deficit baked into the label so users see the
 * science-backed adjustment before saving.
 * - Build muscle: ~+10% surplus (Slater & Phillips, 2011)
 * - Lose fat: ~-20% deficit (Helms et al., 2014)
 */
export const GOAL_OPTIONS: SelectorOption[] = [
  { value: 'build_muscle', label: 'Build Muscle (+10% surplus)' },
  { value: 'lose_fat', label: 'Lose Fat (-20% deficit)' },
  { value: 'maintain', label: 'Maintain Weight' },
  { value: 'recomp', label: 'Body Recomposition' },
]

/** Goal options with descriptions for the visual SelectableCard grid (issue #34). */
export interface GoalCardOption {
  value: GoalType
  label: string
  description: string
}

export const GOAL_CARD_OPTIONS: GoalCardOption[] = [
  {
    value: 'build_muscle',
    label: 'Build Muscle',
    description: '~10% calorie surplus to support hypertrophy training.',
  },
  {
    value: 'lose_fat',
    label: 'Lose Fat',
    description: '~20% calorie deficit to promote fat loss while preserving muscle.',
  },
  {
    value: 'maintain',
    label: 'Maintain',
    description: 'Eat at maintenance to keep current weight and body composition.',
  },
  {
    value: 'recomp',
    label: 'Recomp',
    description: 'Slight deficit with high protein to build muscle while losing fat.',
  },
]

/** Activity options derived from the shared ACTIVITY_LABELS catalogue. */
export function activityOptions(): SelectorOption[] {
  return (Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(
    ([value, label]) => ({ value, label }),
  )
}

/**
 * Maps a user query row into TanStack Form default values for the profile card.
 * Keeps the route free of field-by-field mapping and mirrors programFormDefaults.
 */
export function profileFormDefaults(user: User): ProfileFormState {
  return {
    name: user.name,
    heightCm: user.height_cm ?? null,
    sex: user.sex,
    activity: user.activity_level,
    goal: user.goal_type,
    birthDate: user.birth_date || '',
  }
}

/**
 * Maps form state into the `updateUser` payload. Empty birth dates become
 * `null` so the column clears instead of storing an empty string.
 */
export function buildProfileUpdate(form: ProfileFormState): ProfileUpdatePayload {
  return {
    name: form.name,
    height_cm: form.heightCm,
    sex: form.sex,
    activity_level: form.activity,
    goal_type: form.goal,
    birth_date: form.birthDate || null,
  }
}

/**
 * Validates a weigh-in before calling `logBodyweight`. Rejects null, NaN,
 * non-positive, and non-finite values — the same guard the previous page used
 * with `parseFloat` + falsy check.
 */
export function parseWeightKg(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return value
}

/** Download filename for the JSON export (`fittrack-export-YYYY-MM-DD.json`). */
export function exportDownloadFilename(date: Date = new Date()): string {
  return `fittrack-export-${date.toISOString().split('T')[0]}.json`
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
  const y = String(now.getFullYear()).padStart(4, '0')
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}` as ISODateString
}

/** Shape backing Astryx's `ISODateString` template literal (YYYY-MM-DD). */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Coerces a loose DB/form string into a typed `ISODateString`, or null when
 * empty or malformed. The settings form keeps the birth date as a plain
 * string for simple state handling; this bridges it onto the DateInput value
 * prop without weakening the component's strict type.
 */
export function toISODate(
  value: string | null | undefined,
): ISODateString | null {
  if (!value || !ISO_DATE_PATTERN.test(value)) return null
  return value as ISODateString
}

/** Primary save button label, including the transient "Saved" confirmation. */
export function saveProfileButtonLabel(saved: boolean): string {
  return saved ? 'Saved' : 'Save Profile'
}

/** Derives the save button label from TanStack Form submit lifecycle state. */
export function profileSaveButtonLabel(formState: {
  isSubmitting: boolean
  isSubmitSuccessful: boolean
}): string {
  return saveProfileButtonLabel(
    formState.isSubmitSuccessful && !formState.isSubmitting,
  )
}

/**
 * Citations shown in the About card. Kept here so the e2e/unit suites can
 * assert the education copy without scraping JSX.
 */
export const SCIENCE_REFERENCES: ReadonlyArray<{ topic: string; citation: string }> = [
  { topic: 'BMR', citation: 'Mifflin-St Jeor equation (Frankenfield et al., 2005)' },
  { topic: 'Protein', citation: '1.6-2.4 g/kg (Morton et al., 2018; Helms et al., 2014)' },
  { topic: '1RM', citation: 'Epley equation for estimation' },
  { topic: 'RPE/RIR', citation: 'Zourdos et al., 2016 for autoregulation' },
  { topic: 'Volume', citation: 'Schoenfeld et al., 2017 dose-response data' },
]

/** SVG sparkline point for the weight mini-chart (issue #34). */
export interface WeightChartPoint {
  date: string
  weightKg: number
  x: number
  y: number
}

/**
 * Transforms weight log entries into normalised SVG sparkline points.
 * Chronological order (oldest left), y inverted so lower weight = higher on canvas.
 */
export function buildWeightChartPoints(
  entries: { date: string; weight_kg: number | null }[],
  chartWidth: number,
  chartHeight: number,
  padding: number,
): WeightChartPoint[] {
  const valid = entries
    .filter((e): e is { date: string; weight_kg: number } => e.weight_kg != null && e.weight_kg > 0)
    .reverse() // chronological order

  if (valid.length < 2) return []

  const weights = valid.map((e) => e.weight_kg)
  const minW = Math.min(...weights)
  const maxW = Math.max(...weights)
  const range = maxW - minW || 1 // avoid division by zero

  const w = chartWidth - padding * 2
  const h = chartHeight - padding * 2

  return valid.map((e, i) => ({
    date: e.date,
    weightKg: e.weight_kg,
    x: padding + (i / Math.max(valid.length - 1, 1)) * w,
    y: padding + h - ((e.weight_kg - minW) / range) * h,
  }))
}

/**
 * Builds an SVG polyline points string from chart points.
 */
export function weightChartPolyline(points: WeightChartPoint[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

/**
 * Validates and parses a JSON file for data import.
 * Returns null with an error message on failure.
 */
export function parseImportFile(
  json: string,
): { data: Record<string, unknown> } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { error: 'Invalid JSON file.' }
  }
  if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
    return { error: 'File must contain a JSON object, not an array.' }
  }
  const obj = parsed as Record<string, unknown>
  if (obj.app !== 'FitTrack') {
    return { error: 'Not a valid FitTrack export file.' }
  }
  return { data: obj }
}
