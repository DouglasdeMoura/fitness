/**
 * Pure presentation helpers for the dashboard view.
 *
 * These centralise the progress-bar maths that used to live inline in the
 * route component so it can be unit-tested in isolation. They are deliberately
 * framework-agnostic (no React) and produce plain values consumed by the
 * Astryx `ProgressBar` component.
 */

/** Base colour tone for a macro bar before the over-target override kicks in. */
export type MacroTone = 'success' | 'warning' | 'accent'

/**
 * Shape consumed by Astryx `ProgressBar`. `variant` is the union of the macro
 * base tones plus `error`, which is forced whenever intake exceeds the target.
 */
export interface ProgressBarState {
  /** Fill value, clamped to the target so the bar never overflows its track. */
  value: number
  /** Target value used as the bar maximum (>= 1 to avoid a zero-height track). */
  max: number
  /** Semantic tone; flips to `error` on an over-target day. */
  variant: MacroTone | 'error'
}

/**
 * Maps consumed/target intake into `ProgressBar` props.
 *
 * A day that exceeds the target still renders a full bar (value clamped to the
 * target) but switches to the `error` tone, matching the previous custom-CSS
 * behaviour where `.progress-bar-fill.over` painted the fill red.
 */
export function macroProgress(
  consumed: number,
  target: number,
  tone: MacroTone,
): ProgressBarState {
  const max = target > 0 ? target : 1
  return {
    value: Math.min(consumed, target),
    max,
    variant: target > 0 && consumed > target ? 'error' : tone,
  }
}

/**
 * Builds the human-readable calories summary shown under the calorie bar.
 *
 * Returns "X kcal remaining" when at or under target and "X kcal over target"
 * when above it. `Math.round` matches the displayed precision elsewhere on the
 * dashboard (calorie values are whole numbers from the food database).
 */
export function calorieRemainingLabel(consumed: number, target: number): string {
  const diff = target - consumed
  const magnitude = Math.abs(Math.round(diff))
  return diff >= 0 ? `${magnitude} kcal remaining` : `${magnitude} kcal over target`
}
