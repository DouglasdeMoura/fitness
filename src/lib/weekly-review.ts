/**
 * Pure weekly review metrics and headline generation (issue #64 / PRD 11 Batch 2).
 * Self-monitoring consistency predicts outcomes (Burke et al. 2011).
 */
import type { BodyLogRecord } from "../db/user-body-queries";
import { formatDisplayDecimal, formatDisplayInteger } from "./format-number";
import { addDays, getWeekStart } from "./nutrition";
import type { SessionVolumeSet } from "./workout";
import { compareSessionVolumes, computeSessionVolumeStats } from "./workout";

export interface WeekRange {
  end: string;
  start: string;
}

export interface WeekNutritionMetrics {
  avgDailyCalories: number;
  calorieTarget: number;
  logAdherencePct: number;
  loggedDays: number;
  proteinTargetDays: number;
}

export interface WeekTrainingMetrics {
  priorSetCount: number;
  priorTotalVolume: number;
  sessionCount: number;
  setCount: number;
  totalVolume: number;
  volumeDeltaPct: number | null;
  volumeDirection: "more" | "less" | "same" | "first";
}

export interface WeekWeightTrend {
  /** Change in 7-day moving average (kg) from week start to week end. */
  movingAvgDeltaKg: number | null;
}

export interface WeeklyReviewFacts {
  nutrition: WeekNutritionMetrics;
  personalRecordCount: number;
  training: WeekTrainingMetrics;
  week: WeekRange;
  weight: WeekWeightTrend;
}

export type WeeklyReviewPayload = WeeklyReviewFacts & {
  headline: string;
};

export interface DailyNutritionSlice {
  calories: number;
  protein_g: number;
}

export type WeeklyReviewSetRow = SessionVolumeSet & {
  date: string;
};

const WEEK_DAYS = 7;

/** Monday–Sunday week immediately before the week containing `asOf`. */
export function lastCompleteWeekRange(asOf: string): WeekRange {
  const currentWeekStart = getWeekStart(asOf);
  const end = addDays(currentWeekStart, -1);
  return { end, start: getWeekStart(end) };
}

/** Calendar week before `range`. */
export function priorWeekRange(range: WeekRange): WeekRange {
  const end = addDays(range.start, -1);
  return { end, start: getWeekStart(end) };
}

function enumerateWeekDates(range: WeekRange): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset < WEEK_DAYS; offset++) {
    dates.push(addDays(range.start, offset));
  }
  return dates;
}

function filterDatesInRange(dates: string[], range: WeekRange): string[] {
  return dates.filter((date) => date >= range.start && date <= range.end);
}

/**
 * True when the previous calendar week has ended and at least one activity
 * date falls inside it (food, workout, or bodyweight).
 */
export function hasReviewableWeek(
  asOf: string,
  activityDates: string[]
): boolean {
  const range = lastCompleteWeekRange(asOf);
  if (asOf <= range.end) {
    return false;
  }
  return filterDatesInRange(activityDates, range).length > 0;
}

function summarizeNutritionForWeek(
  dailyByDate: Map<string, DailyNutritionSlice>,
  range: WeekRange,
  calorieTarget: number,
  proteinTargetG: number
): WeekNutritionMetrics {
  const foodLogDates = [...dailyByDate.entries()]
    .filter(([, slice]) => slice.calories > 0)
    .map(([date]) => date);
  const loggedDays = filterDatesInRange(foodLogDates, range).length;
  let proteinTargetDays = 0;
  let calorieSum = 0;

  for (const date of enumerateWeekDates(range)) {
    const slice = dailyByDate.get(date);
    if (!slice || slice.calories <= 0) {
      continue;
    }
    calorieSum += slice.calories;
    if (slice.protein_g >= proteinTargetG) {
      proteinTargetDays += 1;
    }
  }

  return {
    avgDailyCalories: loggedDays > 0 ? Math.round(calorieSum / loggedDays) : 0,
    calorieTarget,
    logAdherencePct: Math.round((loggedDays / WEEK_DAYS) * 100),
    loggedDays,
    proteinTargetDays,
  };
}

function summarizeTrainingForWeek(
  sets: WeeklyReviewSetRow[],
  range: WeekRange,
  priorRange: WeekRange,
  sessionDates: string[]
): WeekTrainingMetrics {
  const currentSets = sets.filter(
    (set) => set.date >= range.start && set.date <= range.end
  );
  const priorSets = sets.filter(
    (set) => set.date >= priorRange.start && set.date <= priorRange.end
  );
  const currentStats = computeSessionVolumeStats(currentSets);
  const priorStats = computeSessionVolumeStats(priorSets);
  const comparison = compareSessionVolumes(currentStats, priorStats);
  const sessionCount = new Set(filterDatesInRange(sessionDates, range)).size;

  return {
    priorSetCount: priorStats.setCount,
    priorTotalVolume: priorStats.totalVolume,
    sessionCount,
    setCount: currentStats.setCount,
    totalVolume: currentStats.totalVolume,
    volumeDeltaPct: comparison.percentChange,
    volumeDirection: comparison.direction,
  };
}

function weightByDate(logs: BodyLogRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const log of logs) {
    if (log.weightKg === null) {
      continue;
    }
    map.set(log.date, log.weightKg);
  }
  return map;
}

/**
 * Trailing 7-day simple moving average of bodyweight on `date`.
 * Uses available weigh-ins inside the window (Burke et al. 2011: trend over daily noise).
 */
export function movingAverageWeightKg(
  weightsByDate: Map<string, number>,
  date: string,
  windowDays = 7
): number | null {
  const samples: number[] = [];
  for (let offset = 0; offset < windowDays; offset++) {
    const sampleDate = addDays(date, -offset);
    const weight = weightsByDate.get(sampleDate);
    if (typeof weight === "number") {
      samples.push(weight);
    }
  }
  if (samples.length === 0) {
    return null;
  }
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

/** Delta between 7-day moving averages at week end and week start. */
export function weightMovingAverageDelta(
  logs: BodyLogRecord[],
  range: WeekRange
): WeekWeightTrend {
  const weights = weightByDate(logs);
  const startAvg = movingAverageWeightKg(weights, range.start);
  const endAvg = movingAverageWeightKg(weights, range.end);

  if (startAvg === null || endAvg === null) {
    return { movingAvgDeltaKg: null };
  }

  return { movingAvgDeltaKg: endAvg - startAvg };
}

const POSITIVE_HEADLINE_MARKERS = [
  "great",
  "crushed",
  "amazing",
  "excellent",
  "fantastic",
  "outstanding",
] as const;

/** Detects falsely upbeat copy — weekly review must stay truthful (issue #64). */
export function headlineSoundsFalselyPositive(headline: string): boolean {
  const lower = headline.toLowerCase();
  return POSITIVE_HEADLINE_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Pick the single most notable true fact from the week's numbers.
 * Ordered rules; no model calls (issue #64).
 */
export function generateWeeklyReviewHeadline(facts: WeeklyReviewFacts): string {
  const { nutrition, training, personalRecordCount } = facts;
  const proteinDays = nutrition.proteinTargetDays;
  const volumePct = training.volumeDeltaPct;
  const volumeUp =
    training.volumeDirection === "more" && volumePct !== null && volumePct >= 8;
  const hasActivity =
    nutrition.loggedDays > 0 ||
    training.sessionCount > 0 ||
    personalRecordCount > 0;

  if (!hasActivity) {
    return "No food or workouts logged this week.";
  }

  if (proteinDays >= 6 && volumeUp) {
    return `You hit your protein target ${proteinDays} of 7 days and added ${volumePct}% training volume.`;
  }

  if (proteinDays >= 6) {
    return `You hit your protein target ${proteinDays} of 7 days.`;
  }

  if (volumeUp) {
    return `You added ${volumePct}% training volume versus last week.`;
  }

  if (personalRecordCount > 0) {
    const label =
      personalRecordCount === 1 ? "personal record" : "personal records";
    return `You hit ${personalRecordCount} ${label} this week.`;
  }

  if (nutrition.logAdherencePct >= 86) {
    return `You logged food on ${nutrition.loggedDays} of 7 days.`;
  }

  if (training.sessionCount > 0 && training.sessionCount <= 3) {
    const sessionLabel = training.sessionCount === 1 ? "session" : "sessions";
    return `A lighter week — ${training.sessionCount} ${sessionLabel} logged.`;
  }

  if (nutrition.loggedDays === 0 && training.sessionCount === 0) {
    return "No food or workouts logged this week.";
  }

  return `Food logged on ${nutrition.loggedDays} of 7 days with ${training.sessionCount} workouts.`;
}

export function assembleWeeklyReview(input: {
  asOf: string;
  calorieTarget: number;
  proteinTargetG: number;
  dailyNutrition: Map<string, DailyNutritionSlice>;
  workoutSets: WeeklyReviewSetRow[];
  sessionDates: string[];
  bodyLogs: BodyLogRecord[];
  personalRecordCount: number;
}): WeeklyReviewPayload | null {
  const week = lastCompleteWeekRange(input.asOf);
  const foodDates = [...input.dailyNutrition.entries()]
    .filter(([, slice]) => slice.calories > 0)
    .map(([date]) => date);
  const activityDates = [
    ...foodDates,
    ...input.sessionDates,
    ...input.bodyLogs
      .filter((log) => log.weightKg !== null)
      .map((log) => log.date),
  ];

  if (!hasReviewableWeek(input.asOf, activityDates)) {
    return null;
  }

  const prior = priorWeekRange(week);
  const nutrition = summarizeNutritionForWeek(
    input.dailyNutrition,
    week,
    input.calorieTarget,
    input.proteinTargetG
  );
  const training = summarizeTrainingForWeek(
    input.workoutSets,
    week,
    prior,
    input.sessionDates
  );
  const weight = weightMovingAverageDelta(input.bodyLogs, week);
  const facts: WeeklyReviewFacts = {
    nutrition,
    personalRecordCount: input.personalRecordCount,
    training,
    week,
    weight,
  };

  return {
    ...facts,
    headline: generateWeeklyReviewHeadline(facts),
  };
}

/** Format signed weight delta for display. */
export function formatWeightTrendDelta(deltaKg: number | null): string {
  if (deltaKg === null) {
    return "—";
  }
  const sign = deltaKg > 0 ? "+" : "";
  return `${sign}${formatDisplayDecimal(deltaKg)} kg`;
}

/** Format volume week-over-week change for display. */
export function formatVolumeWeekDelta(
  direction: WeekTrainingMetrics["volumeDirection"],
  percent: number | null
): string {
  if (direction === "first" || percent === null) {
    return "First week with logged sets";
  }
  if (direction === "same") {
    return "Same volume as prior week";
  }
  return `${percent}% ${direction} than prior week`;
}

/** Format average calories versus target for display. */
export function formatCalorieAverageVersusTarget(
  avgCalories: number,
  target: number
): string {
  if (target <= 0) {
    return `${formatDisplayInteger(avgCalories)} kcal avg`;
  }
  const delta = avgCalories - target;
  const sign = delta > 0 ? "+" : "";
  return `${formatDisplayInteger(avgCalories)} kcal avg (${sign}${formatDisplayInteger(delta)} vs target)`;
}
