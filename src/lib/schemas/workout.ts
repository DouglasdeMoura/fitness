import { z } from "zod";

import {
  isoDateSchema,
  nonNegativeFiniteSchema,
  nonNegativeIntSchema,
  nullableRowIdSchema,
  optionalLimitSchema,
  periodizationTypeSchema,
  positiveIntSchema,
  rowIdSchema,
} from "./common";

const rpeSchema = z.number().finite().min(0).max(10);

export const optionalMuscleGroupQuerySchema = z
  .object({ muscle_group: z.string().min(1).optional() })
  .optional()
  .transform((value) => value ?? {});

export const workoutSessionsQuerySchema = z
  .object({
    date: isoDateSchema.optional(),
    limit: optionalLimitSchema,
  })
  .optional()
  .transform((value) => value ?? {});

export const createWorkoutSessionInputSchema = z.object({
  date: isoDateSchema.optional(),
  name: z.string().optional(),
  program_day_id: rowIdSchema.optional(),
  program_id: rowIdSchema.optional(),
});

export type CreateWorkoutSessionInput = z.infer<
  typeof createWorkoutSessionInputSchema
>;

export const addWorkoutSetInputSchema = z.object({
  exercise_id: rowIdSchema,
  notes: z.string().optional(),
  reps: nonNegativeIntSchema,
  rest_seconds: nonNegativeIntSchema.optional(),
  rpe: rpeSchema.optional(),
  session_id: rowIdSchema,
  set_number: positiveIntSchema,
  weight_kg: nonNegativeFiniteSchema,
});

export type AddWorkoutSetInput = z.infer<typeof addWorkoutSetInputSchema>;

export const finishWorkoutSessionInputSchema = z.object({
  finishedAt: z.string().optional(),
  id: rowIdSchema,
});

export const lastPerformanceQuerySchema = z.object({
  excludeSessionId: nullableRowIdSchema,
  exerciseId: rowIdSchema,
});

export const exerciseIdQuerySchema = z.object({ exerciseId: rowIdSchema });

export const programExerciseInputSchema = z.object({
  exercise_id: rowIdSchema,
  rest_seconds: nonNegativeIntSchema.optional(),
  sort_order: positiveIntSchema,
  target_reps: z.string().min(1),
  target_rpe: rpeSchema,
  target_sets: positiveIntSchema,
});

export type ProgramExerciseInput = z.infer<typeof programExerciseInputSchema>;

export const programDayInputSchema = z.object({
  day_name: z.string().min(1),
  exercises: z.array(programExerciseInputSchema),
  sort_order: positiveIntSchema,
});

export type ProgramDayInput = z.infer<typeof programDayInputSchema>;

export const saveProgramInputSchema = z.object({
  days: z.array(programDayInputSchema).min(1),
  description: z.string().optional(),
  frequency_per_week: positiveIntSchema,
  id: rowIdSchema.optional(),
  is_active: z.boolean().optional(),
  name: z.string().min(1),
  periodization_type: periodizationTypeSchema,
  progression_increment_pct: nonNegativeFiniteSchema.optional(),
});

export type SaveProgramInput = z.infer<typeof saveProgramInputSchema>;

export const programDayTargetsQuerySchema = z.object({
  programDayId: rowIdSchema,
  programId: rowIdSchema,
});

export const workoutSessionImportSchema = z.object({
  created_at: z.string(),
  date: isoDateSchema,
  duration_minutes: nonNegativeIntSchema.nullable(),
  id: rowIdSchema,
  name: z.string().nullable(),
  notes: z.string().nullable(),
  program_day_id: rowIdSchema.nullable(),
  program_id: rowIdSchema.nullable(),
  user_id: rowIdSchema,
});

export const workoutSetImportSchema = z.object({
  created_at: z.string(),
  exercise_id: rowIdSchema,
  id: rowIdSchema,
  notes: z.string().nullable(),
  reps: nonNegativeIntSchema.nullable(),
  rest_seconds: nonNegativeIntSchema.nullable(),
  rpe: rpeSchema,
  session_id: rowIdSchema,
  set_number: positiveIntSchema,
  weight_kg: nonNegativeFiniteSchema.nullable(),
});

export const programImportSchema = z.object({
  created_at: z.string(),
  description: z.string().nullable(),
  frequency_per_week: positiveIntSchema,
  id: rowIdSchema,
  is_active: nonNegativeIntSchema,
  name: z.string().min(1),
  periodization_type: periodizationTypeSchema,
  progression_increment_pct: nonNegativeFiniteSchema,
  user_id: rowIdSchema,
});

export const programDayImportSchema = z.object({
  created_at: z.string(),
  day_name: z.string().min(1),
  id: rowIdSchema,
  program_id: rowIdSchema,
  sort_order: positiveIntSchema,
});

export const programExerciseImportSchema = z.object({
  created_at: z.string(),
  exercise_id: rowIdSchema,
  id: rowIdSchema,
  program_day_id: rowIdSchema,
  rest_seconds: nonNegativeIntSchema.nullable(),
  sort_order: positiveIntSchema,
  target_reps: z.string().nullable(),
  target_rpe: rpeSchema.nullable(),
  target_sets: positiveIntSchema.nullable(),
});

export {
  rowIdInputSchema as deleteWorkoutSetInputSchema,
  rowIdInputSchema as getWorkoutSessionQuerySchema,
  rowIdInputSchema as getWorkoutSessionSummaryQuerySchema,
  rowIdInputSchema as getProgramQuerySchema,
  rowIdInputSchema as deleteProgramInputSchema,
  rowIdInputSchema as setActiveProgramInputSchema,
} from "./common";

export const startWorkoutFromProgramInputSchema = programDayTargetsQuerySchema;
export const getExerciseSetHistoryQuerySchema = exerciseIdQuerySchema;
