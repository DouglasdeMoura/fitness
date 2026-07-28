/**
 * Pure consistency metrics for food logging and workouts.
 * Self-monitoring consistency predicts outcomes (Burke et al. 2011).
 */
import { addDays, formatWeekday, getWeekStart } from "./nutrition";

export interface ConsistencyDay {
  date: string;
  logged: boolean;
  weekday: string;
}

export interface StreakOptions {
  /** When set, `graceDays` resets at the start of each period (e.g. 7 for weekly rest). */
  gracePeriodDays?: number;
}

function hasOlderLog(dates: string[], day: string): boolean {
  return dates.some((entry) => entry < day);
}

function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates)].sort();
}

function windowDates(asOf: string, windowDays: number): string[] {
  const days: string[] = [];
  for (let offset = windowDays - 1; offset >= 0; offset--) {
    days.push(addDays(asOf, -offset));
  }
  return days;
}

function expectedTrainingDays(
  windowDays: number,
  restDaysAllowed: number
): number {
  if (windowDays <= 0) {
    throw new Error(
      `expectedTrainingDays: windowDays must be > 0, got ${windowDays}`
    );
  }
  const fullWeeks = Math.floor(windowDays / 7);
  return windowDays - fullWeeks * restDaysAllowed;
}

/**
 * Rolling share of days with at least one food log.
 * @example logAdherence(['2020-01-01', '2020-01-03'], 7, '2020-01-07') // 29
 */
export function logAdherence(
  dates: string[],
  windowDays: number,
  asOf: string
): number {
  if (windowDays <= 0) {
    throw new Error(`logAdherence: windowDays must be > 0, got ${windowDays}`);
  }

  const logged = new Set(dates);
  const daysWithLogs = windowDates(asOf, windowDays).filter((day) =>
    logged.has(day)
  ).length;
  return Math.round((daysWithLogs / windowDays) * 100);
}

/**
 * Share of expected training days met, allowing prescribed weekly rest.
 * Schoenfeld et al. 2016: resistance programs include planned rest days.
 */
export function workoutAdherence(
  sessionDates: string[],
  windowDays: number,
  restDaysAllowed: number,
  asOf: string
): number {
  if (windowDays <= 0) {
    throw new Error(
      `workoutAdherence: windowDays must be > 0, got ${windowDays}`
    );
  }

  const expected = expectedTrainingDays(windowDays, restDaysAllowed);
  if (expected === 0) {
    return 0;
  }

  const sessions = new Set(sessionDates);
  const daysMet = windowDates(asOf, windowDays).filter((day) =>
    sessions.has(day)
  ).length;
  return Math.round(Math.min(100, (daysMet / expected) * 100));
}

/**
 * Consecutive days ending at `asOf`, tolerating a grace allowance.
 * Use `gracePeriodDays: 7` with `graceDays: 1` so one rest day per week does not break workout streaks.
 */
export function currentStreak(
  dates: string[],
  graceDays: number,
  asOf: string,
  options?: StreakOptions
): number {
  const logged = new Set(dates);
  const gracePeriodDays = options?.gracePeriodDays;
  let streak = 0;
  let graceLeft = graceDays;
  let periodAnchor = gracePeriodDays ? getWeekStart(asOf) : null;
  let day = asOf;

  while (true) {
    if (gracePeriodDays && getWeekStart(day) !== periodAnchor) {
      periodAnchor = getWeekStart(day);
      graceLeft = graceDays;
    }

    if (logged.has(day)) {
      streak++;
      graceLeft = graceDays;
    } else if (streak > 0 && graceLeft > 0 && hasOlderLog(dates, day)) {
      graceLeft--;
      streak++;
    } else {
      break;
    }

    day = addDays(day, -1);
  }

  return streak;
}

/** Longest run of consecutive calendar days with a log. */
export function longestStreak(dates: string[]): number {
  const sorted = uniqueSortedDates(dates);
  if (sorted.length === 0) {
    return 0;
  }

  let longest = 1;
  let running = 1;

  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (addDays(previous, 1) === current) {
      running++;
    } else {
      longest = Math.max(longest, running);
      running = 1;
    }
  }

  return Math.max(longest, running);
}

/** Seven-day window ending at `asOf` for dashboard day indicators. */
export function buildLast7Days(
  dates: string[],
  asOf: string
): ConsistencyDay[] {
  const logged = new Set(dates);
  return windowDates(asOf, 7).map((date) => ({
    date,
    logged: logged.has(date),
    weekday: formatWeekday(date),
  }));
}

export interface ConsistencyMetrics {
  adherence7: number;
  adherence28: number;
  asOf: string;
  currentStreak: number;
  last7Days: ConsistencyDay[];
  longestStreak: number;
}

/** Assemble dashboard metrics from raw log dates. */
export function assembleConsistencyMetrics(
  logDates: string[],
  asOf: string
): ConsistencyMetrics {
  return {
    adherence7: logAdherence(logDates, 7, asOf),
    adherence28: logAdherence(logDates, 28, asOf),
    asOf,
    currentStreak: currentStreak(logDates, 1, asOf),
    last7Days: buildLast7Days(logDates, asOf),
    longestStreak: longestStreak(logDates),
  };
}
