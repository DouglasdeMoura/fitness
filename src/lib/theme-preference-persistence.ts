import type { FitTrackDatabase } from "~/db";
import {
  getThemePreferenceRecord,
  updateThemePreferenceRecord,
} from "~/db/user-body-queries";
import { normalizeThemePreference } from '~/lib/app-chrome';
import type { ThemePreference } from '~/lib/app-chrome';

/**
 * Read one user's stored theme preference.
 * @example await getStoredThemePreference(db, 1) // "system"
 */
export async function getStoredThemePreference(
  database: FitTrackDatabase,
  userId: number
): Promise<ThemePreference> {
  const stored = await getThemePreferenceRecord(database, userId);
  return normalizeThemePreference(stored);
}

/**
 * Persist one user's theme preference.
 * @example await updateStoredThemePreference(db, 1, "dark") // "dark"
 */
export async function updateStoredThemePreference(
  database: FitTrackDatabase,
  userId: number,
  themePreference: ThemePreference
): Promise<ThemePreference> {
  const updated = await updateThemePreferenceRecord(
    database,
    userId,
    themePreference
  );
  return normalizeThemePreference(updated.themePreference);
}
