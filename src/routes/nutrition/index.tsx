import { Suspense, useRef } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
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
import { DateNavigationBar } from '~/components/DateNavigationBar'
import { AddFoodCard, type AddFoodCardHandle } from '~/components/nutrition/AddFoodCard'
import { FoodLogCard } from '~/components/nutrition/FoodLogCard'
import { ToastUndoButton } from '~/components/ToastUndoButton'
import {
  copyDayFromDate,
  deleteFoodLogEntries,
  getDailyTargets,
  getMealTemplates,
  getNutritionSummary,
  type DailyTargets,
} from '~/lib/api'
import { macroProgress } from '~/lib/dashboard'
import { canCopyDayFromDate, previousDay } from '~/lib/food-log-copy'
import {
  parseSearchDate,
  resolveSelectedDate,
  type NutritionTotals,
} from '~/lib/nutrition'
import { NutritionSkeleton } from '~/components/loading/PageSkeletons'
import { runOrQueue } from '~/lib/offline'
import {
  copyCompletedBody,
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
  return (
    <Suspense fallback={<NutritionSkeleton />}>
      <NutritionPageContent />
    </Suspense>
  )
}

function NutritionPageContent() {
  const { date: dateFromSearch } = Route.useSearch()
  const loaderData = Route.useLoaderData()
  const selectedDate = resolveSelectedDate(dateFromSearch)
  const navigate = useNavigate({ from: Route.fullPath })
  const addFoodRef = useRef<AddFoodCardHandle>(null)

  const sourceDate = previousDay(selectedDate)
  const { data: summary } = useSuspenseQuery({
    queryKey: ['food-log', selectedDate],
    queryFn: () => getNutritionSummary({ data: { date: selectedDate } }),
    initialData: loaderData.selectedDate === selectedDate ? loaderData.summary : undefined,
  })
  const { data: sourceSummary } = useSuspenseQuery({
    queryKey: ['food-log', sourceDate],
    queryFn: () => getNutritionSummary({ data: { date: sourceDate } }),
    initialData: loaderData.selectedDate === selectedDate ? loaderData.sourceSummary : undefined,
  })
  const { data: targets } = useSuspenseQuery({
    queryKey: ['targets'],
    queryFn: () => getDailyTargets(),
    initialData: loaderData.targets,
  })
  const { data: mealTemplates } = useSuspenseQuery({
    queryKey: ['meal-templates'],
    queryFn: () => getMealTemplates(),
    initialData: loaderData.mealTemplates,
  })
  const copyDay = useCopyDayFromYesterday(selectedDate, sourceSummary.entries)

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
