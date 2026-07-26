/**
 * Pure presentation helpers for the progress view.
 *
 * Framework-agnostic maths extracted from the route component so the
 * science-backed logic (weight trend, weekly volume vs. hypertrophy
 * guidelines, chart geometry) can be unit-tested in isolation. Every
 * function returns plain values consumed by Astryx components
 * (`ProgressBar`, `Badge`, the weight SVG).
 */

import type { BodyLog } from './db'
import type { MuscleVolume } from './api'

/** Tone union accepted by Astryx `ProgressBar` `variant`. */
export type ProgressVariant = 'accent' | 'success' | 'warning' | 'error'

export interface WeightTrend {
  /** Earliest weight in the window (kg). */
  first: number
  /** Most recent weight in the window (kg). */
  last: number
  /** `last - first`. Positive = weight gained, negative = weight lost. */
  change: number
  /** Highest weight in the window (kg). */
  max: number
  /** Lowest weight in the window (kg). */
  min: number
}

/**
 * Derives the weight trend from raw body logs.
 *
 * `getBodyLogs` returns rows newest-first (`ORDER BY date DESC`); we sort
 * ascending by date so `first`/`last` map to oldest/newest regardless of
 * caller. `date` is `YYYY-MM-DD`, which sorts lexicographically ==
 * chronologically. Returns `null` when no log carries a weight.
 *
 * @example
 *   weightTrend([{ id: 1, date: '2024-01-01', weight_kg: 80, ... }]) // null trend? see tests
 */
export function weightTrend(logs: BodyLog[]): WeightTrend | null {
  const weighted = logs
    .filter((log): log is BodyLog & { weight_kg: number } => log.weight_kg !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  if (weighted.length === 0) return null

  const weights = weighted.map((log) => log.weight_kg)
  const first = weighted[0].weight_kg
  const last = weighted[weighted.length - 1].weight_kg

  return {
    first,
    last,
    change: last - first,
    max: Math.max(...weights),
    min: Math.min(...weights),
  }
}

/**
 * Picks a Badge tone for a weight delta.
 *
 * Preserves the prior custom-CSS framing where loss reads as favourable —
 * this matches the fat-loss default but is NOT goal-aware. A neutral
 * refactor: behaviour is unchanged from the original progress page.
 *
 * TODO: make goal-aware so `build_muscle` flips the tone (tracked separately).
 */
export function weightChangeTone(change: number): 'success' | 'error' | null {
  if (!Number.isFinite(change) || change === 0) return null
  return change < 0 ? 'success' : 'error'
}

/**
 * Converts a session count into a per-week average.
 *
 * @param sessionCount  Workouts logged in the window.
 * @param windowDays     Window length in days (the progress page uses 90).
 * @example workoutsPerWeek(13, 90) // ~1.01 sessions/week
 */
export function workoutsPerWeek(sessionCount: number, windowDays: number): number {
  if (windowDays <= 0) return 0
  return sessionCount / (windowDays / 7)
}

/**
 * Maps a `MuscleVolume` training-status bucket onto an Astryx `ProgressBar`
 * variant.
 *
 * Reference: Schoenfeld et al. 2017 — 10–20 working sets per muscle group
 * per week maximises hypertrophy. `optimal` is the target zone; `under`
 * signals insufficient stimulus (caution); `high` risks junk volume and
 * fatigue accumulation (over-reaching).
 */
export function volumeVariant(status: MuscleVolume['status']): ProgressVariant {
  if (status === 'optimal') return 'success'
  if (status === 'under') return 'warning'
  return 'error' // 'high'
}

/** Badge label + semantic variant for a volume status bucket. */
export function volumeStatusBadge(
  status: MuscleVolume['status'],
): { label: string; variant: 'success' | 'warning' | 'error' } {
  if (status === 'optimal') return { label: 'Optimal', variant: 'success' }
  if (status === 'under') return { label: 'Under', variant: 'warning' }
  return { label: 'High', variant: 'error' }
}

export interface VolumeBarState {
  /** Sets this week, clamped to the recommended max so the fill never overflows. */
  value: number
  /** Recommended weekly max; used as the bar maximum (>= 1 to avoid /0). */
  max: number
  /** Semantic tone derived from the status bucket. */
  variant: ProgressVariant
  /** 0–100 percentage for the optional value label. */
  percent: number
}

/**
 * Maps weekly volume onto `ProgressBar` props.
 *
 * The fill is clamped at the recommended max so an over-training week still
 * renders a full bar while flipping to the `error` tone — matching the
 * previous custom-CSS `.progress-bar-fill` width cap.
 */
export function volumeProgress(mv: MuscleVolume): VolumeBarState {
  const max = mv.max_recommended > 0 ? mv.max_recommended : 1
  return {
    value: Math.min(mv.total_sets, mv.max_recommended),
    max,
    variant: volumeVariant(mv.status),
    percent: Math.min(100, Math.round((mv.total_sets / max) * 100)),
  }
}

export interface ChartGeometry {
  /** Plot width in viewBox units. */
  width: number
  /** Plot height in viewBox units. */
  height: number
  /** Top inset so the highest point isn't clipped. */
  topPadding: number
  /** Total viewBox height (plot + top + bottom gutters). */
  viewBoxHeight: number
}

/**
 * Sized coordinate space for the weight SVG.
 *
 * Width grows with the number of points so dense histories stay readable;
 * the rendered `<svg>` uses `width="100%"` + this `viewBox`, so it scales to
 * the card without horizontal scroll.
 */
export function weightChartGeometry(pointCount: number): ChartGeometry {
  const height = 200
  const topPadding = 10
  return {
    width: Math.max(pointCount * 8, 100),
    height,
    topPadding,
    viewBoxHeight: height + 40,
  }
}

export interface ChartPoint {
  x: number
  y: number
}

/**
 * Maps weight samples to chart coordinates within `geometry`.
 *
 * The y-axis is inverted (SVG origin top-left): heavier weights plot higher
 * (smaller y). `range` floors at 1 so a flat series doesn't divide by zero.
 */
export function weightChartPoints(
  weights: number[],
  min: number,
  max: number,
  geometry: ChartGeometry,
): ChartPoint[] {
  const range = max - min || 1
  const denominator = Math.max(weights.length - 1, 1)
  return weights.map((weight, index) => ({
    x: (index / denominator) * geometry.width,
    y: geometry.height - ((weight - min) / range) * geometry.height + geometry.topPadding,
  }))
}

/** Title-cases a snake_case muscle group for display ("full_body" -> "Full body"). */
export function capitalizeMuscleGroup(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
