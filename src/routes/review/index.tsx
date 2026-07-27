import { Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  Grid,
  Heading,
  MetadataList,
  MetadataListItem,
  Text,
  VStack,
} from '@astryxdesign/core'
import { getWeeklyReview } from '~/lib/api'
import { formatDisplayInteger } from '~/lib/format-number'
import {
  formatCalorieAverageVersusTarget,
  formatVolumeWeekDelta,
  formatWeightTrendDelta,
} from '~/lib/weekly-review'
import { ReviewSkeleton } from '~/components/loading/PageSkeletons'
import { parseSearchDate, resolveSelectedDate } from '~/lib/nutrition'

type ReviewSearch = {
  date?: string
}

export const Route = createFileRoute('/review/')({
  validateSearch: (search: Record<string, unknown>): ReviewSearch => ({
    date: parseSearchDate(typeof search.date === 'string' ? search.date : undefined),
  }),
  loaderDeps: ({ search: { date } }) => ({ date }),
  head: () => ({ meta: [{ title: 'Weekly Review - FitTrack' }] }),
  loader: async ({ deps }) => {
    const asOf = resolveSelectedDate(deps.date)
    const review = await getWeeklyReview({ data: { asOf } })
    return { asOf, review }
  },
  pendingComponent: ReviewSkeleton,
  component: ReviewPage,
})

function ReviewPage() {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <ReviewPageContent />
    </Suspense>
  )
}

function ReviewPageContent() {
  const loaderData = Route.useLoaderData()
  const { asOf } = loaderData
  const { data: review } = useSuspenseQuery({
    queryKey: ['weekly-review', asOf],
    queryFn: () => getWeeklyReview({ data: { asOf } }),
    initialData: loaderData.review,
  })

  if (!review) {
    return (
      <VStack as="main" gap={4}>
        <Heading level={1}>Weekly Review</Heading>
        <Card>
          <VStack gap={2}>
            <Text type="label">Not ready yet</Text>
            <Text type="supporting">
              Log food, workouts, or weight during a full week to unlock your review.
            </Text>
            <Button label="Back to dashboard" href="/" variant="secondary" />
          </VStack>
        </Card>
      </VStack>
    )
  }

  const weekLabel = `${review.week.start} — ${review.week.end}`

  return (
    <VStack as="main" gap={6} aria-label="Weekly review">
      <VStack gap={1}>
        <Heading level={1}>Weekly Review</Heading>
        <Text type="supporting">{weekLabel}</Text>
      </VStack>

      <Card>
        <VStack gap={2}>
          <Text type="label">Headline</Text>
          <Text size="lg" weight="bold">
            {review.headline}
          </Text>
        </VStack>
      </Card>

      <Grid columns={{ minWidth: 280 }} gap={4}>
        <Card>
          <VStack gap={3}>
            <Heading level={2}>Nutrition</Heading>
            <MetadataList>
              <MetadataListItem label="Food log adherence">
                {review.nutrition.logAdherencePct}%
              </MetadataListItem>
              <MetadataListItem label="Protein target days">
                {review.nutrition.proteinTargetDays} of 7
              </MetadataListItem>
              <MetadataListItem label="Average calories">
                {formatCalorieAverageVersusTarget(
                  review.nutrition.avgDailyCalories,
                  review.nutrition.calorieTarget,
                )}
              </MetadataListItem>
            </MetadataList>
          </VStack>
        </Card>

        <Card>
          <VStack gap={3}>
            <Heading level={2}>Training</Heading>
            <MetadataList>
              <MetadataListItem label="Total volume">
                {formatDisplayInteger(review.training.totalVolume)} kg
              </MetadataListItem>
              <MetadataListItem label="Sets logged">
                {review.training.setCount}
              </MetadataListItem>
              <MetadataListItem label="Sessions">
                {review.training.sessionCount}
              </MetadataListItem>
              <MetadataListItem label="Vs prior week">
                {formatVolumeWeekDelta(
                  review.training.volumeDirection,
                  review.training.volumeDeltaPct,
                )}
              </MetadataListItem>
            </MetadataList>
          </VStack>
        </Card>

        <Card>
          <VStack gap={3}>
            <Heading level={2}>Weight trend</Heading>
            <MetadataList>
              <MetadataListItem label="7-day average change">
                {formatWeightTrendDelta(review.weight.movingAvgDeltaKg)}
              </MetadataListItem>
            </MetadataList>
            <Text type="supporting">
              Trailing 7-day moving average delta (Burke et al. 2011).
            </Text>
          </VStack>
        </Card>

        <Card>
          <VStack gap={3}>
            <Heading level={2}>Personal records</Heading>
            <MetadataList>
              <MetadataListItem label="PRs this week">
                {review.personalRecordCount > 0 ? (
                  <Badge variant="success">{review.personalRecordCount}</Badge>
                ) : (
                  'None'
                )}
              </MetadataListItem>
            </MetadataList>
          </VStack>
        </Card>
      </Grid>

      <Button label="Back to dashboard" href="/" variant="secondary" />
    </VStack>
  )
}
