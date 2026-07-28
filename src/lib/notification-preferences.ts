/**
 * Reminder preference defaults, persistence, and delivery gating (issue #66).
 * Burke et al. 2011: timely prompts support self-monitoring adherence.
 */

import type { FitTrackDatabase } from "~/db";
import {
  getNotificationPreferencesRow,
  upsertNotificationPreferencesRow,
} from "~/db/notification-queries";
import type { NotificationPreferencesRow } from "~/db/types";

import {
  parsePersistedJson,
  storedIsoTimeArraySchema,
  storedWeekdayArraySchema,
} from "./schemas/persistence";
import type {
  NotificationPreferences,
  NotificationPreferencesUpdate,
} from "./schemas/user";

export type {
  NotificationPreferences,
  NotificationPreferencesUpdate,
} from "./schemas/user";

export type NotificationType =
  | "rest_timer"
  | "meal_reminder"
  | "workout_reminder"
  | "weekly_review";

export const REMINDERS_CARD_TITLE = "Reminders";

export const WEEKDAY_OPTIONS = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
] as const;

const DEFAULT_MEAL_TIME = "12:00";
const DEFAULT_WORKOUT_TIME = "09:00";
const DEFAULT_WEEKLY_REVIEW_DAY = 0;
const DEFAULT_WEEKLY_REVIEW_TIME = "09:00";

/** All reminder types default off until the user opts in (issue #66). */
export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    meal_reminders: false,
    meal_times: [],
    quiet_end: null,
    quiet_start: null,
    rest_timer: false,
    weekly_review: false,
    weekly_review_day: null,
    weekly_review_time: null,
    workout_days: [],
    workout_reminders: false,
    workout_time: null,
  };
}

function parseJsonStringArray(raw: string | null): string[] {
  return parsePersistedJson(
    storedIsoTimeArraySchema,
    raw,
    [],
    "notification_preferences.meal_times"
  );
}

function parseJsonNumberArray(raw: string | null): number[] {
  return parsePersistedJson(
    storedWeekdayArraySchema,
    raw,
    [],
    "notification_preferences.workout_days"
  );
}

function rowToPreferences(
  row: NotificationPreferencesRow
): NotificationPreferences {
  return {
    meal_reminders: row.meal_reminders === 1,
    meal_times: parseJsonStringArray(row.meal_times),
    quiet_end: row.quiet_end,
    quiet_start: row.quiet_start,
    rest_timer: row.rest_timer === 1,
    weekly_review: row.weekly_review === 1,
    weekly_review_day: row.weekly_review_day,
    weekly_review_time: row.weekly_review_time,
    workout_days: parseJsonNumberArray(row.workout_days),
    workout_reminders: row.workout_reminders === 1,
    workout_time: row.workout_time,
  };
}

export function getNotificationPreferences(
  db: FitTrackDatabase,
  userId: number
): NotificationPreferences {
  const row = getNotificationPreferencesRow(db, userId);
  if (!row) {
    return defaultNotificationPreferences();
  }
  return rowToPreferences(row);
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

function normalizeMealTimes(times: string[]): string[] {
  return [
    ...new Set(times.filter((time) => /^\d{2}:\d{2}$/u.test(time))),
  ].sort();
}

function normalizeWorkoutDays(days: number[]): number[] {
  return [
    ...new Set(
      days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    ),
  ].sort((a, b) => a - b);
}

function withReminderDefaults(
  current: NotificationPreferences,
  update: NotificationPreferencesUpdate
): NotificationPreferences {
  const next: NotificationPreferences = {
    ...current,
    ...update,
    meal_times: update.meal_times ?? current.meal_times,
    workout_days: update.workout_days ?? current.workout_days,
  };

  if (update.meal_reminders === true && next.meal_times.length === 0) {
    next.meal_times = [DEFAULT_MEAL_TIME];
  }
  if (update.workout_reminders === true) {
    if (next.workout_days.length === 0) {
      next.workout_days = [1, 3, 5];
    }
    if (!next.workout_time) {
      next.workout_time = DEFAULT_WORKOUT_TIME;
    }
  }
  if (update.weekly_review === true) {
    if (next.weekly_review_day === null) {
      next.weekly_review_day = DEFAULT_WEEKLY_REVIEW_DAY;
    }
    if (!next.weekly_review_time) {
      next.weekly_review_time = DEFAULT_WEEKLY_REVIEW_TIME;
    }
  }

  next.meal_times = normalizeMealTimes(next.meal_times);
  next.workout_days = normalizeWorkoutDays(next.workout_days);
  return next;
}

export function upsertNotificationPreferences(
  db: FitTrackDatabase,
  userId: number,
  update: NotificationPreferencesUpdate
): NotificationPreferences {
  const current = getNotificationPreferences(db, userId);
  const next = withReminderDefaults(current, update);

  upsertNotificationPreferencesRow(db, {
    meal_reminders: boolToInt(next.meal_reminders),
    meal_times: JSON.stringify(next.meal_times),
    quiet_end: next.quiet_end,
    quiet_start: next.quiet_start,
    rest_timer: boolToInt(next.rest_timer),
    user_id: userId,
    weekly_review: boolToInt(next.weekly_review),
    weekly_review_day: next.weekly_review_day,
    weekly_review_time: next.weekly_review_time,
    workout_days: JSON.stringify(next.workout_days),
    workout_reminders: boolToInt(next.workout_reminders),
    workout_time: next.workout_time,
  });

  return next;
}

/** Minutes since local midnight for schedule comparisons. */
export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseClockTime(time: string): number {
  const match = /^(\d{2}):(\d{2})$/u.exec(time);
  if (!match) {
    throw new Error(`Expected HH:MM time, got ${JSON.stringify(time)}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Whether `now` falls inside quiet hours. Handles windows that cross midnight
 * (e.g. 22:00-07:00) — a naive start <= now <= end check fails at 03:00.
 */
export function isInQuietHours(
  now: Date,
  quietStart: string | null,
  quietEnd: string | null
): boolean {
  if (!(quietStart && quietEnd)) {
    return false;
  }

  const nowMinutes = minutesSinceMidnight(now);
  const startMinutes = parseClockTime(quietStart);
  const endMinutes = parseClockTime(quietEnd);

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function formatClockTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function matchesSchedule(
  now: Date,
  prefs: NotificationPreferences,
  type: NotificationType
): boolean {
  const clock = formatClockTime(now);
  const weekday = now.getDay();

  switch (type) {
    case "rest_timer": {
      return true;
    }
    case "meal_reminder": {
      return prefs.meal_times.includes(clock);
    }
    case "workout_reminder": {
      return (
        prefs.workout_days.includes(weekday) &&
        prefs.workout_time !== null &&
        prefs.workout_time === clock
      );
    }
    case "weekly_review": {
      return (
        prefs.weekly_review_day === weekday &&
        prefs.weekly_review_time !== null &&
        prefs.weekly_review_time === clock
      );
    }
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown notification type: ${exhaustive}`);
    }
  }
}

function isTypeEnabled(
  prefs: NotificationPreferences,
  type: NotificationType
): boolean {
  switch (type) {
    case "rest_timer": {
      return prefs.rest_timer;
    }
    case "meal_reminder": {
      return prefs.meal_reminders;
    }
    case "workout_reminder": {
      return prefs.workout_reminders;
    }
    case "weekly_review": {
      return prefs.weekly_review;
    }
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown notification type: ${exhaustive}`);
    }
  }
}

/**
 * Pure delivery gate for the future scheduler (issue #66).
 * @example shouldDeliver(new Date('2026-01-05T12:00:00'), prefs, 'meal_reminder')
 */
export function shouldDeliver(
  now: Date,
  prefs: NotificationPreferences,
  type: NotificationType
): boolean {
  if (!isTypeEnabled(prefs, type)) {
    return false;
  }
  if (isInQuietHours(now, prefs.quiet_start, prefs.quiet_end)) {
    return false;
  }
  return matchesSchedule(now, prefs, type);
}
