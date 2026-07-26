/**
 * Shared display formatters for numeric UI (issue #50).
 *
 * Routes and components should import these helpers instead of calling
 * Math.round / toFixed directly so number formatting stays consistent.
 */

/** Whole-number display for calories, reps, set counts, and similar metrics. */
export function formatDisplayInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

/** Fixed-decimal display for weights, trends, and per-week averages. */
export function formatDisplayDecimal(value: number, decimals = 1): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
