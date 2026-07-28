import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DataLoadErrorView } from '~/components/DataLoadErrorBanner'
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from '~/lib/data-load-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Button,
  Card,
  Grid,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  ProgressBar,
  Text,
  VStack,
} from '@astryxdesign/core'
import { useToast } from '@astryxdesign/core/Toast'
import { DeleteConfirmationDialog } from '~/components/DeleteConfirmationDialog'
import { DateNavigationBar } from '~/components/DateNavigationBar'
import { AddFoodCard, type AddFoodCardHandle } from '~/components/nutrition/AddFoodCard'
import { FoodLogCard } from '~/components/nutrition/FoodLogCard'
import { ToastUndoButton } from '~/components/ToastUndoButton'
import {
  addFoodLogEntry,
  copyDayFromDate,
  deleteFoodLogEntries,
  deleteFoodLogEntry,
  getDailyTargets,
  getMealTemplates,
  getNutritionSummary,
  type DailyTargets,
} from '~/lib/api'
import { deleteFoodEntryTitle } from '~/lib/delete-confirmation'
import { macroProgress } from '~/lib/dashboard'
import { canCopyDayFromDate, previousDay } from '~/lib/food-log-copy'
import type { FoodLogEntry } from '~/lib/db'
import {
  parseSearchDate,
  resolveSelectedDate,
  type NutritionTotals,
} from '~/lib/nutrition'
import { NutritionSkeleton } from '~/components/loading/PageSkeletons'
import { runOrQueue } from '~/lib/offline'
import {
  copyCompletedBody,
  entryDeletedBody,
  mutationFailedBody,
  TOAST_DURATION_MS,
} from '~/lib/toasts'

type NutritionSearch = {
  date?: string
}

export const Route = createFileRoute('/nutrition/')({
  validateSearch: (search: Record<string, unknown>): NutritionSearch => ({
    date: parseSearchDate(typeof search.date === 'string' ? search.date : undefined),
  }),
  loaderDeps: ({ search: { date } }) => ({ date }),
  loader: async ({ deps }) => {
    const selectedDate = resolveSelectedDate(deps.date)
    const sourceDate = previousDay(selectedDate)
    const [summary, sourceSummary, targets, mealTemplates] = await Promise.all([
      getNutritionSummary({ data: { date: selectedDate } }),
      getNutritionSummary({ data: { date: sourceDate } }),
      getDailyTargets(),
      getMealTemplates(),
    ])
    return { selectedDate, sourceDate, summary, sourceSummary, targets, mealTemplates }
  },
  head: () => ({ meta: [{ title: 'Nutrition - FitTrack' }] }),
  pendingComponent: NutritionSkeleton,
  component: NutritionPage,
})

function NutritionPage() {
  return <NutritionPageContent />
}

function NutritionPageContent() {
  const { date: dateFromSearch } = Route.useSearch()
  const loaderData = Route.useLoaderData()
  const selectedDate = resolveSelectedDate(dateFromSearch)
  const navigate = useNavigate({ from: Route.fullPath })
  const addFoodRef = useRef<AddFoodCardHandle>(null)
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<FoodLogEntry | null>(null)
  const confirmDeleteEntry = useConfirmDeleteFoodEntry(selectedDate)

  const sourceDate = previousDay(selectedDate)
  const summaryQuery = useDataLoadQuery({
    queryKey: ['food-log', selectedDate],
    queryFn: () => getNutritionSummary({ data: { date: selectedDate } }),
    initialData: loaderData.selectedDate === selectedDate ? loaderData.summary : undefined,
  })
  const sourceSummaryQuery = useDataLoadQuery({
    queryKey: ['food-log', sourceDate],
    queryFn: () => getNutritionSummary({ data: { date: sourceDate } }),
    initialData: loaderData.selectedDate === selectedDate ? loaderData.sourceSummary : undefined,
  })
  const targetsQuery = useDataLoadQuery({
    queryKey: ['targets'],
    queryFn: () => getDailyTargets(),
    initialData: loaderData.targets,
  })
  const mealTemplatesQuery = useDataLoadQuery({
    queryKey: ['meal-templates'],
    queryFn: () => getMealTemplates(),
    initialData: loaderData.mealTemplates,
  })
  const copyDay = useCopyDayFromYesterday(selectedDate, sourceSummaryQuery.data?.entries ?? [])

  if (
    isDataLoadPending(summaryQuery) ||
    isDataLoadPending(sourceSummaryQuery) ||
    isDataLoadPending(targetsQuery) ||
    isDataLoadPending(mealTemplatesQuery)
  ) {
    return <NutritionSkeleton />
  }

  const failedQuery = pickFailedDataLoadQuery([
    summaryQuery,
    sourceSummaryQuery,
    targetsQuery,
    mealTemplatesQuery,
  ])
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Nutrition"
        title="Failed to load nutrition data"
        query={failedQuery}
      />
    )
  }

  const summary = summaryQuery.data!
  const sourceSummary = sourceSummaryQuery.data!
  const targets = targetsQuery.data!
  const mealTemplates = mealTemplatesQuery.data!

  const handleDateChange = (nextDate: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        date: nextDate,
      }),
    })
  }

  return (
    <VStack as="main" gap={6}>
      <NutritionHeader
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        showCopyDay={canCopyDayFromDate(summary.entries, sourceSummary.entries)}
        onCopyDay={copyDay}
      />
      <Grid columns={{ minWidth: 320, max: 2, repeat: 'fit' }} gap={4}>
        <DailySummaryCard totals={summary.totals} targets={targets} />
        <AddFoodCard ref={addFoodRef} selectedDate={selectedDate} />
      </Grid>
      <FoodLogCard
        entries={summary.entries}
        sourceDayEntries={sourceSummary.entries}
        selectedDate={selectedDate}
        mealTemplates={mealTemplates}
        onAddMeal={() => addFoodRef.current?.focusSearch()}
        onDeleteEntry={setPendingDeleteEntry}
      />
      <DeleteConfirmationDialog
        isOpen={pendingDeleteEntry != null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteEntry(null)
        }}
        title={deleteFoodEntryTitle()}
        onConfirm={async () => {
          if (!pendingDeleteEntry) return
          await confirmDeleteEntry(pendingDeleteEntry)
          setPendingDeleteEntry(null)
        }}
      />
    </VStack>
  )
}

function NutritionHeader({
  selectedDate,
  onDateChange,
  showCopyDay,
  onCopyDay,
}: {
  selectedDate: string
  onDateChange: (date: string) => void
  showCopyDay: boolean
  onCopyDay: () => Promise<void>
}) {
  return (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>Nutrition</Heading>
        <HStack gap={2} wrap="wrap">
          {showCopyDay ? (
            <Button
              label="Copy yesterday"
              variant="primary"
              size="sm"
              clickAction={onCopyDay}
            >
              Copy yesterday
            </Button>
          ) : undefined}
          <Button label="Templates" href="/nutrition/templates" size="sm" />
          <Button label="Weekly Plan" href="/nutrition/planning" size="sm" />
        </HStack>
      </HStack>
      <DateNavigationBar selectedDate={selectedDate} onDateChange={onDateChange} />
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

function useConfirmDeleteFoodEntry(selectedDate: string) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const sourceDate = previousDay(selectedDate)

  const invalidateFoodLog = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['food-log', selectedDate] }),
      queryClient.invalidateQueries({ queryKey: ['food-log', sourceDate] }),
    ])
  }

  return async (entry: FoodLogEntry) => {
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

function useCopyDayFromYesterday(
  selectedDate: string,
  sourceDayEntries: import('~/lib/db').FoodLogEntry[],
) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const sourceDate = previousDay(selectedDate)

  const invalidateFoodLog = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['food-log', selectedDate] }),
      queryClient.invalidateQueries({ queryKey: ['food-log', sourceDate] }),
    ])
  }

  return async () => {
    const payload = { fromDate: sourceDate, toDate: selectedDate }
    try {
      const outcome = await runOrQueue('copyDayFromDate', payload, () =>
        copyDayFromDate({ data: payload }),
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
      toast({ body: copyCompletedBody(sourceDayEntries.length) })
    } catch {
      toast({ body: mutationFailedBody('Copy day'), type: 'error' })
    }
  }
}

function DailySummaryCard({
  totals,
  targets,
}: {
  totals: NutritionTotals
  targets: DailyTargets
}) {
  const calorieState = macroProgress(totals.calories, targets.calories, 'accent')
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>Daily Summary</Heading>
        <HStack gap={1} vAlign="end">
          <Text size="4xl" weight="bold" hasTabularNumbers>
            {Math.round(totals.calories)}
          </Text>
          <Text type="supporting">/ {targets.calories} kcal</Text>
        </HStack>
        <ProgressBar
          label="Calories consumed today"
          value={calorieState.value}
          max={calorieState.max}
          variant={calorieState.variant}
          isLabelHidden
        />
        <MacroSummary totals={totals} targets={targets} />
      </VStack>
    </Card>
  )
}

function MacroSummary({
  totals,
  targets,
}: {
  totals: NutritionTotals
  targets: DailyTargets
}) {
  return (
    <MetadataList>
      <MetadataListItem label="Protein">
        {Math.round(totals.protein_g)} / {targets.protein_g} g
      </MetadataListItem>
      <MetadataListItem label="Carbs">
        {Math.round(totals.carbs_g)} / {targets.carbs_g} g
      </MetadataListItem>
      <MetadataListItem label="Fat">
        {Math.round(totals.fat_g)} / {targets.fat_g} g
      </MetadataListItem>
    </MetadataList>
  )
}
