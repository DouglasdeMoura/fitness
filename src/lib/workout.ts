// Science-backed workout & training calculations
// References:
// - Schoenfeld BJ et al. "Effects of resistance training frequency on muscle hypertrophy." Sports Med. 2019
// - Schoenfeld BJ et al. "Dose-response relationship between weekly resistance training volume and muscle hypertrophy." J Strength Cond Res. 2017
// - Radaelli R et al. "Dose-response of 1, 3, and 5 sets of resistance exercise on elbow flexors." Eur J Appl Physiol. 2023

import { formatDisplayInteger } from "./format-number";

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "arms"
  | "legs"
  | "core"
  | "full_body";

export const VOLUME_GUIDELINES: Record<
  MuscleGroup,
  { min: number; max: number; label: string }
> = {
  arms: { label: "Arms", max: 16, min: 8 },
  back: { label: "Back", max: 20, min: 10 },
  chest: { label: "Chest", max: 16, min: 8 },
  core: { label: "Core", max: 16, min: 8 },
  full_body: { label: "Full Body", max: 20, min: 10 },
  legs: { label: "Legs", max: 20, min: 10 },
  shoulders: { label: "Shoulders", max: 16, min: 8 },
};

/**
 * Estimated 1RM using Epley equation.
 * Epley B. "Weight training." In: Encyclopedia of Sports Medicine. 1985
 */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 1) {
    return weight;
  }
  return weight * (1 + reps / 30);
}

/**
 * Reverse Epley: given target reps and %1RM, calculate working weight
 */
export function weightFrom1RM(oneRM: number, reps: number): number {
  if (reps <= 1) {
    return oneRM;
  }
  return oneRM / (1 + reps / 30);
}

/**
 * Training volume = sets x reps x weight
 * Volume is the primary driver of hypertrophy (Schoenfeld et al. 2017)
 */
export function calculateVolume(
  sets: number,
  reps: number,
  weight: number
): number {
  return sets * reps * weight;
}

/**
 * Volume Load Intensity for a set
 * Uses RPE (Rate of Perceived Exertion) to estimate RIR (Reps in Reserve)
 * RIR = 10 - RPE
 *
 * For hypertrophy, optimal RIR is 1-3 (Zourdos et al. 2016; Helms et al. 2016)
 */
export function rpeToRir(rpe: number): number {
  return Math.max(0, 10 - rpe);
}

/**
 * Weekly volume distribution recommendation.
 * Schoenfeld et al. 2019: 2x/week frequency per muscle group is optimal for hypertrophy.
 */
export function recommendWeeklyVolume(
  frequency: number,
  muscleGroup: MuscleGroup
): number {
  const guideline = VOLUME_GUIDELINES[muscleGroup];
  if (frequency >= 2) {
    return Math.round((guideline.min + guideline.max) / 2);
  }
  return guideline.max; // if training once a week, need more volume per session
}

export interface WorkoutStats {
  estimatedDuration: number;
  muscleGroupsWorked: string[];
  totalSets: number;
  totalVolume: number;
}

export function calculateWorkoutStats(
  sets: {
    reps: number | null;
    weight_kg: number | null;
    exercise_id: number;
  }[]
): WorkoutStats {
  let totalVolume = 0;
  const totalSets = sets.length;
  let estimatedDuration = 0;

  for (const set of sets) {
    const reps = set.reps || 0;
    const weight = set.weight_kg || 0;
    totalVolume += reps * weight;
    // Estimate: ~60 seconds per set + ~90 seconds rest
    estimatedDuration += 150;
  }

  return {
    estimatedDuration: Math.round(estimatedDuration / 60),
    muscleGroupsWorked: [],
    totalSets,
    totalVolume: Math.round(totalVolume),
  };
}

export type PeriodizationType = "linear" | "dup";

export interface ProgramPrescription {
  rest_seconds?: number | null;
  target_reps: string;
  target_rpe: number;
  target_sets: number;
}

export type ResolvedProgramTarget = ProgramPrescription & {
  suggested_weight_kg: number | null;
  progression_note: string;
  dup_emphasis?: DupDayEmphasis;
};

export type DupDayEmphasis = "strength" | "hypertrophy" | "endurance";

/**
 * Parse rep prescriptions like "8", "8-12", or "3-5".
 */
export function parseTargetReps(targetReps: string): number {
  const match = targetReps.trim().match(/(\d+)(?:\s*-\s*(\d+))?/u);
  if (!match) {
    return 8;
  }
  const low = Number.parseInt(match[1], 10);
  const high = match[2] ? Number.parseInt(match[2], 10) : low;
  return Math.round((low + high) / 2);
}

/**
 * DUP rotates rep zones within the week to vary intensity.
 * Rhea MR et al. J Strength Cond Res. 2002; Prestes J et al. 2009.
 */
export function getDupDayEmphasis(targetReps: string): DupDayEmphasis {
  const midpoint = parseTargetReps(targetReps);
  if (midpoint <= 5) {
    return "strength";
  }
  if (midpoint <= 10) {
    return "hypertrophy";
  }
  return "endurance";
}

/** Shown when no prior set exists for an exercise (PRD 10 Batch 1). */
export const NO_HISTORY_GUIDANCE =
  "Select a weight that reaches the target RPE for all prescribed sets.";

export interface LastPerformance {
  date: string;
  reps: number;
  rpe: number;
  weight_kg: number;
}

export interface FreeFormSuggestion {
  note: string;
  reps: number;
  weight: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Relative day label for last-performance context.
 * @example formatRelativeDaysAgo('2019-12-20', '2020-01-01') // '12 days ago'
 */
export function formatRelativeDaysAgo(
  sessionDate: string,
  referenceDate: string
): string {
  const session = new Date(`${sessionDate}T12:00:00`);
  const reference = new Date(`${referenceDate}T12:00:00`);
  const days = Math.max(
    0,
    Math.floor((reference.getTime() - session.getTime()) / MS_PER_DAY)
  );
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  return `${days} days ago`;
}

/** Inline last-session line for free-form sets (PRD 10 Batch 1). */
export function formatLastPerformanceLine(
  performance: LastPerformance,
  referenceDate: string
): string {
  const when = formatRelativeDaysAgo(performance.date, referenceDate);
  return `Last time: ${performance.weight_kg} kg × ${performance.reps} @ RPE ${performance.rpe} (${when})`;
}

/**
 * Free-form progression suggestion from prior performance.
 * Delegates to suggestWeightProgression — do not duplicate the maths here.
 */
export function buildFreeFormSuggestion(
  performance: LastPerformance | null,
  targetReps = 8,
  incrementPct = 2.5
): FreeFormSuggestion | null {
  if (!performance) {
    return null;
  }
  return suggestWeightProgression(
    performance.weight_kg,
    performance.reps,
    targetReps,
    performance.rpe,
    incrementPct
  );
}

/**
 * Linear periodization keeps the same rep/RPE prescription and progresses load
 * when autoregulation criteria are met (2-5% jumps are typical for compounds).
 * Baker D et al. J Strength Cond Res. 2007.
 */
export function resolveLinearTargets(
  prescription: ProgramPrescription,
  lastPerformance: { weight_kg: number; reps: number; rpe: number } | null,
  incrementPct = 2.5
): ResolvedProgramTarget {
  if (!lastPerformance) {
    return {
      ...prescription,
      progression_note: NO_HISTORY_GUIDANCE,
      suggested_weight_kg: null,
    };
  }

  const targetReps = parseTargetReps(prescription.target_reps);
  const progression = suggestWeightProgression(
    lastPerformance.weight_kg,
    lastPerformance.reps,
    targetReps,
    lastPerformance.rpe,
    incrementPct
  );

  return {
    ...prescription,
    progression_note: progression.note,
    suggested_weight_kg: progression.weight,
  };
}

/**
 * Daily undulating periodization uses the day-specific prescription directly.
 * Intensity and volume shift session-to-session instead of week-to-week.
 * Rhea MR et al. J Strength Cond Res. 2002.
 */
export function resolveDupTargets(
  prescription: ProgramPrescription
): ResolvedProgramTarget {
  const emphasis = getDupDayEmphasis(prescription.target_reps);
  const emphasisNote = {
    endurance: "Metabolic emphasis: higher reps with controlled RPE.",
    hypertrophy: "Hypertrophy emphasis: moderate reps in the 6-12 range.",
    strength: "Strength emphasis: lower reps, higher relative intensity.",
  }[emphasis];

  return {
    ...prescription,
    dup_emphasis: emphasis,
    progression_note: emphasisNote,
    suggested_weight_kg: null,
  };
}

export function resolveProgramTargets(
  periodizationType: PeriodizationType,
  prescription: ProgramPrescription,
  lastPerformance: { weight_kg: number; reps: number; rpe: number } | null,
  incrementPct = 2.5
): ResolvedProgramTarget {
  if (periodizationType === "dup") {
    return resolveDupTargets(prescription);
  }
  return resolveLinearTargets(prescription, lastPerformance, incrementPct);
}

/**
 * Progressive overload percentage.
 * Suggests weight increase based on last performance.
 */
export function suggestWeightProgression(
  lastWeight: number,
  lastReps: number,
  targetReps: number,
  rpe: number,
  incrementPct = 2.5
): { weight: number; reps: number; note: string } {
  const multiplier = 1 + incrementPct / 100;

  if (rpe <= 7 && lastReps >= targetReps + 2) {
    return {
      note: `+${incrementPct}% — last set felt easy at RPE ${rpe}`,
      reps: targetReps,
      weight: Math.round(lastWeight * multiplier * 10) / 10,
    };
  }
  if (rpe >= 9 && lastReps < targetReps) {
    return {
      note: `Hold weight — last set was too hard at RPE ${rpe}`,
      reps: lastReps,
      weight: lastWeight,
    };
  }
  return {
    note: `Add a rep — maintain load at RPE ${rpe}`,
    reps: targetReps + (lastReps >= targetReps ? 1 : 0),
    weight: lastWeight,
  };
}

/**
 * Descriptor for the session a user is actively training in. Carried either by
 * in-page state (free-form "Start Workout") or derived from the ?session=N URL
 * param. See issue #19 — replaced a useEffect that mirrored server data into
 * useState with a value derived during render.
 *
 * Example: activeSessionFromUrl({ id: 5, program_id: 2, program_day_id: 7 })
 *          // { id: 5, tempRef: 'session-5', programId: 2, programDayId: 7 }
 */
export interface ActiveSession {
  id: number | null;
  programDayId: number | null;
  programId: number | null;
  startedAt: string;
  tempRef: string;
}

/**
 * Project a server-loaded WorkoutSession row into the ActiveSession shape the
 * workout page consumes. Pure so it can be unit-tested in isolation.
 */
export function activeSessionFromUrl(session: {
  id: number;
  program_id: number | null;
  program_day_id: number | null;
  created_at: string;
}): ActiveSession {
  return {
    id: session.id,
    programDayId: session.program_day_id,
    programId: session.program_id,
    startedAt: session.created_at,
    tempRef: `session-${session.id}`,
  };
}

export interface SessionVolumeSet {
  exercise_id: number;
  reps: number | null;
  weight_kg: number | null;
}

export interface SessionVolumeStats {
  exerciseCount: number;
  setCount: number;
  totalVolume: number;
}

/**
 * Aggregate session volume metrics from logged sets.
 * Volume = sets × reps × weight (Schoenfeld et al. 2017).
 */
export function computeSessionVolumeStats(
  sets: SessionVolumeSet[]
): SessionVolumeStats {
  const validSets = sets.filter(
    (set) => set.reps !== null && set.weight_kg !== null
  );
  const exerciseIds = new Set(validSets.map((set) => set.exercise_id));
  const totalVolume = validSets.reduce(
    (sum, set) =>
      sum + calculateVolume(1, set.reps as number, set.weight_kg as number),
    0
  );

  return {
    exerciseCount: exerciseIds.size,
    setCount: validSets.length,
    totalVolume: Math.round(totalVolume),
  };
}

export interface SessionVolumeComparison {
  direction: "more" | "less" | "same" | "first";
  percentChange: number | null;
}

/**
 * Compare current session volume to the previous same-named session.
 * Returns null percentChange when there is no prior session to compare.
 */
export function compareSessionVolumes(
  current: Pick<SessionVolumeStats, "totalVolume">,
  previous: Pick<SessionVolumeStats, "totalVolume"> | null
): SessionVolumeComparison {
  if (!previous || previous.totalVolume <= 0) {
    return { direction: "first", percentChange: null };
  }

  const diff = current.totalVolume - previous.totalVolume;
  const percentChange = Math.round((diff / previous.totalVolume) * 100);

  if (percentChange === 0) {
    return { direction: "same", percentChange: 0 };
  }

  return {
    direction: diff > 0 ? "more" : "less",
    percentChange: Math.abs(percentChange),
  };
}

/** Lowercase session label for comparison copy ("last chest day"). */
export function sessionComparisonLabel(
  name: string | null | undefined
): string {
  const trimmed = (name ?? "workout").trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : "workout";
}

/**
 * One-line volume comparison for the session summary (issue #62).
 * @example formatSessionVolumeComparison(1240, 'Chest Day', { percentChange: 8, direction: 'more' })
 *          // '1,240 kg total — 8% more than last chest day.'
 */
export function formatSessionVolumeComparison(
  totalVolume: number,
  sessionName: string | null | undefined,
  comparison: SessionVolumeComparison
): string {
  const formattedVolume = formatDisplayInteger(totalVolume);
  const label = sessionComparisonLabel(sessionName);

  if (comparison.direction === "first") {
    return `${formattedVolume} kg total — your first ${label}.`;
  }

  if (comparison.direction === "same") {
    return `${formattedVolume} kg total — same volume as last ${label}.`;
  }

  return `${formattedVolume} kg total — ${comparison.percentChange}% ${comparison.direction} than last ${label}.`;
}

const MS_PER_MINUTE = 60_000;

/**
 * Elapsed whole minutes between session start and finish timestamps.
 * Minimum of 1 minute so zero-length sessions still display duration.
 */
export function durationMinutesBetween(
  startedAtIso: string,
  finishedAtIso: string
): number {
  const startedMs = Date.parse(startedAtIso);
  const finishedMs = Date.parse(finishedAtIso);
  if (!(Number.isFinite(startedMs) && Number.isFinite(finishedMs))) {
    return 1;
  }

  const elapsed = Math.max(0, finishedMs - startedMs);
  return Math.max(1, Math.round(elapsed / MS_PER_MINUTE));
}
