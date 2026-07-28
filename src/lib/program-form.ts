// Pure mappers and validators for the training-program editor form
// (src/routes/workout/programs/$programId.tsx).
//
// Keeping these out of the route component lets the route focus on rendering
// and makes the query<->form<->payload translations unit-testable without a
// DOM. Mirrors the split already used by ~/lib/template-form and ~/lib/settings.

import type {
  ProgramDayInput,
  ProgramDetail,
  ProgramExerciseInput,
} from "~/lib/api";
import type { Exercise, PeriodizationType } from "~/lib/db";

/**
 * A program exercise as the form edits it. Extends the persisted input with a
 * `tempId` so React + the Astryx Table have a stable key before the row is
 * saved (saved rows reuse `ex-<id>`).
 */
export type EditableProgramExercise = ProgramExerciseInput & { tempId: string };

/**
 * A training day as the form edits it. Carries `persistedId` (the saved
 * program_day_id) so a day can be started before the form is saved, plus the
 * nested editable exercises.
 */
export type EditableProgramDay = Omit<ProgramDayInput, "exercises"> & {
  tempId: string;
  persistedId?: number;
  exercises: EditableProgramExercise[];
};

export interface ProgramFormValues {
  days: EditableProgramDay[];
  description: string;
  frequency: number;
  incrementPct: number;
  isActive: boolean;
  name: string;
  periodizationType: PeriodizationType;
}

export interface ProgramSavePayload {
  days: ProgramDayInput[];
  description?: string;
  frequency_per_week: number;
  id: number;
  is_active: boolean;
  name: string;
  periodization_type: PeriodizationType;
  progression_increment_pct: number;
}

/** Empty form values used while the program query is still loading. */
export const EMPTY_PROGRAM_FORM: ProgramFormValues = {
  days: [],
  description: "",
  frequency: 3,
  incrementPct: 2.5,
  isActive: false,
  name: "",
  periodizationType: "linear",
};

/** Stable client-only id for unsaved days/exercises. */
export function makeTempId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Maps a program-detail query row into the form's default field values.
 * Saved rows reuse `day-<id>` / `ex-<id>` temp ids so React keys survive
 * refetches; nullable DB columns fall back to sensible defaults.
 * @example programFormDefaults(program)
 */
export function programFormDefaults(program: ProgramDetail): ProgramFormValues {
  return {
    days: program.days.map((day) => ({
      day_name: day.day_name,
      exercises: day.exercises.map((exercise) => ({
        exercise_id: exercise.exercise_id,
        rest_seconds: exercise.rest_seconds ?? 90,
        sort_order: exercise.sort_order,
        target_reps: exercise.target_reps ?? "8-12",
        target_rpe: exercise.target_rpe ?? 8,
        target_sets: exercise.target_sets ?? 3,
        tempId: `ex-${exercise.id}`,
      })),
      persistedId: day.id,
      sort_order: day.sort_order,
      tempId: `day-${day.id}`,
    })),
    description: program.description ?? "",
    frequency: program.frequency_per_week,
    incrementPct: program.progression_increment_pct,
    isActive: Boolean(program.is_active),
    name: program.name,
    periodizationType: program.periodization_type,
  };
}

/**
 * Builds a fresh, unnamed training day. `dayCount` is the current number of
 * days so the label advances "Day A", "Day B", ... (A=65) and the sort order
 * lands at the end of the list.
 */
export function newProgramDay(dayCount: number): EditableProgramDay {
  return {
    day_name: `Day ${String.fromCodePoint(65 + dayCount)}`,
    exercises: [],
    sort_order: dayCount + 1,
    tempId: makeTempId(),
  };
}

/**
 * Maps an exercise catalog row into a new editable prescription.
 * DUP days default to a strength rep zone (5); linear days default to the
 * hypertrophy range (8-12). See ~/lib/workout for the periodization rationale.
 */
export function editableExerciseFromExercise(
  exercise: Exercise,
  periodizationType: PeriodizationType,
  sortOrder: number
): EditableProgramExercise {
  return {
    exercise_id: exercise.id,
    rest_seconds: 90,
    sort_order: sortOrder,
    target_reps: periodizationType === "dup" ? "5" : "8-12",
    target_rpe: 8,
    target_sets: 3,
    tempId: makeTempId(),
  };
}

/**
 * Maps form values into the saveProgram server-fn input. Client-only fields
 * (`tempId`, `persistedId`) are stripped and `sort_order` is re-derived from
 * position so deletions keep a contiguous sequence.
 */
export function buildProgramSavePayload(
  values: ProgramFormValues,
  id: number
): ProgramSavePayload {
  const description = values.description.trim();
  return {
    days: values.days.map((day, dayIndex) => ({
      day_name: day.day_name,
      exercises: day.exercises.map((exercise, exerciseIndex) => ({
        exercise_id: exercise.exercise_id,
        rest_seconds: exercise.rest_seconds,
        sort_order: exerciseIndex + 1,
        target_reps: exercise.target_reps,
        target_rpe: exercise.target_rpe,
        target_sets: exercise.target_sets,
      })),
      sort_order: dayIndex + 1,
    })),
    description: description || undefined,
    frequency_per_week: values.frequency,
    id,
    is_active: values.isActive,
    name: values.name.trim(),
    periodization_type: values.periodizationType,
    progression_increment_pct: values.incrementPct,
  };
}

/**
 * Array validator for the days field. Caps the program at 7 days (a week has
 * seven; frequency_per_week already constrains how many are trained) and
 * rejects blank day names or exercises with no rep target. Returns `undefined`
 * when valid.
 */
export function validateProgramDays(
  days: EditableProgramDay[]
): string | undefined {
  if (days.length > 7) {
    return "A program can have at most 7 training days.";
  }
  for (const day of days) {
    if (!day.day_name.trim()) {
      return "Every training day needs a name.";
    }
    for (const exercise of day.exercises) {
      if (!exercise.target_sets || exercise.target_sets < 1) {
        return `${day.day_name}: every exercise needs at least 1 set.`;
      }
      if (!exercise.target_reps.trim()) {
        return `${day.day_name}: every exercise needs a rep target.`;
      }
    }
  }
}

/** Fields collected on the programs list create card (src/routes/workout/programs/index.tsx). */
export interface CreateProgramFormValues {
  description: string;
  frequency: number;
  name: string;
  periodizationType: PeriodizationType;
}

export const CREATE_PROGRAM_FORM_DEFAULTS: CreateProgramFormValues = {
  description: "",
  frequency: 3,
  name: "",
  periodizationType: "linear",
};

/** Returns an error message when the name is blank; otherwise `undefined`. */
export function validateCreateProgramName(name: string): string | undefined {
  if (!name.trim()) {
    return "Program name is required.";
  }
}

/**
 * Maps the create-program form into a saveProgram payload. Seeds one empty
 * training day so the detail editor can add exercises immediately.
 */
export function buildCreateProgramPayload(
  values: CreateProgramFormValues,
  options: { activateIfFirst: boolean }
): Omit<ProgramSavePayload, "id" | "progression_increment_pct"> {
  return {
    days: [{ day_name: "Day A", exercises: [], sort_order: 1 }],
    description: values.description.trim() || undefined,
    frequency_per_week: values.frequency,
    is_active: options.activateIfFirst,
    name: values.name.trim(),
    periodization_type: values.periodizationType,
  };
}
