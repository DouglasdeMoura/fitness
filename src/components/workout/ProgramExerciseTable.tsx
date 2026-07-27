import {
  Button,
  EmptyState,
  NumberInput,
  Selector,
  Table,
  TextInput,
  proportional,
  type TableColumn,
} from "@astryxdesign/core";
import { ScrollableTable } from "~/components/ScrollableTable";
import type { Exercise } from "~/lib/db";
import type { EditableProgramDay, EditableProgramExercise } from "~/lib/program-form";

// Re-export so existing imports from this module keep working; the canonical
// definitions live in ~/lib/program-form (single source of truth).
export type { EditableProgramDay, EditableProgramExercise } from "~/lib/program-form";

export type UpdateProgramExercise = (
  dayTempId: string,
  exerciseTempId: string,
  patch: Partial<EditableProgramExercise>,
) => void;

export type RemoveProgramExercise = (dayTempId: string, exerciseTempId: string) => void;

type ProgramExerciseTableProps = {
  day: EditableProgramDay;
  exercises: Exercise[];
  updateExercise: UpdateProgramExercise;
  removeExercise: RemoveProgramExercise;
};

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
        title="No exercises assigned"
        description="Add an exercise to set training targets for this day."
        headingLevel={3}
        isCompact
      />
    );
  }
  return (
    <ScrollableTable scrollLabel="program-exercises">
      <Table
      aria-label={`${day.day_name} exercises`}
      columns={programExerciseColumns(day, exercises, updateExercise, removeExercise)}
      data={day.exercises}
      idKey="tempId"
      density="compact"
      hasHover
      />
    </ScrollableTable>
  );
}

function programExerciseColumns(
  day: EditableProgramDay,
  exercises: Exercise[],
  updateExercise: UpdateProgramExercise,
  removeExercise: ProgramExerciseTableProps["removeExercise"],
): TableColumn<EditableProgramExercise>[] {
  const exerciseOptions = exercises.map((exercise) => ({
    value: String(exercise.id),
    label: exercise.name,
  }));
  const exerciseNames = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
  const exerciseRowLabels = new Map(
    day.exercises.map((exercise, index) => [
      exercise.tempId,
      `${exerciseNames.get(exercise.exercise_id) ?? `exercise ${exercise.exercise_id}`}, row ${index + 1} of ${day.day_name}`,
    ]),
  );
  return [
    {
      key: "exercise_id",
      header: "Exercise",
      width: proportional(2),
      renderCell: (exercise) => (
        <Selector
          label={`Exercise selection for ${exerciseRowLabels.get(exercise.tempId)}`}
          isLabelHidden
          value={String(exercise.exercise_id)}
          onChange={(value) =>
            updateExercise(day.tempId, exercise.tempId, {
              exercise_id: Number.parseInt(String(value), 10),
            })
          }
          options={exerciseOptions}
        />
      ),
    },
    {
      key: "target_sets",
      header: "Sets",
      width: proportional(1),
      renderCell: (exercise) => (
        <NumberInput
          label={`Sets for ${exerciseRowLabels.get(exercise.tempId)}`}
          isLabelHidden
          value={exercise.target_sets}
          onChange={(value) =>
            updateExercise(day.tempId, exercise.tempId, { target_sets: value ?? 1 })
          }
          min={1}
          step={1}
          isIntegerOnly
        />
      ),
    },
    {
      key: "target_reps",
      header: "Reps",
      width: proportional(1),
      renderCell: (exercise) => (
        <TextInput
          label={`Reps for ${exerciseRowLabels.get(exercise.tempId)}`}
          isLabelHidden
          value={exercise.target_reps}
          onChange={(value) => updateExercise(day.tempId, exercise.tempId, { target_reps: value })}
        />
      ),
    },
    {
      key: "target_rpe",
      header: "RPE",
      width: proportional(1),
      renderCell: (exercise) => (
        <NumberInput
          label={`RPE for ${exerciseRowLabels.get(exercise.tempId)}`}
          isLabelHidden
          value={exercise.target_rpe}
          onChange={(value) =>
            updateExercise(day.tempId, exercise.tempId, { target_rpe: value ?? 8 })
          }
          min={6}
          max={10}
          step={1}
        />
      ),
    },
    {
      key: "rest_seconds",
      header: "Rest (s)",
      width: proportional(1),
      renderCell: (exercise) => (
        <NumberInput
          label={`Rest seconds for ${exerciseRowLabels.get(exercise.tempId)}`}
          isLabelHidden
          value={exercise.rest_seconds ?? 90}
          onChange={(value) =>
            updateExercise(day.tempId, exercise.tempId, { rest_seconds: value ?? 90 })
          }
          min={30}
          step={15}
          isIntegerOnly
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      renderCell: (exercise) => (
        <Button
          label={`Remove ${exerciseRowLabels.get(exercise.tempId)}`}
          variant="destructive"
          size="sm"
          clickAction={() => removeExercise(day.tempId, exercise.tempId)}
        >
          Remove
        </Button>
      ),
    },
  ];
}
