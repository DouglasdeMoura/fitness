/**
 * Pure presentation helpers for the progress view.
 *
 * Framework-agnostic maths extracted from the route component so the
 * science-backed logic (weight trend, weekly volume vs. hypertrophy
 * guidelines, chart geometry) can be unit-tested in isolation. Every
 * function returns plain values consumed by Astryx components
 * (`ProgressBar`, `Badge`, the weight SVG).
 */

import type { BodyLogRecord } from "../db/user-body-queries";
import type { MuscleVolume } from "./api";

/** Tone union accepted by Astryx `ProgressBar` `variant`. */
export type ProgressVariant = "accent" | "success" | "warning" | "error";

export interface WeightTrend {
  /** `last - first`. Positive = weight gained, negative = weight lost. */
  change: number;
  /** Earliest weight in the window (kg). */
  first: number;
  /** Most recent weight in the window (kg). */
  last: number;
  /** Highest weight in the window (kg). */
  max: number;
  /** Lowest weight in the window (kg). */
  min: number;
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
 *   weightTrend([{ id: 1, date: '2024-01-01', weightKg: 80, ... }]) // null trend? see tests
 */
export function weightTrend(logs: BodyLogRecord[]): WeightTrend | null {
  const weighted = logs
    .filter(
      (log): log is BodyLogRecord & { weightKg: number } =>
        log.weightKg !== null
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (weighted.length === 0) {
    return null;
  }

  const weights = weighted.map((log) => log.weightKg);
  const first = weighted[0]!.weightKg;
  const last = weighted.at(-1)!.weightKg;

  return {
    change: last - first,
    first,
    last,
    max: Math.max(...weights),
    min: Math.min(...weights),
  };
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
export function weightChangeTone(change: number): "success" | "error" | null {
  if (!Number.isFinite(change) || change === 0) {
    return null;
  }
  return change < 0 ? "success" : "error";
}

/**
 * Converts a session count into a per-week average.
 *
 * @param sessionCount  Workouts logged in the window.
 * @param windowDays     Window length in days (the progress page uses 90).
 * @example workoutsPerWeek(13, 90) // ~1.01 sessions/week
 */
export function workoutsPerWeek(
  sessionCount: number,
  windowDays: number
): number {
  if (windowDays <= 0) {
    return 0;
  }
  return sessionCount / (windowDays / 7);
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
export function volumeVariant(status: MuscleVolume["status"]): ProgressVariant {
  if (status === "optimal") {
    return "success";
  }
  if (status === "under") {
    return "warning";
  }
  return "error"; // 'high'
}

/** Badge label + semantic variant for a volume status bucket. */
export function volumeStatusBadge(status: MuscleVolume["status"]): {
  label: string;
  variant: "success" | "warning" | "error";
} {
  if (status === "optimal") {
    return { label: "Optimal", variant: "success" };
  }
  if (status === "under") {
    return { label: "Under", variant: "warning" };
  }
  return { label: "High", variant: "error" };
}

export interface VolumeBarState {
  /** Recommended weekly max; used as the bar maximum (>= 1 to avoid /0). */
  max: number;
  /** 0–100 percentage for the optional value label. */
  percent: number;
  /** Sets this week, clamped to the recommended max so the fill never overflows. */
  value: number;
  /** Semantic tone derived from the status bucket. */
  variant: ProgressVariant;
}

/**
 * Maps weekly volume onto `ProgressBar` props.
 *
 * The fill is clamped at the recommended max so an over-training week still
 * renders a full bar while flipping to the `error` tone — matching the
 * previous custom-CSS `.progress-bar-fill` width cap.
 */
export function volumeProgress(mv: MuscleVolume): VolumeBarState {
  const max = mv.max_recommended > 0 ? mv.max_recommended : 1;
  return {
    max,
    percent: Math.min(100, Math.round((mv.total_sets / max) * 100)),
    value: Math.min(mv.total_sets, mv.max_recommended),
    variant: volumeVariant(mv.status),
  };
}

export interface ChartGeometry {
  /** Plot height in viewBox units. */
  height: number;
  /** Top inset so the highest point isn't clipped. */
  topPadding: number;
  /** Total viewBox height (plot + top + bottom gutters). */
  viewBoxHeight: number;
  /** Plot width in viewBox units. */
  width: number;
}

/**
 * Sized coordinate space for the weight SVG.
 *
 * Width grows with the number of points so dense histories stay readable;
 * the rendered `<svg>` uses `width="100%"` + this `viewBox`, so it scales to
 * the card without horizontal scroll.
 */
export function weightChartGeometry(pointCount: number): ChartGeometry {
  const height = 200;
  const topPadding = 10;
  return {
    height,
    topPadding,
    viewBoxHeight: height + 40,
    width: Math.max(pointCount * 8, 100),
  };
}

export interface ChartPoint {
  x: number;
  y: number;
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
  geometry: ChartGeometry
): ChartPoint[] {
  const range = max - min || 1;
  const denominator = Math.max(weights.length - 1, 1);
  return weights.map((weight, index) => ({
    x: (index / denominator) * geometry.width,
    y:
      geometry.height -
      ((weight - min) / range) * geometry.height +
      geometry.topPadding,
  }));
}

/** Title-cases a snake_case muscle group for display ("full_body" -> "Full body"). */
export function capitalizeMuscleGroup(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Simple moving average (SMA) of weight data.
 *
 * The first `window - 1` entries return `null` because there aren't enough
 * preceding values to fill the window. SMA smooths daily fluctuations so the
 * trend direction is instantly readable — Apple Health uses a 7-day SMA for
 * its weight trend chart.
 *
 * Reference: Hyndman RJ, Athanasopoulos G. "Forecasting: principles and
 * practice." 3rd ed. OTexts, 2021. §3.3 — Moving averages.
 *
 * @param weights  Chronological weight values (oldest first).
 * @param window   Number of days to average over (typically 7).
 * @example
 *   movingAverage([80, 81, 79, 82, 80, 81, 83], 3)
 *   // [null, null, 80.0, 80.7, 80.3, 81.0, 81.3]
 */
export function movingAverage(
  weights: number[],
  window: number
): (number | null)[] {
  if (window <= 0) {
    return weights.map(() => null);
  }
  const result: (number | null)[] = [];
  let sum = 0;
  let count = 0;

  for (let i = 0; i < weights.length; i++) {
    sum += weights[i];
    count++;
    if (i >= window) {
      sum -= weights[i - window];
      count = window;
    }
    if (count < window) {
      result.push(null);
    } else {
      result.push(Math.round((sum / count) * 10) / 10);
    }
  }
  return result;
}

/**
 * Builds an SVG polygon path string for a gradient area fill under a line.
 *
 * The path traces the data line left-to-right, then closes with the bottom
 * edge of the chart so the `<polygon>` or `<path>` can be filled with a
 * vertical linear gradient.
 *
 * @param points    Chart coordinates for each data point.
 * @param geometry  ViewBox dimensions.
 * @example areaChartPath(points, geometry) // "M 0,50 L 10,45 ... L 100,160 L 0,160 Z"
 */
export function areaChartPath(
  points: ChartPoint[],
  geometry: ChartGeometry
): string {
  if (points.length === 0) {
    return "";
  }
  const top = points.map((p) => `${p.x},${p.y}`).join(" L ");
  const bottomY = geometry.viewBoxHeight;
  const lastX = points.at(-1)!.x;
  const firstX = points[0]!.x;
  return `M ${top} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
}
