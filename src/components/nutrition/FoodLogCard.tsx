import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogHeader,
  FormLayout,
  Grid,
  Heading,
  HStack,
  NumberInput,
  Table,
  Text,
  TextInput,
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
import {
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  buildQuickAddDraft,
  isApproximateFoodLogEntry,
  type MealType,
  type QuickAddInput,
} from '~/lib/nutrition'
import { runOrQueue } from '~/lib/offline'
import {
  copyCompletedBody,
  entryDeletedBody,
  foodLoggedBody,
  mutationFailedBody,
  TOAST_DURATION_MS,
} from '~/lib/toasts'

type DeleteFoodEntry = (entry: FoodLogEntry) => Promise<void>
type CopyMealFromYesterday = (mealType: MealType) => Promise<void>
type FoodLogRow = FoodLogEntry & { food_name?: string | null }

/**
 * Displays food entries grouped by meal with copy-from-yesterday shortcuts.
 * @example <FoodLogCard entries={entries} sourceDayEntries={yesterday} selectedDate="2026-07-25" />
 */
export function FoodLogCard({
  entries,
  sourceDayEntries,
  selectedDate,
  mealTemplates,
}: {
  entries: FoodLogRow[]
  sourceDayEntries: FoodLogRow[]
  selectedDate: string
  mealTemplates: MealTemplateSummary[]
  onAddMeal?: () => void
}) {
  const deleteEntry = useDeleteFoodEntry(selectedDate)
  const copyMeal = useCopyMealFromYesterday(selectedDate, sourceDayEntries)

  return (
    <Card>
      <VStack gap={4}>
        <Heading level={2}>Today&apos;s Food Log</Heading>
        {entries.length === 0 ? (
          <Text type="supporting">
            No food logged yet. Search above or quick add an approximate entry per meal.
          </Text>
        ) : undefined}
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
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const mealLabel = MEAL_TYPE_LABELS[mealType]
  const sectionTemplates = sortTemplatesForMealSection(mealTemplates, mealType)
  const logTemplate = useLogMealTemplate(selectedDate)
  const logQuickAdd = useQuickAddFood(selectedDate, mealType)
  const hasTemplateActions = sectionTemplates.length > 0

  return (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={3}>{mealLabel}</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            label={`Quick add to ${mealLabel.toLowerCase()}`}
            variant="secondary"
            size="lg"
            clickAction={() => setQuickAddOpen(true)}
          >
            Quick add
          </Button>
          {showCopyAction ? (
            <Button
              label={`Copy ${mealLabel.toLowerCase()} from yesterday`}
              variant="secondary"
              size="lg"
              clickAction={onCopy}
            >
              Copy from yesterday
            </Button>
          ) : undefined}
        </HStack>
      </HStack>
      {hasTemplateActions ? (
        <VStack gap={1}>
          <Text type="label">Log a saved meal</Text>
          {sectionTemplates.map((template) => (
            <Button
              key={template.id}
              label={`${template.name} — ${Math.round(template.totals.calories)} kcal`}
              variant="ghost"
              size="lg"
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
      {quickAddOpen ? (
        <QuickAddDialog
          mealLabel={mealLabel}
          isOpen={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          onSubmit={logQuickAdd}
        />
      ) : undefined}
    </VStack>
  )
}

function QuickAddDialog({
  mealLabel,
  isOpen,
  onOpenChange,
  onSubmit,
}: {
  mealLabel: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: QuickAddInput) => Promise<void>
}) {
  const form = useForm({
    defaultValues: {
      name: '',
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    },
    onSubmit: async ({ value, formApi }) => {
      if (!value.calories || value.calories <= 0) return
      await onSubmit({
        name: value.name,
        calories: value.calories,
        protein_g: value.protein_g > 0 ? value.protein_g : undefined,
        carbs_g: value.carbs_g > 0 ? value.carbs_g : undefined,
        fat_g: value.fat_g > 0 ? value.fat_g : undefined,
      })
      formApi.reset()
      onOpenChange(false)
    },
  })

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={360}>
      <DialogHeader
        title={`Quick add — ${mealLabel}`}
        subtitle="Approximate calories still count toward your daily total."
        onOpenChange={onOpenChange}
      />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <VStack gap={3}>
          <FormLayout>
            <form.Field name="name">
              {(field) => (
                <TextInput
                  label="Name"
                  value={field.state.value}
                  onChange={field.handleChange}
                  placeholder="e.g. Office lunch"
                  isOptional
                />
              )}
            </form.Field>
            <form.Field name="calories">
              {(field) => (
                <NumberInput
                  label="Calories"
                  value={field.state.value}
                  onChange={field.handleChange}
                  min={1}
                  isRequired
                />
              )}
            </form.Field>
            <Grid columns={{ minWidth: 120 }} gap={2}>
              <form.Field name="protein_g">
                {(field) => (
                  <NumberInput
                    label="Protein (g)"
                    value={field.state.value}
                    onChange={field.handleChange}
                    min={0}
                    isOptional
                  />
                )}
              </form.Field>
              <form.Field name="carbs_g">
                {(field) => (
                  <NumberInput
                    label="Carbs (g)"
                    value={field.state.value}
                    onChange={field.handleChange}
                    min={0}
                    isOptional
                  />
                )}
              </form.Field>
              <form.Field name="fat_g">
                {(field) => (
                  <NumberInput
                    label="Fat (g)"
                    value={field.state.value}
                    onChange={field.handleChange}
                    min={0}
                    isOptional
                  />
                )}
              </form.Field>
            </Grid>
          </FormLayout>
          <HStack gap={2} hAlign="end" wrap="wrap">
            <Button
              label="Cancel quick add"
              variant="secondary"
              size="lg"
              clickAction={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button label="Log quick add" variant="primary" size="lg" type="submit" />
          </HStack>
        </VStack>
      </form>
    </Dialog>
  )
}

function useQuickAddFood(selectedDate: string, mealType: MealType) {
  const queryClient = useQueryClient()
  const toast = useToast()

  return async (input: QuickAddInput) => {
    const entry = buildQuickAddDraft(input, selectedDate, mealType)
    try {
      const outcome = await runOrQueue('addFoodLogEntry', entry, () =>
        addFoodLogEntry({ data: entry }),
      )
      toast({ body: foodLoggedBody() })
      if (!outcome.queued) {
        await queryClient.invalidateQueries({ queryKey: ['food-log', selectedDate] })
      }
    } catch {
      toast({ body: mutationFailedBody('Log food'), type: 'error' })
      throw new Error('quick add failed')
    }
  }
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

function foodEntryLabel(entry: FoodLogRow) {
  return (
    <HStack gap={1} vAlign="center">
      <Text>{foodEntryName(entry)}</Text>
      {isApproximateFoodLogEntry(entry) ? (
        <Badge variant="warning" label="Approximate" />
      ) : undefined}
    </HStack>
  )
}

const FOOD_LOG_COLUMNS: TableColumn<FoodLogRow>[] = [
  {
    key: 'custom_name',
    header: 'Food',
    width: proportional(2),
    renderCell: foodEntryLabel,
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
          size="lg"
          clickAction={() => onDelete(entry)}
        >
          Delete
        </Button>
      ),
    },
  ]
}
