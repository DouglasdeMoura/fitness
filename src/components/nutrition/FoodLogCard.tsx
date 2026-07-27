import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  EmptyState,
  Heading,
  HStack,
Table,
  Text,
  VStack,
  proportional,
  type TableColumn,
} from '@astryxdesign/core'
import { useToast } from '@astryxdesign/core/Toast'
import { ScrollableTable } from '~/components/ScrollableTable'
import { useLogMealTemplate } from '~/components/nutrition/useLogMealTemplate'
import { ToastUndoButton } from '~/components/ToastUndoButton'
import {
  addFoodLogEntry,
  copyMealFromDate,
  deleteFoodLogEntry,
  deleteFoodLogEntries,
  type MealTemplateSummary,
} from '~/lib/api'
import type { FoodLogEntry } from '~/lib/db'
import {
  canCopyMealFromDate,
  entriesForMeal,
  previousDay,
} from '~/lib/food-log-copy'
import { sortTemplatesForMealSection } from '~/lib/meal-template-log'
import { MEAL_TYPE_LABELS, MEAL_TYPES, type MealType } from '~/lib/nutrition'
import { runOrQueue } from '~/lib/offline'
import {
  copyCompletedBody,
  entryDeletedBody,
  mutationFailedBody,
  TOAST_DURATION_MS,
} from '~/lib/toasts'

type DeleteFoodEntry = (entry: FoodLogEntry) => Promise<void>
type CopyMealFromYesterday = (mealType: MealType) => Promise<void>
type FoodLogRow = FoodLogEntry & { food_name?: string | null }

const FOOD_LOG_COLUMNS: TableColumn<FoodLogRow>[] = [
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
 * Displays food entries grouped by meal with copy-from-yesterday shortcuts.
 * @example <FoodLogCard entries={entries} sourceDayEntries={yesterday} selectedDate="2026-07-25" />
 */
export function FoodLogCard({
  entries,
  sourceDayEntries,
  selectedDate,
  mealTemplates,
  onAddMeal,
}: {
  entries: FoodLogRow[]
  sourceDayEntries: FoodLogRow[]
  selectedDate: string
  mealTemplates: MealTemplateSummary[]
  onAddMeal?: () => void
}) {
  const deleteEntry = useDeleteFoodEntry(selectedDate)
  const copyMeal = useCopyMealFromYesterday(selectedDate, sourceDayEntries)
  const showGlobalEmpty =
    entries.length === 0 &&
    !MEAL_TYPES.some((mealType) =>
      canCopyMealFromDate(entries, sourceDayEntries, mealType),
    )

  return (
    <Card>
      <VStack gap={4}>
        <Heading level={2}>Today&apos;s Food Log</Heading>
        {showGlobalEmpty ? (
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
        ) : (
          <VStack gap={4}>
            {MEAL_TYPES.map((mealType) => (
              <MealLogSection
                key={mealType}
                mealType={mealType}
                entries={entriesForMeal(entries, mealType)}
                mealTemplates={mealTemplates}
                selectedDate={selectedDate}
                showCopyAction={canCopyMealFromDate(entries, sourceDayEntries, mealType)}
                onCopy={() => copyMeal(mealType)}
                onDelete={deleteEntry}
              />
            ))}
          </VStack>
        )}
      </VStack>
    </Card>
  )
}

function MealLogSection({
  mealType,
  entries,
  mealTemplates,
  selectedDate,
  showCopyAction,
  onCopy,
  onDelete,
}: {
  mealType: MealType
  entries: FoodLogRow[]
  mealTemplates: MealTemplateSummary[]
  selectedDate: string
  showCopyAction: boolean
  onCopy: () => void
  onDelete: DeleteFoodEntry
}) {
  const mealLabel = MEAL_TYPE_LABELS[mealType]
  const sectionTemplates = sortTemplatesForMealSection(mealTemplates, mealType)
  const logTemplate = useLogMealTemplate(selectedDate)
  const hasTemplateActions = sectionTemplates.length > 0

  if (entries.length === 0 && !showCopyAction && !hasTemplateActions) return null

  return (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={3}>{mealLabel}</Heading>
        {showCopyAction ? (
          <Button
            label={`Copy ${mealLabel.toLowerCase()} from yesterday`}
            variant="secondary"
            size="sm"
            clickAction={onCopy}
          >
            Copy from yesterday
          </Button>
        ) : undefined}
      </HStack>
      {hasTemplateActions ? (
        <VStack gap={1}>
          <Text type="label">Log a saved meal</Text>
          {sectionTemplates.map((template) => (
            <Button
              key={template.id}
              label={`${template.name} — ${Math.round(template.totals.calories)} kcal`}
              variant="ghost"
              clickAction={() =>
                logTemplate({
                  templateId: template.id,
                  mealType,
                  expectedKcal: template.totals.calories,
                })
              }
            />
          ))}
        </VStack>
      ) : undefined}
      {entries.length > 0 ? (
        <ScrollableTable scrollLabel={`food-log-${mealType}`}>
          <Table
            aria-label={`${mealLabel} food log`}
            columns={foodLogColumns(onDelete)}
            data={entries}
            idKey="id"
            density="compact"
            hasHover
          />
        </ScrollableTable>
      ) : undefined}
    </VStack>
  )
}

/** Rebuilds the addFoodLogEntry payload from a deleted row for Undo. */
function foodEntryRestorePayload(entry: FoodLogEntry) {
  return {
    food_id: entry.food_id ?? undefined,
    custom_name: entry.custom_name ?? undefined,
    date: entry.date,
    meal_type: entry.meal_type,
    servings: entry.servings,
    calories: entry.calories,
    protein_g: entry.protein_g,
    carbs_g: entry.carbs_g,
    fat_g: entry.fat_g,
    notes: entry.notes ?? undefined,
  }
}

function useInvalidateFoodLog(selectedDate: string) {
  const queryClient = useQueryClient()
  const sourceDate = previousDay(selectedDate)

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['food-log', selectedDate] }),
      queryClient.invalidateQueries({ queryKey: ['food-log', sourceDate] }),
    ])
  }
}

function useCopyMealFromYesterday(
  selectedDate: string,
  sourceDayEntries: FoodLogRow[],
): CopyMealFromYesterday {
  const toast = useToast()
  const invalidateFoodLog = useInvalidateFoodLog(selectedDate)
  const sourceDate = previousDay(selectedDate)

  return async (mealType) => {
    const payload = { fromDate: sourceDate, toDate: selectedDate, mealType }
    try {
      const outcome = await runOrQueue('copyMealFromDate', payload, () =>
        copyMealFromDate({ data: payload }),
      )
      if (!outcome.queued) {
        await invalidateFoodLog()
        const entryIds = outcome.result.entries.map((entry) => entry.id)
        let dismiss = () => {}
        dismiss = toast({
          body: copyCompletedBody(entryIds.length),
          autoHideDuration: TOAST_DURATION_MS.undo,
          endContent: (
            <ToastUndoButton
              onUndo={async () => {
                dismiss()
                try {
                  await runOrQueue('deleteFoodLogEntries', { ids: entryIds }, () =>
                    deleteFoodLogEntries({ data: { ids: entryIds } }),
                  )
                  await invalidateFoodLog()
                } catch {
                  toast({ body: mutationFailedBody('Undo copy'), type: 'error' })
                }
              }}
            />
          ),
        })
        return
      }
      toast({ body: copyCompletedBody(entriesForMeal(sourceDayEntries, mealType).length) })
    } catch {
      toast({ body: mutationFailedBody('Copy meal'), type: 'error' })
    }
  }
}

function useDeleteFoodEntry(selectedDate: string): DeleteFoodEntry {
  const toast = useToast()
  const invalidateFoodLog = useInvalidateFoodLog(selectedDate)

  return async (entry) => {
    const foodName = foodEntryName(entry)
    if (!window.confirm(`Delete ${foodName} from today's food log?`)) return

    try {
      const outcome = await runOrQueue('deleteFoodLogEntry', { id: entry.id }, () =>
        deleteFoodLogEntry({ data: { id: entry.id } }),
      )
      if (!outcome.queued) {
        await invalidateFoodLog()
      }

      let dismiss = () => {}
      dismiss = toast({
        body: entryDeletedBody(),
        autoHideDuration: TOAST_DURATION_MS.undo,
        endContent: (
          <ToastUndoButton
            onUndo={async () => {
              dismiss()
              try {
                const restore = foodEntryRestorePayload(entry)
                await runOrQueue('addFoodLogEntry', restore, () =>
                  addFoodLogEntry({ data: restore }),
                )
                await invalidateFoodLog()
              } catch {
                toast({ body: mutationFailedBody('Log food'), type: 'error' })
              }
            }}
          />
        ),
      })
    } catch {
      toast({ body: mutationFailedBody('Delete entry'), type: 'error' })
    }
  }
}

function foodEntryName(entry: FoodLogRow): string {
  return entry.custom_name || entry.food_name || `Food #${entry.food_id}`
}

function foodLogColumns(onDelete: DeleteFoodEntry): TableColumn<FoodLogRow>[] {
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
