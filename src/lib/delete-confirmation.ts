/**
 * User-visible copy for delete confirmation dialogs (issue #25 / PRD 05 §2).
 * Pure strings so Vitest can assert without mounting Astryx.
 */

export function deleteFoodEntryTitle(): string {
  return "Delete this entry?";
}

export function deleteWorkoutSetTitle(): string {
  return "Delete this set?";
}

/** @example deleteNamedEntityTitle('Push Day') => "Delete 'Push Day'?" */
export function deleteNamedEntityTitle(name: string): string {
  return `Delete '${name}'?`;
}

export function deleteCannotBeUndoneSubtitle(): string {
  return "This cannot be undone.";
}
