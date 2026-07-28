import { z } from "zod";

import {
  isoDateSchema,
  isoTimeSchema,
  nonNegativeFiniteSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  rowIdSchema,
} from "./common";
import {
  addFoodLogEntryInputSchema,
  copyDayFromDateInputSchema,
  copyMealFromDateInputSchema,
  foodLogEntryImportSchema,
  logMealTemplateInputSchema,
} from "./nutrition";
import {
  createWorkoutSessionInputSchema,
  programDayImportSchema,
  programExerciseImportSchema,
  programImportSchema,
  workoutSessionImportSchema,
  workoutSetImportSchema,
} from "./workout";

export const activityLevelSchema = z.enum([
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);

export const goalTypeSchema = z.enum([
  "lose_fat",
  "build_muscle",
  "maintain",
  "recomp",
]);

export const sexSchema = z.enum(["male", "female", "other"]);

export const userProfileUpdateSchema = z.object({
  activityLevel: activityLevelSchema.optional(),
  birthDate: isoDateSchema.nullable().optional(),
  email: z.string().email().nullable().optional(),
  goalType: goalTypeSchema.optional(),
  heightCm: nonNegativeFiniteSchema.nullable().optional(),
  name: z.string().min(1).optional(),
  sex: sexSchema.optional(),
});

export type UserProfileUpdate = z.infer<typeof userProfileUpdateSchema>;

export const logBodyweightInputSchema = z.object({
  body_fat_pct: nonNegativeFiniteSchema.optional(),
  date: isoDateSchema.optional(),
  notes: z.string().optional(),
  weight_kg: nonNegativeFiniteSchema,
});

export type LogBodyweightInput = z.infer<typeof logBodyweightInputSchema>;

export const bodyLogImportSchema = z.object({
  bodyFatPct: nonNegativeFiniteSchema.nullable(),
  createdAt: z.string(),
  date: isoDateSchema,
  id: rowIdSchema,
  muscleMassKg: nonNegativeFiniteSchema.nullable(),
  notes: z.string().nullable(),
  userId: rowIdSchema,
  waistCm: nonNegativeFiniteSchema.nullable(),
  weightKg: nonNegativeFiniteSchema.nullable(),
});

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const unsubscribePushInputSchema = z.object({
  endpoint: z.string().url(),
});

export const notificationTypeSchema = z.enum([
  "rest_timer",
  "meal_reminder",
  "workout_reminder",
  "weekly_review",
]);

export const notificationPreferencesSchema = z.object({
  meal_reminders: z.boolean(),
  meal_times: z.array(isoTimeSchema),
  quiet_end: isoTimeSchema.nullable(),
  quiet_start: isoTimeSchema.nullable(),
  rest_timer: z.boolean(),
  weekly_review: z.boolean(),
  weekly_review_day: nonNegativeIntSchema.nullable(),
  weekly_review_time: isoTimeSchema.nullable(),
  workout_days: z.array(nonNegativeIntSchema),
  workout_reminders: z.boolean(),
  workout_time: isoTimeSchema.nullable(),
});

export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;

export const updateNotificationPreferencesSchema =
  notificationPreferencesSchema.partial();

export type NotificationPreferencesUpdate = z.infer<
  typeof updateNotificationPreferencesSchema
>;

const queuedMutationBaseSchema = z.object({
  attempts: nonNegativeIntSchema,
  client_id: z.string().min(1),
  last_error: z.string().optional(),
  queued_at: z.string().min(1),
});

const syncAddFoodPayloadSchema = z.object({
  barcode: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  calories_per_serving: nonNegativeFiniteSchema,
  carbs_g: nonNegativeFiniteSchema,
  fat_g: nonNegativeFiniteSchema,
  fiber_g: nonNegativeFiniteSchema.optional(),
  name: z.string().min(1),
  protein_g: nonNegativeFiniteSchema,
  serving_size: nonNegativeFiniteSchema,
  serving_unit: z.string().min(1),
  sodium_mg: nonNegativeFiniteSchema.optional(),
  sugar_g: nonNegativeFiniteSchema.optional(),
});

const syncAddFoodMutationSchema = queuedMutationBaseSchema.extend({
  kind: z.literal("addFood"),
  payload: syncAddFoodPayloadSchema,
});

const syncAddFoodLogEntryMutationSchema = queuedMutationBaseSchema.extend({
  kind: z.literal("addFoodLogEntry"),
  payload: addFoodLogEntryInputSchema,
});

const syncAddWorkoutSetPayloadSchema = z
  .object({
    exercise_id: rowIdSchema,
    notes: z.string().optional(),
    reps: nonNegativeIntSchema,
    rest_seconds: nonNegativeIntSchema.optional(),
    rpe: z.number().finite().min(0).max(10).optional(),
    session_id: rowIdSchema.optional(),
    session_temp_ref: z.string().min(1).optional(),
    set_number: positiveIntSchema,
    weight_kg: nonNegativeFiniteSchema,
  })
  .refine(
    (payload) =>
      payload.session_id !== undefined ||
      payload.session_temp_ref !== undefined,
    "session_id or session_temp_ref is required"
  );

const syncAddWorkoutSetMutationSchema = queuedMutationBaseSchema.extend({
  kind: z.literal("addWorkoutSet"),
  payload: syncAddWorkoutSetPayloadSchema,
});

const syncCopyDayMutationSchema = queuedMutationBaseSchema.extend({
  kind: z.literal("copyDayFromDate"),
  payload: copyDayFromDateInputSchema,
});

const syncCopyMealMutationSchema = queuedMutationBaseSchema.extend({
  kind: z.literal("copyMealFromDate"),
  payload: copyMealFromDateInputSchema,
});

const syncCreateWorkoutSessionMutationSchema = queuedMutationBaseSchema.extend({
  kind: z.literal("createWorkoutSession"),
  payload: createWorkoutSessionInputSchema.extend({
    temp_ref: z.string().min(1),
  }),
});

const syncDeleteFoodLogEntriesMutationSchema = queuedMutationBaseSchema.extend({
  kind: z.literal("deleteFoodLogEntries"),
  payload: z.object({ ids: z.array(rowIdSchema).min(1) }),
});

const syncDeleteFoodLogEntryMutationSchema = queuedMutationBaseSchema.extend({
  kind: z.literal("deleteFoodLogEntry"),
  payload: z.object({ id: rowIdSchema }),
});

const syncLogBodyweightMutationSchema = queuedMutationBaseSchema.extend({
  kind: z.literal("logBodyweight"),
  payload: logBodyweightInputSchema,
});

const syncLogMealTemplateMutationSchema = queuedMutationBaseSchema.extend({
  kind: z.literal("logMealTemplate"),
  payload: logMealTemplateInputSchema,
});

export const queuedMutationSchema = z.discriminatedUnion("kind", [
  syncAddFoodMutationSchema,
  syncAddFoodLogEntryMutationSchema,
  syncAddWorkoutSetMutationSchema,
  syncCopyDayMutationSchema,
  syncCopyMealMutationSchema,
  syncCreateWorkoutSessionMutationSchema,
  syncDeleteFoodLogEntriesMutationSchema,
  syncDeleteFoodLogEntryMutationSchema,
  syncLogBodyweightMutationSchema,
  syncLogMealTemplateMutationSchema,
]);

export type QueuedMutation = z.infer<typeof queuedMutationSchema>;

export const syncQueuedMutationsInputSchema = z.object({
  mutations: z.array(queuedMutationSchema),
});

export const getSyncedClientIdsInputSchema = z.object({
  client_ids: z.array(z.string().min(1)),
});

export const importDataInputSchema = z.object({
  body_logs: z.array(bodyLogImportSchema).optional(),
  food_log: z.array(foodLogEntryImportSchema).optional(),
  program_days: z.array(programDayImportSchema).optional(),
  program_exercises: z.array(programExerciseImportSchema).optional(),
  programs: z.array(programImportSchema).optional(),
  workout_sets: z.array(workoutSetImportSchema).optional(),
  workouts: z.array(workoutSessionImportSchema).optional(),
});

export type ImportDataInput = z.infer<typeof importDataInputSchema>;

export {
  optionalAsOfQuerySchema as getConsistencyQuerySchema,
  optionalAsOfQuerySchema as getWeeklyReviewAvailabilityQuerySchema,
  optionalAsOfQuerySchema as getWeeklyReviewQuerySchema,
  optionalLimitQuerySchema as getBodyLogsQuerySchema,
} from "./common";
