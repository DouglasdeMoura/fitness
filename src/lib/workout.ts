// Science-backed workout & training calculations
// References:
// - Schoenfeld BJ et al. "Effects of resistance training frequency on muscle hypertrophy." Sports Med. 2019
// - Schoenfeld BJ et al. "Dose-response relationship between weekly resistance training volume and muscle hypertrophy." J Strength Cond Res. 2017
// - Radaelli R et al. "Dose-response of 1, 3, and 5 sets of resistance exercise on elbow flexors." Eur J Appl Physiol. 2023

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'core'
  | 'full_body'

export const VOLUME_GUIDELINES: Record<MuscleGroup, { min: number; max: number; label: string }> = {
  chest: { min: 8, max: 16, label: 'Chest' },
  back: { min: 10, max: 20, label: 'Back' },
  shoulders: { min: 8, max: 16, label: 'Shoulders' },
  arms: { min: 8, max: 16, label: 'Arms' },
  legs: { min: 10, max: 20, label: 'Legs' },
  core: { min: 8, max: 16, label: 'Core' },
  full_body: { min: 10, max: 20, label: 'Full Body' },
}

/**
 * Estimated 1RM using Epley equation.
 * Epley B. "Weight training." In: Encyclopedia of Sports Medicine. 1985
 */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight
  return weight * (1 + reps / 30)
}

/**
 * Reverse Epley: given target reps and %1RM, calculate working weight
 */
export function weightFrom1RM(oneRM: number, reps: number): number {
  if (reps <= 1) return oneRM
  return oneRM / (1 + reps / 30)
}

/**
 * Training volume = sets x reps x weight
 * Volume is the primary driver of hypertrophy (Schoenfeld et al. 2017)
 */
export function calculateVolume(sets: number, reps: number, weight: number): number {
  return sets * reps * weight
}

/**
 * Volume Load Intensity for a set
 * Uses RPE (Rate of Perceived Exertion) to estimate RIR (Reps in Reserve)
 * RIR = 10 - RPE
 *
 * For hypertrophy, optimal RIR is 1-3 (Zourdos et al. 2016; Helms et al. 2016)
 */
export function rpeToRir(rpe: number): number {
  return Math.max(0, 10 - rpe)
}

/**
 * Weekly volume distribution recommendation.
 * Schoenfeld et al. 2019: 2x/week frequency per muscle group is optimal for hypertrophy.
 */
export function recommendWeeklyVolume(frequency: number, muscleGroup: MuscleGroup): number {
  const guideline = VOLUME_GUIDELINES[muscleGroup]
  if (frequency >= 2) return Math.round((guideline.min + guideline.max) / 2)
  return guideline.max // if training once a week, need more volume per session
}

export type WorkoutStats = {
  totalVolume: number
  totalSets: number
  estimatedDuration: number
  muscleGroupsWorked: string[]
}

export function calculateWorkoutStats(
  sets: Array<{ reps: number | null; weight_kg: number | null; exercise_id: number }>
): WorkoutStats {
  let totalVolume = 0
  let totalSets = sets.length
  let estimatedDuration = 0

  for (const set of sets) {
    const reps = set.reps || 0
    const weight = set.weight_kg || 0
    totalVolume += reps * weight
    // Estimate: ~60 seconds per set + ~90 seconds rest
    estimatedDuration += 150
  }

  return {
    totalVolume: Math.round(totalVolume),
    totalSets,
    estimatedDuration: Math.round(estimatedDuration / 60),
    muscleGroupsWorked: [],
  }
}

/**
 * Progressive overload percentage.
 * Suggests weight increase based on last performance.
 */
export function suggestWeightProgression(
  lastWeight: number,
  lastReps: number,
  targetReps: number,
  rpe: number
): { weight: number; reps: number; note: string } {
  if (rpe <= 7 && lastReps >= targetReps + 2) {
    // Easy set, completed extra reps - increase weight
    return {
      weight: Math.round((lastWeight * 1.025) * 10) / 10,
      reps: targetReps,
      note: 'Increase weight 2.5% (RPE was low, extra reps achieved)',
    }
  }
  if (rpe >= 9 && lastReps < targetReps) {
    // Too hard, missed reps - keep weight, reduce target reps
    return {
      weight: lastWeight,
      reps: lastReps,
      note: 'Keep weight, RPE was high - maintain before progressing',
    }
  }
  // In the sweet spot - micro progress
  return {
    weight: lastWeight,
    reps: targetReps + (lastReps >= targetReps ? 1 : 0),
    note: 'Maintain or add 1 rep before increasing weight',
  }
}
