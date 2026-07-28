import { createFileRoute } from '@tanstack/react-router'
import { CalorieRing } from '~/components/CalorieRing'
import { DataLoadErrorView } from '~/components/DataLoadErrorBanner'
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from '~/lib/data-load-query'
import {
  Badge,
  Button,
  Card,
  ClickableCard,
  EmptyState,
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
  isFirstTimeUser,
  macroProgress,
  type MacroTone,
} from '~/lib/dashboard'
import { DashboardSkeleton } from '~/components/loading/PageSkeletons'
import { NutritionIcon, WorkoutIcon, ProgressIcon, ReviewIcon } from '~/components/icons/FitTrackIcons'
import { formatDisplayInteger, formatDisplayDecimal } from '~/lib/format-number'
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
  return <DashboardPageContent />
}

function DashboardPageContent() {
  const loaderData = Route.useLoaderData()
  const { asOf } = loaderData
  const dashboardQuery = useDataLoadQuery({
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

  if (isDataLoadPending(dashboardQuery)) {
    return <DashboardSkeleton />
  }

  const failedQuery = pickFailedDataLoadQuery([dashboardQuery])
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Dashboard"
        title="Failed to load dashboard"
        query={failedQuery}
      />
    )
  }

  const dashboard = dashboardQuery.data!
  const { stats, consistency, weeklyReview } = dashboard
  const { consumed, targets, user, workoutDaysThisMonth } = stats

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })


  const showWelcome = isFirstTimeUser(stats)

  if (showWelcome) {
    return (
      <VStack as="main" gap={6}>
        <VStack gap={1}>
          <Heading level={1}>Dashboard</Heading>
          <Text type="supporting">{today}</Text>
        </VStack>
        <EmptyState
          icon={<NutritionIcon />}
          title="Welcome to FitTrack"
          description="Set up your nutrition targets to get started with personalized calorie and macro tracking."
          actions={
            <Button
              label="Set up your targets"
              href="/settings"
              variant="primary"
            />
          }
        />
      </VStack>
    )
  }

  return (
    <VStack as="main" gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Dashboard</Heading>
        <Text type="supporting">{today}</Text>
      </VStack>

      {/* Calorie ring — hero element */}
      <Card padding={5}>
        <VStack gap={4} hAlign="center">
          <CalorieRing
            consumed={consumed.calories}
            target={targets.calories}
          />
          <Text
            size="4xl"
            weight="bold"
            hasTabularNumbers
          >
            {formatDisplayInteger(consumed.calories)}
          </Text>
          <Text type="supporting">
            of {formatDisplayInteger(targets.calories)} kcal
          </Text>
          <Text
            type="body"
            color={consumed.calories > targets.calories ? 'accent' : undefined}
          >
            {calorieRemainingLabel(consumed.calories, targets.calories)}
          </Text>
        </VStack>
      </Card>

      {/* Macro tracking — three compact progress bars */}
      <Card padding={5}>
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

      {/* Secondary stats grid */}
      <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
        <Card padding={4}>
          <VStack gap={1}>
            <Text type="label">Current Weight</Text>
            <Text size="2xl" weight="bold" hasTabularNumbers>
              {targets.weightKg ? `${formatDisplayDecimal(targets.weightKg)} kg` : '\u2014'}
            </Text>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={1}>
            <Text type="label">TDEE</Text>
            <Text size="2xl" weight="bold" hasTabularNumbers>
              {targets.tdee ? `${formatDisplayInteger(targets.tdee)} kcal` : '\u2014'}
            </Text>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={1}>
            <Text type="label">Workouts (30d)</Text>
            <Text size="2xl" weight="bold" hasTabularNumbers>
              {workoutDaysThisMonth}
            </Text>
            <Text type="supporting">sessions logged</Text>
          </VStack>
        </Card>
      </Grid>

      {/* Quick Actions — prominent ClickableCards */}
      <VStack gap={3}>
        <Text type="label">Quick Actions</Text>
        <Grid columns={{ minWidth: 180, max: 2 }} gap={4}>
          <ClickableCard
            href="/nutrition"
            label="Log your meals"
            padding={4}
          >
            <HStack gap={3} vAlign="center">
              <NutritionIcon />
              <VStack gap={0.5}>
                <Text weight="semibold">Log Food</Text>
                <Text type="supporting">Track your daily nutrition</Text>
              </VStack>
            </HStack>
          </ClickableCard>
          <ClickableCard
            href="/workout"
            label="Start a workout"
            padding={4}
          >
            <HStack gap={3} vAlign="center">
              <WorkoutIcon />
              <VStack gap={0.5}>
                <Text weight="semibold">Start Workout</Text>
                <Text type="supporting">Log your training session</Text>
              </VStack>
            </HStack>
          </ClickableCard>
          <ClickableCard
            href="/progress"
            label="View your progress"
            padding={4}
          >
            <HStack gap={3} vAlign="center">
              <ProgressIcon />
              <VStack gap={0.5}>
                <Text weight="semibold">View Progress</Text>
                <Text type="supporting">Weight trends and volume</Text>
              </VStack>
            </HStack>
          </ClickableCard>
          {weeklyReview.available ? (
            <ClickableCard
              href={`/review?date=${asOf}`}
              label="Weekly review"
              padding={4}
            >
              <HStack gap={3} vAlign="center">
                <ReviewIcon />
                <VStack gap={0.5}>
                  <Text weight="semibold">Weekly Review</Text>
                  <Text type="supporting">See how your week went</Text>
                </VStack>
              </HStack>
            </ClickableCard>
          ) : null}
        </Grid>
      </VStack>

      {/* Consistency tracking */}
      <Card padding={4} aria-label="Consistency tracking">
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

      {/* Goal summary */}
      <Card padding={4}>
        <VStack gap={3}>
          <Text type="label">Your Goal</Text>
          <MetadataList>
            <MetadataListItem label="Goal Type">
              <Badge
                variant="purple"
                label={user.goal_type.replace(/_/g, ' ')}
              />
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
      <HStack justify="between" vAlign="end">
        <Text type="label">{label}</Text>
        <Text type="body" weight="semibold">
          {formatDisplayInteger(consumed)} / {formatDisplayInteger(target)} g
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
