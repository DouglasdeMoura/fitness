import {
  Button,
  HStack,
  Table,
  Text,
  proportional,
  type TableColumn,
} from '@astryxdesign/core'
import { GymStepperInput } from '~/components/GymStepperInput'
import { ScrollableTable } from '~/components/ScrollableTable'
import { REPS_STEP, WEIGHT_STEP_KG } from '~/lib/gym-input'
import { calculateVolume } from '~/lib/workout'

export type WorkoutSetRow = {
  reps: number
  weight: number
  rpe: number
  id?: number
}

type WorkoutSetTableRow = WorkoutSetRow & {
  rowIndex: number
}

type WorkoutSetsTableProps = {
  sets: WorkoutSetRow[]
  exerciseName: string
  onChangeSet: (index: number, patch: Partial<WorkoutSetRow>) => void
  onSaveSet: (set: WorkoutSetRow, index: number) => void
  onDeleteSet: (index: number) => void
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
  }))
  const columns = workoutSetColumns(exerciseName, onChangeSet, onSaveSet, onDeleteSet)

  return (
    <ScrollableTable scrollLabel="workout-sets">
      <Table
        aria-label={`${exerciseName} sets`}
        columns={columns}
        data={tableRows}
        idKey="rowIndex"
        density="compact"
        hasHover
      />
    </ScrollableTable>
  )
}

function workoutSetColumns(
  exerciseName: string,
  onChangeSet: WorkoutSetsTableProps['onChangeSet'],
  onSaveSet: WorkoutSetsTableProps['onSaveSet'],
  onDeleteSet: WorkoutSetsTableProps['onDeleteSet'],
): TableColumn<WorkoutSetTableRow>[] {
  return [
    {
      key: 'set_number',
      header: 'Set',
      width: proportional(1),
      renderCell: (row) => <Text hasTabularNumbers>{row.rowIndex + 1}</Text>,
    },
    {
      key: 'weight',
      header: 'Weight (kg)',
      width: proportional(2),
      renderCell: (row) => (
        <GymStepperInput
          label={`Weight for set ${row.rowIndex + 1} of ${exerciseName}`}
          value={row.weight}
          onChange={(weight) => onChangeSet(row.rowIndex, { weight })}
          step={WEIGHT_STEP_KG}
          inputMode="decimal"
          units="kg"
        />
      ),
    },
    {
      key: 'reps',
      header: 'Reps',
      width: proportional(2),
      renderCell: (row) => (
        <GymStepperInput
          label={`Reps for set ${row.rowIndex + 1} of ${exerciseName}`}
          value={row.reps}
          onChange={(reps) => onChangeSet(row.rowIndex, { reps })}
          step={REPS_STEP}
          inputMode="numeric"
          isIntegerOnly
        />
      ),
    },
    {
      key: 'rpe',
      header: 'RPE',
      width: proportional(1),
      renderCell: (row) => (
        <GymStepperInput
          label={`RPE for set ${row.rowIndex + 1} of ${exerciseName}`}
          value={row.rpe}
          onChange={(rpe) => onChangeSet(row.rowIndex, { rpe })}
          step={1}
          inputMode="numeric"
          min={1}
          max={10}
          isIntegerOnly
        />
      ),
    },
    {
      key: 'volume',
      header: 'Volume',
      width: proportional(1),
      renderCell: (row) => (
        <Text hasTabularNumbers>{Math.round(calculateVolume(1, row.reps, row.weight))} kg</Text>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: proportional(2),
      renderCell: (row) => (
        <HStack gap={2} wrap="wrap">
          <Button
            label={`Save set ${row.rowIndex + 1} of ${exerciseName}`}
            variant="secondary"
            size="lg"
            clickAction={() => onSaveSet(row, row.rowIndex)}
          />
          <Button
            label={`Delete set ${row.rowIndex + 1} of ${exerciseName}`}
            variant="destructive"
            size="lg"
            clickAction={() => onDeleteSet(row.rowIndex)}
          />
        </HStack>
      ),
    },
  ]
}
