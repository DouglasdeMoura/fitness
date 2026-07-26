import { useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  Table,
  Text,
  VStack,
  proportional,
  type TableColumn,
} from '@astryxdesign/core'
import { deleteFoodLogEntry } from '~/lib/api'
import type { FoodLogEntry } from '~/lib/db'
import { MEAL_TYPE_LABELS } from '~/lib/nutrition'
import { runOrQueue } from '~/lib/offline'

type DeleteFoodEntry = (entry: FoodLogEntry) => Promise<void>

const FOOD_LOG_COLUMNS: TableColumn<FoodLogEntry>[] = [
  {
    key: 'meal_type',
    header: 'Meal',
    width: proportional(1),
    renderCell: (entry) => (
      <Badge label={MEAL_TYPE_LABELS[entry.meal_type]} variant="neutral" />
    ),
  },
  {
    key: 'custom_name',
    header: 'Food',
    width: proportional(2),
    renderCell: foodEntryName,
  },
  {
    key: 'calories',
    header: 'Calories',
    align: 'end',
    width: proportional(1),
    renderCell: (entry) => (
      <Text hasTabularNumbers>{Math.round(entry.calories)}</Text>
    ),
  },
  {
    key: 'macros',
    header: 'P / C / F',
    width: proportional(1),
    renderCell: (entry) => (
      <Text type="supporting" hasTabularNumbers>
        {Math.round(entry.protein_g)} / {Math.round(entry.carbs_g)} /{' '}
        {Math.round(entry.fat_g)} g
      </Text>
    ),
  },
]

/**
 * Displays today's persisted food entries or guidance for the first entry.
 * @example <FoodLogCard entries={entries} selectedDate="2026-07-25" onAddMeal={focusSearch} />
 */
export function FoodLogCard({
  entries,
  selectedDate,
  onAddMeal,
}: {
  entries: FoodLogEntry[]
  selectedDate: string
  onAddMeal?: () => void
}) {
  const deleteEntry = useDeleteFoodEntry(selectedDate)
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>Today&apos;s Food Log</Heading>
        <FoodLogContent entries={entries} onDelete={deleteEntry} onAddMeal={onAddMeal} />
      </VStack>
    </Card>
  )
}

function FoodLogContent({
  entries,
  onDelete,
  onAddMeal,
}: {
  entries: FoodLogEntry[]
  onDelete: DeleteFoodEntry
  onAddMeal?: () => void
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<span aria-hidden>🍽️</span>}
        title="No food logged yet"
        description="Search above to add your first meal today."
        actions={
          onAddMeal ? (
            <Button label="Add your first meal" variant="primary" clickAction={onAddMeal} />
          ) : undefined
        }
        headingLevel={3}
        isCompact
      />
    )
  }
  return (
    <Table
      aria-label="Today's food log"
      columns={foodLogColumns(onDelete)}
      data={entries}
      idKey="id"
      density="compact"
      hasHover
    />
  )
}

function useDeleteFoodEntry(selectedDate: string): DeleteFoodEntry {
  const queryClient = useQueryClient()
  return async (entry) => {
    const foodName = foodEntryName(entry)
    if (!window.confirm(`Delete ${foodName} from today's food log?`)) return
    const outcome = await runOrQueue('deleteFoodLogEntry', { id: entry.id }, () =>
      deleteFoodLogEntry({ data: { id: entry.id } }),
    )
    if (!outcome.queued) {
      await queryClient.invalidateQueries({ queryKey: ['food-log', selectedDate] })
    }
  }
}

function foodEntryName(entry: FoodLogEntry): string {
  return entry.custom_name || `Food #${entry.food_id}`
}

function foodLogColumns(onDelete: DeleteFoodEntry): TableColumn<FoodLogEntry>[] {
  return [
    ...FOOD_LOG_COLUMNS,
    {
      key: 'actions',
      header: 'Actions',
      align: 'end',
      renderCell: (entry) => (
        <Button
          label={`Delete ${foodEntryName(entry)}`}
          variant="destructive"
          size="sm"
          clickAction={() => onDelete(entry)}
        >
          Delete
        </Button>
      ),
    },
  ]
}
