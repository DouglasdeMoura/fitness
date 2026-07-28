import type { TableColumn } from "@astryxdesign/core";
import {
  Badge,
  Button,
  HStack,
  proportional,
  Table,
  Text,
} from "@astryxdesign/core";

import { GymStepperInput } from "~/components/gym-stepper-input";
import { ScrollableTable } from "~/components/scrollable-table";
import { formatDisplayInteger } from "~/lib/format-number";
import { REPS_STEP, WEIGHT_STEP_KG } from "~/lib/gym-input";
import type { RecordKind } from "~/lib/records";
import { calculateVolume } from "~/lib/workout";

export interface WorkoutSetRow {
  id?: number;
  recordKinds?: RecordKind[];
  reps: number;
  rpe: number;
  weight: number;
}

type WorkoutSetTableRow = Record<string, unknown> &
  WorkoutSetRow & {
    rowIndex: number;
  };

interface WorkoutSetsTableProps {
  exerciseName: string;
  onChangeSet: (index: number, patch: Partial<WorkoutSetRow>) => void;
  onDeleteSet: (index: number) => void;
  onSaveSet: (set: WorkoutSetRow, index: number) => void;
  sets: WorkoutSetRow[];
}

/**
 * Set logger with gym-grade steppers for weight and reps (issue #53).
 */
export function WorkoutSetsTable({
  sets,
  exerciseName,
  onChangeSet,
  onSaveSet,
  onDeleteSet,
}: WorkoutSetsTableProps) {
  const tableRows: WorkoutSetTableRow[] = sets.map((set, rowIndex) => ({
    ...set,
    rowIndex,
  }));
  const columns = workoutSetColumns(
    exerciseName,
    onChangeSet,
    onSaveSet,
    onDeleteSet
  );

  return (
    <ScrollableTable scrollLabel="workout-sets">
      <Table
        aria-label={`${exerciseName} sets`}
        columns={columns}
        data={tableRows}
        density="compact"
        hasHover
        idKey="rowIndex"
      />
    </ScrollableTable>
  );
}

function workoutSetColumns(
  exerciseName: string,
  onChangeSet: WorkoutSetsTableProps["onChangeSet"],
  onSaveSet: WorkoutSetsTableProps["onSaveSet"],
  onDeleteSet: WorkoutSetsTableProps["onDeleteSet"]
): TableColumn<WorkoutSetTableRow>[] {
  return [
    {
      header: "Set",
      key: "set_number",
      renderCell: (row) => (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text hasTabularNumbers>{row.rowIndex + 1}</Text>
          {row.recordKinds && row.recordKinds.length > 0 ? (
            <Badge label="PR" variant="success" />
          ) : null}
        </HStack>
      ),
      width: proportional(1),
    },
    {
      header: "Weight (kg)",
      key: "weight",
      renderCell: (row) => (
        <GymStepperInput
          inputMode="decimal"
          label={`Weight for set ${row.rowIndex + 1} of ${exerciseName}`}
          onChange={(weight) => onChangeSet(row.rowIndex, { weight })}
          step={WEIGHT_STEP_KG}
          units="kg"
          value={row.weight}
        />
      ),
      width: proportional(2),
    },
    {
      header: "Reps",
      key: "reps",
      renderCell: (row) => (
        <GymStepperInput
          inputMode="numeric"
          isIntegerOnly
          label={`Reps for set ${row.rowIndex + 1} of ${exerciseName}`}
          onChange={(reps) => onChangeSet(row.rowIndex, { reps })}
          step={REPS_STEP}
          value={row.reps}
        />
      ),
      width: proportional(2),
    },
    {
      header: "RPE",
      key: "rpe",
      renderCell: (row) => (
        <GymStepperInput
          inputMode="numeric"
          isIntegerOnly
          label={`RPE for set ${row.rowIndex + 1} of ${exerciseName}`}
          max={10}
          min={1}
          onChange={(rpe) => onChangeSet(row.rowIndex, { rpe })}
          step={1}
          value={row.rpe}
        />
      ),
      width: proportional(1),
    },
    {
      header: "Volume",
      key: "volume",
      renderCell: (row) => (
        <Text hasTabularNumbers>
          {formatDisplayInteger(calculateVolume(1, row.reps, row.weight))} kg
        </Text>
      ),
      width: proportional(1),
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: (row) => (
        <HStack gap={2} wrap="wrap">
          <Button
            clickAction={() => onSaveSet(row, row.rowIndex)}
            label={`Save set ${row.rowIndex + 1} of ${exerciseName}`}
            size="lg"
            variant="secondary"
          />
          <Button
            clickAction={() => onDeleteSet(row.rowIndex)}
            label={`Delete set ${row.rowIndex + 1} of ${exerciseName}`}
            size="lg"
            variant="destructive"
          />
        </HStack>
      ),
      width: proportional(2),
    },
  ];
}
