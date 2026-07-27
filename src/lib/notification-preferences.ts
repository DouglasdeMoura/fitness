/**
 * Reminder preference defaults, persistence, and delivery gating (issue #66).
 * Burke et al. 2011: timely prompts support self-monitoring adherence.
 */

import type Database from 'better-sqlite3'
import type { NotificationPreferencesRow } from './db'

export type NotificationType =
  | 'rest_timer'
  | 'meal_reminder'
  | 'workout_reminder'
  | 'weekly_review'

export type NotificationPreferences = {
  rest_timer: boolean
  meal_reminders: boolean
  meal_times: string[]
  workout_reminders: boolean
  workout_days: number[]
  workout_time: string | null
  weekly_review: boolean
  weekly_review_day: number | null
  weekly_review_time: string | null
  quiet_start: string | null
  quiet_end: string | null
}

export type NotificationPreferencesUpdate = Partial<NotificationPreferences>

export const REMINDERS_CARD_TITLE = 'Reminders'

export const WEEKDAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
] as const

const DEFAULT_MEAL_TIME = '12:00'
const DEFAULT_WORKOUT_TIME = '09:00'
const DEFAULT_WEEKLY_REVIEW_DAY = 0
const DEFAULT_WEEKLY_REVIEW_TIME = '09:00'

/** All reminder types default off until the user opts in (issue #66). */
export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    rest_timer: false,
    meal_reminders: false,
    meal_times: [],
    workout_reminders: false,
    workout_days: [],
    workout_time: null,
    weekly_review: false,
    weekly_review_day: null,
    weekly_review_time: null,
    quiet_start: null,
    quiet_end: null,
  }
}

function parseJsonStringArray(raw: string | null): string[] {
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

function parseJsonNumberArray(raw: string | null): number[] {
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((value): value is number => typeof value === 'number')
  } catch {
    return []
  }
}

function rowToPreferences(row: NotificationPreferencesRow): NotificationPreferences {
  return {
    rest_timer: row.rest_timer === 1,
    meal_reminders: row.meal_reminders === 1,
    meal_times: parseJsonStringArray(row.meal_times),
    workout_reminders: row.workout_reminders === 1,
    workout_days: parseJsonNumberArray(row.workout_days),
    workout_time: row.workout_time,
    weekly_review: row.weekly_review === 1,
    weekly_review_day: row.weekly_review_day,
    weekly_review_time: row.weekly_review_time,
    quiet_start: row.quiet_start,
    quiet_end: row.quiet_end,
  }
}

export function getNotificationPreferences(
  db: Database.Database,
  userId: number,
): NotificationPreferences {
  const row = db
    .prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
    .get(userId) as NotificationPreferencesRow | undefined
  if (!row) {
    return defaultNotificationPreferences()
  }
  return rowToPreferences(row)
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0
}

function normalizeMealTimes(times: string[]): string[] {
  return [...new Set(times.filter((time) => /^\d{2}:\d{2}$/.test(time)))].sort()
}

function normalizeWorkoutDays(days: number[]): number[] {
  return [...new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort(
    (a, b) => a - b,
  )
}

function withReminderDefaults(
  current: NotificationPreferences,
  update: NotificationPreferencesUpdate,
): NotificationPreferences {
  const next: NotificationPreferences = {
    ...current,
    ...update,
    meal_times: update.meal_times ?? current.meal_times,
    workout_days: update.workout_days ?? current.workout_days,
  }

  if (update.meal_reminders === true && next.meal_times.length === 0) {
    next.meal_times = [DEFAULT_MEAL_TIME]
  }
  if (update.workout_reminders === true) {
    if (next.workout_days.length === 0) {
      next.workout_days = [1, 3, 5]
    }
    if (!next.workout_time) {
      next.workout_time = DEFAULT_WORKOUT_TIME
    }
  }
  if (update.weekly_review === true) {
    if (next.weekly_review_day == null) {
      next.weekly_review_day = DEFAULT_WEEKLY_REVIEW_DAY
    }
    if (!next.weekly_review_time) {
      next.weekly_review_time = DEFAULT_WEEKLY_REVIEW_TIME
    }
  }

  next.meal_times = normalizeMealTimes(next.meal_times)
  next.workout_days = normalizeWorkoutDays(next.workout_days)
  return next
}

export function upsertNotificationPreferences(
  db: Database.Database,
  userId: number,
  update: NotificationPreferencesUpdate,
): NotificationPreferences {
  const current = getNotificationPreferences(db, userId)
  const next = withReminderDefaults(current, update)

  db.prepare(
    `INSERT INTO notification_preferences (
      user_id, rest_timer, meal_reminders, meal_times,
      workout_reminders, workout_days, workout_time,
      weekly_review, weekly_review_day, weekly_review_time,
      quiet_start, quiet_end
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      rest_timer = excluded.rest_timer,
      meal_reminders = excluded.meal_reminders,
      meal_times = excluded.meal_times,
      workout_reminders = excluded.workout_reminders,
      workout_days = excluded.workout_days,
      workout_time = excluded.workout_time,
      weekly_review = excluded.weekly_review,
      weekly_review_day = excluded.weekly_review_day,
      weekly_review_time = excluded.weekly_review_time,
      quiet_start = excluded.quiet_start,
      quiet_end = excluded.quiet_end`,
  ).run(
    userId,
    boolToInt(next.rest_timer),
    boolToInt(next.meal_reminders),
    JSON.stringify(next.meal_times),
    boolToInt(next.workout_reminders),
    JSON.stringify(next.workout_days),
    next.workout_time,
    boolToInt(next.weekly_review),
    next.weekly_review_day,
    next.weekly_review_time,
    next.quiet_start,
    next.quiet_end,
  )

  return next
}

/** Minutes since local midnight for schedule comparisons. */
export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function parseClockTime(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) {
    throw new Error(`Expected HH:MM time, got ${JSON.stringify(time)}`)
  }
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * Whether `now` falls inside quiet hours. Handles windows that cross midnight
 * (e.g. 22:00-07:00) — a naive start <= now <= end check fails at 03:00.
 */
export function isInQuietHours(
  now: Date,
  quietStart: string | null,
  quietEnd: string | null,
): boolean {
  if (!quietStart || !quietEnd) {
    return false
  }

  const nowMinutes = minutesSinceMidnight(now)
  const startMinutes = parseClockTime(quietStart)
  const endMinutes = parseClockTime(quietEnd)

  if (startMinutes === endMinutes) {
    return false
  }

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

function formatClockTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function matchesSchedule(now: Date, prefs: NotificationPreferences, type: NotificationType): boolean {
  const clock = formatClockTime(now)
  const weekday = now.getDay()

  switch (type) {
    case 'rest_timer':
      return true
    case 'meal_reminder':
      return prefs.meal_times.includes(clock)
    case 'workout_reminder':
      return (
        prefs.workout_days.includes(weekday) &&
        prefs.workout_time != null &&
        prefs.workout_time === clock
      )
    case 'weekly_review':
      return (
        prefs.weekly_review_day === weekday &&
        prefs.weekly_review_time != null &&
        prefs.weekly_review_time === clock
      )
    default: {
      const exhaustive: never = type
      throw new Error(`Unknown notification type: ${exhaustive}`)
    }
  }
}

function isTypeEnabled(prefs: NotificationPreferences, type: NotificationType): boolean {
  switch (type) {
    case 'rest_timer':
      return prefs.rest_timer
    case 'meal_reminder':
      return prefs.meal_reminders
    case 'workout_reminder':
      return prefs.workout_reminders
    case 'weekly_review':
      return prefs.weekly_review
    default: {
      const exhaustive: never = type
      throw new Error(`Unknown notification type: ${exhaustive}`)
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
  type: NotificationType,
): boolean {
  if (!isTypeEnabled(prefs, type)) {
    return false
  }
  if (isInQuietHours(now, prefs.quiet_start, prefs.quiet_end)) {
    return false
  }
  return matchesSchedule(now, prefs, type)
}
