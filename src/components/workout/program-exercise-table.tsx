import type { TableColumn } from "@astryxdesign/core";
import {
  Button,
  EmptyState,
  NumberInput,
  proportional,
  Selector,
  Table,
  TextInput,
} from "@astryxdesign/core";

import { ScrollableTable } from "~/components/scrollable-table";
import type { Exercise } from "~/db/types";
import type {
  EditableProgramDay,
  EditableProgramExercise,
} from "~/lib/program-form";

// Re-export so existing imports from this module keep working; the canonical
// definitions live in ~/lib/program-form (single source of truth).
export type {
  EditableProgramDay,
  EditableProgramExercise,
} from "~/lib/program-form";

type ProgramExerciseTableRow = EditableProgramExercise &
  Record<string, unknown>;

export type UpdateProgramExercise = (
  dayTempId: string,
  exerciseTempId: string,
  patch: Partial<EditableProgramExercise>
) => void;

export type RemoveProgramExercise = (
  dayTempId: string,
  exerciseTempId: string
) => void;

interface ProgramExerciseTableProps {
  day: EditableProgramDay;
  exercises: Exercise[];
  removeExercise: RemoveProgramExercise;
  updateExercise: UpdateProgramExercise;
}

/**
 * Edits the exercise prescriptions assigned to one training day.
 * @example <ProgramExerciseTable day={day} exercises={exercises} updateExercise={update} removeExercise={remove} />
 */
export function ProgramExerciseTable({
  day,
  exercises,
  updateExercise,
  removeExercise,
}: ProgramExerciseTableProps) {
  if (day.exercises.length === 0) {
    return (
      <EmptyState
        description="Add an exercise to set training targets for this day."
        headingLevel={3}
        isCompact
        title="No exercises assigned"
      />
    );
  }
  return (
    <ScrollableTable scrollLabel="program-exercises">
      <Table
        aria-label={`${day.day_name} exercises`}
        columns={programExerciseColumns(
          day,
          exercises,
          updateExercise,
          removeExercise
        )}
        data={day.exercises as ProgramExerciseTableRow[]}
        density="compact"
        hasHover
        idKey="tempId"
      />
    </ScrollableTable>
  );
}

function programExerciseColumns(
  day: EditableProgramDay,
  exercises: Exercise[],
  updateExercise: UpdateProgramExercise,
  removeExercise: ProgramExerciseTableProps["removeExercise"]
): TableColumn<ProgramExerciseTableRow>[] {
  const exerciseOptions = exercises.map((exercise) => ({
    label: exercise.name,
    value: String(exercise.id),
  }));
  const exerciseNames = new Map(
    exercises.map((exercise) => [exercise.id, exercise.name])
  );
  const exerciseRowLabels = new Map(
    day.exercises.map((exercise, index) => [
      exercise.tempId,
      `${exerciseNames.get(exercise.exercise_id) ?? `exercise ${exercise.exercise_id}`}, row ${index + 1} of ${day.day_name}`,
    ])
  );
  return [
    {
      header: "Exercise",
      key: "exercise_id",
      renderCell: (exercise) => (
        <Selector
          isLabelHidden
          label={`Exercise selection for ${exerciseRowLabels.get(exercise.tempId)}`}
          onChange={(value) =>
            updateExercise(day.tempId, exercise.tempId, {
              exercise_id: Number.parseInt(String(value), 10),
            })
          }
          options={exerciseOptions}
          value={String(exercise.exercise_id)}
        />
      ),
      width: proportional(2),
    },
    {
      header: "Sets",
      key: "target_sets",
      renderCell: (exercise) => (
        <NumberInput
          isIntegerOnly
          isLabelHidden
          label={`Sets for ${exerciseRowLabels.get(exercise.tempId)}`}
          min={1}
          onChange={(value) =>
            updateExercise(day.tempId, exercise.tempId, {
              target_sets: value ?? 1,
            })
          }
          step={1}
          value={exercise.target_sets}
        />
      ),
      width: proportional(1),
    },
    {
      header: "Reps",
      key: "target_reps",
      renderCell: (exercise) => (
        <TextInput
          isLabelHidden
          label={`Reps for ${exerciseRowLabels.get(exercise.tempId)}`}
          onChange={(value) =>
            updateExercise(day.tempId, exercise.tempId, { target_reps: value })
          }
          value={exercise.target_reps}
        />
      ),
      width: proportional(1),
    },
    {
      header: "RPE",
      key: "target_rpe",
      renderCell: (exercise) => (
        <NumberInput
          isLabelHidden
          label={`RPE for ${exerciseRowLabels.get(exercise.tempId)}`}
          max={10}
          min={6}
          onChange={(value) =>
            updateExercise(day.tempId, exercise.tempId, {
              target_rpe: value ?? 8,
            })
          }
          step={1}
          value={exercise.target_rpe}
        />
      ),
      width: proportional(1),
    },
    {
      header: "Rest (s)",
      key: "rest_seconds",
      renderCell: (exercise) => (
        <NumberInput
          isIntegerOnly
          isLabelHidden
          label={`Rest seconds for ${exerciseRowLabels.get(exercise.tempId)}`}
          min={30}
          onChange={(value) =>
            updateExercise(day.tempId, exercise.tempId, {
              rest_seconds: value ?? 90,
            })
          }
          step={15}
          value={exercise.rest_seconds ?? 90}
        />
      ),
      width: proportional(1),
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: (exercise) => (
        <Button
          clickAction={() => removeExercise(day.tempId, exercise.tempId)}
          label={`Remove ${exerciseRowLabels.get(exercise.tempId)}`}
          size="sm"
          variant="destructive"
        >
          Remove
        </Button>
      ),
    },
  ];
}
