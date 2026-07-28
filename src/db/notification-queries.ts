import { eq } from "drizzle-orm";

import type { FitTrackDatabase } from "./index";
import { notificationPreferences } from "./schema";
import type { NotificationPreferencesRow } from "./types";

export type NotificationPreferencesRecord =
  typeof notificationPreferences.$inferSelect;

function toLegacyNotificationPreferencesRow(
  record: NotificationPreferencesRecord
): NotificationPreferencesRow {
  return {
    meal_reminders: record.mealReminders,
    meal_times: record.mealTimes,
    quiet_end: record.quietEnd,
    quiet_start: record.quietStart,
    rest_timer: record.restTimer,
    user_id: record.userId,
    weekly_review: record.weeklyReview,
    weekly_review_day: record.weeklyReviewDay,
    weekly_review_time: record.weeklyReviewTime,
    workout_days: record.workoutDays,
    workout_reminders: record.workoutReminders,
    workout_time: record.workoutTime,
  };
}

export function getNotificationPreferencesRow(
  database: FitTrackDatabase,
  userId: number
): NotificationPreferencesRow | undefined {
  const row = database
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .get();
  return row ? toLegacyNotificationPreferencesRow(row) : undefined;
}

export function upsertNotificationPreferencesRow(
  database: FitTrackDatabase,
  row: NotificationPreferencesRow
): void {
  database
    .insert(notificationPreferences)
    .values({
      mealReminders: row.meal_reminders,
      mealTimes: row.meal_times,
      quietEnd: row.quiet_end,
      quietStart: row.quiet_start,
      restTimer: row.rest_timer,
      userId: row.user_id,
      weeklyReview: row.weekly_review,
      weeklyReviewDay: row.weekly_review_day,
      weeklyReviewTime: row.weekly_review_time,
      workoutDays: row.workout_days,
      workoutReminders: row.workout_reminders,
      workoutTime: row.workout_time,
    })
    .onConflictDoUpdate({
      set: {
        mealReminders: row.meal_reminders,
        mealTimes: row.meal_times,
        quietEnd: row.quiet_end,
        quietStart: row.quiet_start,
        restTimer: row.rest_timer,
        weeklyReview: row.weekly_review,
        weeklyReviewDay: row.weekly_review_day,
        weeklyReviewTime: row.weekly_review_time,
        workoutDays: row.workout_days,
        workoutReminders: row.workout_reminders,
        workoutTime: row.workout_time,
      },
      target: notificationPreferences.userId,
    })
    .run();
}
