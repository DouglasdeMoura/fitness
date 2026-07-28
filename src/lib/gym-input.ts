/** Plate-friendly weight increments (common barbell/disc steps). Issue #53. */
export const WEIGHT_STEP_KG = 2.5;

/** Rep prescriptions adjust one rep at a time between sets. Issue #53. */
export const REPS_STEP = 1;

const MIN_WEIGHT_KG = 0;

function decimalPlaces(step: number): number {
  const stepText = String(step);
  const dot = stepText.indexOf(".");
  return dot === -1 ? 0 : stepText.length - dot - 1;
}

/** Snaps a value to the nearest valid step (e.g. 21.3 kg → 20 kg at 2.5 steps). */
export function snapToStep(value: number, step: number): number {
  const places = decimalPlaces(step);
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toFixed(places));
}

/** Moves a numeric field by one step, clamped to min. Issue #53 steppers. */
export function adjustByStep(
  current: number,
  step: number,
  direction: -1 | 1,
  min = MIN_WEIGHT_KG
): number {
  const next = snapToStep(current + direction * step, step);
  return Math.max(min, next);
}

export function adjustWeightKg(current: number, direction: -1 | 1): number {
  return adjustByStep(current, WEIGHT_STEP_KG, direction, MIN_WEIGHT_KG);
}

export function adjustReps(current: number, direction: -1 | 1): number {
  return adjustByStep(current, REPS_STEP, direction, 0);
}
