import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  Grid,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  ProgressBar,
  StatusDot,
  Text,
  VStack,
} from '@astryxdesign/core'
import { getConsistency, getDashboardStats, getWeeklyReviewAvailability } from '~/lib/api'
import {
  calorieRemainingLabel,
  macroProgress,
  type MacroTone,
} from '~/lib/dashboard'
import { DashboardSkeleton } from '~/components/loading/PageSkeletons'
import { parseSearchDate, resolveSelectedDate } from '~/lib/nutrition'

type DashboardSearch = {
  date?: string
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    date: parseSearchDate(typeof search.date === 'string' ? search.date : undefined),
  }),
  loaderDeps: ({ search: { date } }) => ({ date }),
  head: () => ({ meta: [{ title: 'Dashboard - FitTrack' }] }),
  loader: async ({ deps }) => {
    const asOf = resolveSelectedDate(deps.date)
    const [stats, consistency, weeklyReview] = await Promise.all([
      getDashboardStats(),
      getConsistency({ data: { asOf } }),
      getWeeklyReviewAvailability({ data: { asOf } }),
    ])
    return { asOf, stats, consistency, weeklyReview }
  },
  pendingComponent: DashboardSkeleton,
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  )
}

function DashboardPageContent() {
  const loaderData = Route.useLoaderData()
  const { asOf } = loaderData
  const { data: dashboard } = useSuspenseQuery({
    queryKey: ['dashboard', asOf],
    queryFn: async () => ({
      stats: await getDashboardStats(),
      consistency: await getConsistency({ data: { asOf } }),
      weeklyReview: await getWeeklyReviewAvailability({ data: { asOf } }),
    }),
    initialData: {
      stats: loaderData.stats,
      consistency: loaderData.consistency,
      weeklyReview: loaderData.weeklyReview,
    },
  })

  const { stats, consistency, weeklyReview } = dashboard
  const { consumed, targets, user, workoutDaysThisMonth } = stats

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const calorieState = macroProgress(consumed.calories, targets.calories, 'accent')

  return (
    <VStack as="main" gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Dashboard</Heading>
        <Text type="supporting">{today}</Text>
      </VStack>

      <Grid columns={{ minWidth: 320 }} gap={4}>
        <Card>
          <VStack gap={3}>
            <Text type="label">Today&apos;s Calories</Text>
            <HStack gap={1} vAlign="baseline">
              <Text size="4xl" weight="bold">
                {Math.round(consumed.calories)}
              </Text>
              <Text type="supporting">
                / {targets.calories} kcal
              </Text>
            </HStack>
            <ProgressBar
              label="Calories consumed today"
              value={calorieState.value}
              max={calorieState.max}
              variant={calorieState.variant}
              isLabelHidden
            />
            <Text type="supporting">
              {calorieRemainingLabel(consumed.calories, targets.calories)}
            </Text>
          </VStack>
        </Card>

        <Card>
          <VStack gap={3}>
            <Text type="label">Macros</Text>
            <MacroBar
              label="Protein"
              consumed={Math.round(consumed.protein_g)}
              target={targets.protein_g}
              tone="success"
            />
            <MacroBar
              label="Carbs"
              consumed={Math.round(consumed.carbs_g)}
              target={targets.carbs_g}
              tone="warning"
            />
            <MacroBar
              label="Fat"
              consumed={Math.round(consumed.fat_g)}
              target={targets.fat_g}
              tone="accent"
            />
          </VStack>
        </Card>
      </Grid>

      <Card aria-label="Consistency tracking">
        <VStack gap={3}>
          <Text type="label">Consistency</Text>
          <MetadataList>
            <MetadataListItem label="7-day adherence">
              {consistency.adherence7}%
            </MetadataListItem>
            <MetadataListItem label="28-day adherence">
              {consistency.adherence28}%
            </MetadataListItem>
            <MetadataListItem label="Current streak">
              {consistency.currentStreak} days
            </MetadataListItem>
            <MetadataListItem label="Longest streak">
              {consistency.longestStreak} days
            </MetadataListItem>
          </MetadataList>
          <HStack gap={2} wrap="wrap">
            {consistency.last7Days.map((day) => (
              <VStack key={day.date} gap={1} hAlign="center">
                <StatusDot
                  variant={day.logged ? 'success' : 'neutral'}
                  label={
                    day.logged
                      ? `${day.weekday} food logged`
                      : `${day.weekday} no food log`
                  }
                />
                <Text type="supporting">{day.weekday}</Text>
              </VStack>
            ))}
          </HStack>
        </VStack>
      </Card>

      <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
        <Card>
          <VStack gap={1}>
            <Text type="label">Current Weight</Text>
            <Text size="2xl" weight="bold">
              {targets.weightKg ? `${targets.weightKg} kg` : '—'}
            </Text>
          </VStack>
        </Card>
        <Card>
          <VStack gap={1}>
            <Text type="label">TDEE</Text>
            <Text size="2xl" weight="bold">
              {targets.tdee ? `${targets.tdee} kcal` : '—'}
            </Text>
            <Text type="supporting">BMR: {targets.bmr} kcal</Text>
          </VStack>
        </Card>
        <Card>
          <VStack gap={1}>
            <Text type="label">Workouts (30d)</Text>
            <Text size="2xl" weight="bold">
              {workoutDaysThisMonth}
            </Text>
            <Text type="supporting">sessions logged</Text>
          </VStack>
        </Card>
      </Grid>

      <Card>
        <VStack gap={3}>
          <Text type="label">Quick Actions</Text>
          <HStack gap={2} wrap="wrap">
            <Button label="Log Food" href="/nutrition" variant="primary" />
            <Button label="Start Workout" href="/workout" variant="secondary" />
            <Button label="View Progress" href="/progress" variant="secondary" />
            {weeklyReview.available ? (
              <Button label="Weekly Review" href={`/review?date=${asOf}`} variant="secondary" />
            ) : null}
          </HStack>
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Text type="label">Your Goal</Text>
          <MetadataList>
            <MetadataListItem label="Goal Type">
              <Badge variant="purple">{user.goal_type.replace(/_/g, ' ')}</Badge>
            </MetadataListItem>
            <MetadataListItem label="Activity Level">
              {user.activity_level.replace(/_/g, ' ')}
            </MetadataListItem>
            <MetadataListItem label="Daily Calorie Target">
              {targets.calories} kcal
            </MetadataListItem>
          </MetadataList>
        </VStack>
      </Card>
    </VStack>
  )
}

function MacroBar({
  label,
  consumed,
  target,
  tone,
}: {
  label: string
  consumed: number
  target: number
  tone: MacroTone
}) {
  const state = macroProgress(consumed, target, tone)
  return (
    <VStack gap={1}>
      <HStack justify="between" vAlign="baseline">
        <Text type="label">{label}</Text>
        <Text type="body" weight="semibold">
          {consumed} / {target} g
        </Text>
      </HStack>
      <ProgressBar
        label={`${label} consumed`}
        value={state.value}
        max={state.max}
        variant={state.variant}
        isLabelHidden
      />
    </VStack>
  )
}
