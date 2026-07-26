import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
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
import { AddFoodCard } from '~/components/nutrition/AddFoodCard'
import { FoodLogCard } from '~/components/nutrition/FoodLogCard'
import {
  getDailyTargets,
  getNutritionSummary,
  type DailyTargets,
} from '~/lib/api'
import { macroProgress } from '~/lib/dashboard'
import { todayString, type NutritionTotals } from '~/lib/nutrition'

export const Route = createFileRoute('/nutrition/')({
  loader: async () => {
    const selectedDate = todayString()
    const [summary, targets] = await Promise.all([
      getNutritionSummary({ data: { date: selectedDate } }),
      getDailyTargets(),
    ])
    return { selectedDate, summary, targets }
  },
  head: () => ({ meta: [{ title: 'Nutrition - FitTrack' }] }),
  component: NutritionPage,
})

function NutritionPage() {
  const initial = Route.useLoaderData()
  const { data: summary } = useSuspenseQuery({
    queryKey: ['food-log', initial.selectedDate],
    queryFn: () => getNutritionSummary({ data: { date: initial.selectedDate } }),
    initialData: initial.summary,
  })
  const { data: targets } = useSuspenseQuery({
    queryKey: ['targets'],
    queryFn: () => getDailyTargets(),
    initialData: initial.targets,
  })
  return (
    <VStack as="main" gap={4}>
      <NutritionHeader />
      <Grid columns={{ minWidth: 320 }} gap={4}>
        <DailySummaryCard totals={summary.totals} targets={targets} />
        <AddFoodCard selectedDate={initial.selectedDate} />
      </Grid>
      <FoodLogCard entries={summary.entries} selectedDate={initial.selectedDate} />
    </VStack>
  )
}

function NutritionHeader() {
  return (
    <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
      <Heading level={1}>Nutrition</Heading>
      <HStack gap={2} wrap="wrap">
        <Button label="Templates" href="/nutrition/templates" size="sm" />
        <Button label="Weekly Plan" href="/nutrition/planning" size="sm" />
      </HStack>
    </HStack>
  )
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
          <Text size="3xl" weight="bold" hasTabularNumbers>
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
