/**
 * Pure toast copy + durations for mutation feedback (issue #24 / PRD 05 Batch 1).
 *
 * Kept free of React so Vitest can assert the user-visible strings without
 * mounting Astryx. Call sites pass these into `useToast()`.
 */

export const TOAST_DURATION_MS = {
  /** Default info auto-hide (Astryx default). */
  info: 5000,
  /** Workout set save — short confirmation. */
  setSaved: 3000,
  /** Delete + Undo window. */
  undo: 8000,
} as const

export type MutationToastAction =
  | 'Save profile'
  | 'Log food'
  | 'Delete entry'
  | 'Log weight'
  | 'Save set'
  | 'Delete set'
  | 'Export data'

/** Profile save confirmation. */
export function profileSavedBody(): string {
  return 'Profile saved'
}

/** Food log confirmation. */
export function foodLoggedBody(): string {
  return 'Food logged'
}

/** Food entry delete confirmation (pair with Undo in endContent). */
export function entryDeletedBody(): string {
  return 'Entry deleted'
}

/** Copy-from-yesterday confirmation (pair with Undo in endContent). */
export function copyCompletedBody(entryCount: number): string {
  const label = entryCount === 1 ? 'entry' : 'entries'
  return `Copied ${entryCount} ${label}`
}

/** Weight log confirmation including the kg value the user just entered. */
export function weightLoggedBody(kg: number): string {
  return `Weight logged — ${kg}kg`
}

/** Workout set save confirmation. */
export function setSavedBody(): string {
  return 'Set saved'
}

/** Workout set delete confirmation (pair with Undo in endContent). */
export function setDeletedBody(): string {
  return 'Set deleted'
}

/** JSON export confirmation. */
export function dataExportedBody(): string {
  return 'Data exported'
}

/**
 * Error toast body for a failed mutation. Error toasts persist until dismissed.
 * @example mutationFailedBody('Save profile') // "Save profile failed"
 */
export function mutationFailedBody(action: MutationToastAction | string): string {
  return `${action} failed`
}
