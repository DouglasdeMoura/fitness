import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  Badge,
  Card,
  EmptyState,
  Grid,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  ProgressBar,
  Table,
  Text,
  VStack,
  proportional,
} from '@astryxdesign/core'
import {
  getBodyLogs,
  getWorkoutSessions,
  getWeeklyVolume,
  getWeeklyNutrition,
  type MuscleVolume,
  type WeeklyNutritionReport,
} from '~/lib/api'
import type { BodyLog } from '~/lib/db'
import {
  capitalizeMuscleGroup,
  volumeProgress,
  volumeStatusBadge,
  weightChangeTone,
  weightChartGeometry,
  weightChartPoints,
  weightTrend,
  workoutsPerWeek,
} from '~/lib/progress'

/** 90-day window the progress page analyses (matches the data fetch limit). */
const PROGRESS_WINDOW_DAYS = 90

export const Route = createFileRoute('/progress/')({
  head: () => ({ meta: [{ title: 'Progress - FitTrack' }] }),
  component: ProgressPage,
})

function ProgressPage() {
  const { data: bodyLogs } = useSuspenseQuery({
    queryKey: ['body-logs'],
    queryFn: () => getBodyLogs({ data: { limit: PROGRESS_WINDOW_DAYS } }),
  })

  const { data: sessions } = useSuspenseQuery({
    queryKey: ['workout-sessions-progress'],
    queryFn: () => getWorkoutSessions({ data: { limit: PROGRESS_WINDOW_DAYS } }),
  })

  const { data: weeklyVolume } = useSuspenseQuery({
    queryKey: ['weekly-volume'],
    queryFn: () => getWeeklyVolume(),
  })

  const { data: weeklyNutrition } = useSuspenseQuery({
    queryKey: ['weekly-nutrition'],
    queryFn: () => getWeeklyNutrition(),
  })

  return (
    <VStack as="main" gap={4}>
      <Heading level={1}>Progress</Heading>
      <ProgressStatCards
        bodyLogs={bodyLogs}
        workoutCount={sessions.length}
      />
      <WeightHistoryCard bodyLogs={bodyLogs} />
      <WeeklyVolumeCard volume={weeklyVolume} />
      <WeeklyNutritionCard weekly={weeklyNutrition} />
    </VStack>
  )
}

function ProgressStatCards({
  bodyLogs,
  workoutCount,
}: {
  bodyLogs: BodyLog[]
  workoutCount: number
}) {
  const trend = weightTrend(bodyLogs)
  const perWeek = workoutsPerWeek(workoutCount, PROGRESS_WINDOW_DAYS)
  const changeTone = trend ? weightChangeTone(trend.change) : null

  return (
    <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
      <Card>
        <VStack gap={1}>
          <Text type="label">Weight Trend</Text>
          <Text size="2xl" weight="bold" hasTabularNumbers>
            {trend ? `${trend.last.toFixed(1)} kg` : '—'}
          </Text>
          {changeTone && trend && (
            <Badge
              variant={changeTone}
              label={`${trend.change > 0 ? '+' : ''}${trend.change.toFixed(1)} kg`}
            />
          )}
        </VStack>
      </Card>

      <Card>
        <VStack gap={1}>
          <Text type="label">Workouts (90d)</Text>
          <Text size="2xl" weight="bold" hasTabularNumbers>
            {workoutCount}
          </Text>
        </VStack>
      </Card>

      <Card>
        <VStack gap={1}>
          <Text type="label">Avg per Week</Text>
          <Text size="2xl" weight="bold" hasTabularNumbers>
            {perWeek.toFixed(1)}
          </Text>
        </VStack>
      </Card>
    </Grid>
  )
}

function WeightHistoryCard({ bodyLogs }: { bodyLogs: BodyLog[] }) {
  const trend = weightTrend(bodyLogs)
  const weighted = bodyLogs
    .filter((log): log is BodyLog & { weight_kg: number } => log.weight_kg !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>Weight History</Heading>
        {weighted.length === 0 ? (
          <EmptyState
            isCompact
            icon={<span aria-hidden>⚖️</span>}
            title="No weight logs yet"
            description="Log your weight in Settings to start tracking."
          />
        ) : (
          <VStack gap={4}>
            <WeightChart weights={weighted.map((log) => log.weight_kg)} trend={trend!} />
            <RecentWeightTable bodyLogs={bodyLogs} />
          </VStack>
        )}
      </VStack>
    </Card>
  )
}

interface WeightLogRow extends Record<string, unknown> {
  id: number
  date: string
  weight: string
  bodyFat: string
}

function RecentWeightTable({ bodyLogs }: { bodyLogs: BodyLog[] }) {
  const rows: WeightLogRow[] = bodyLogs.slice(0, 10).map((log) => ({
    id: log.id,
    date: log.date,
    weight: log.weight_kg ? `${log.weight_kg} kg` : '—',
    bodyFat: log.body_fat_pct ? `${log.body_fat_pct}%` : '—',
  }))

  return (
    <Table
      aria-label="Recent weight log entries"
      data={rows}
      idKey="id"
      density="compact"
      columns={[
        { key: 'date', header: 'Date', width: proportional(1) },
        { key: 'weight', header: 'Weight', width: proportional(1) },
        { key: 'bodyFat', header: 'Body Fat', width: proportional(1) },
      ]}
    />
  )
}

function WeightChart({
  weights,
  trend,
}: {
  weights: number[]
  trend: { min: number; max: number }
}) {
  const geometry = weightChartGeometry(weights.length)
  const points = weightChartPoints(weights, trend.min, trend.max, geometry)
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <svg
      role="img"
      aria-label="Weight trend line chart"
      viewBox={`0 0 ${geometry.width} ${geometry.viewBoxHeight}`}
      width="100%"
    >
      <title>Weight trend line chart</title>
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={3} fill="var(--color-accent)" />
      ))}
    </svg>
  )
}

function WeeklyVolumeCard({ volume }: { volume: MuscleVolume[] }) {
  return (
    <Card>
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={2}>Weekly Volume by Muscle Group</Heading>
          <Text type="supporting">
            Based on Schoenfeld et al. 2017: 10-20 sets per muscle group per week for hypertrophy
          </Text>
        </VStack>
        {volume.length === 0 ? (
          <EmptyState
            isCompact
            icon={<span aria-hidden>📊</span>}
            title="No training data"
            description="No training data in the last 7 days. Log a workout to see volume analysis."
          />
        ) : (
          <VStack gap={3}>
            {volume.map((mv) => (
              <VolumeRow key={mv.muscle_group} volume={mv} />
            ))}
          </VStack>
        )}
      </VStack>
    </Card>
  )
}

function VolumeRow({ volume }: { volume: MuscleVolume }) {
  const bar = volumeProgress(volume)
  const status = volumeStatusBadge(volume.status)
  return (
    <VStack gap={1}>
      <HStack hAlign="between" vAlign="center" wrap="wrap">
        <Text weight="semibold">{capitalizeMuscleGroup(volume.muscle_group)}</Text>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Text hasTabularNumbers>{volume.total_sets} sets</Text>
          <Text type="supporting">
            ({volume.min_recommended}-{volume.max_recommended} optimal)
          </Text>
          <Badge variant={status.variant} label={status.label} />
        </HStack>
      </HStack>
      <ProgressBar
        label={`${capitalizeMuscleGroup(volume.muscle_group)} weekly volume`}
        value={bar.value}
        max={bar.max}
        variant={bar.variant}
        isLabelHidden
      />
      <Text type="supporting">Volume: {Math.round(volume.total_volume)} kg</Text>
    </VStack>
  )
}

function WeeklyNutritionCard({
  weekly,
}: {
  weekly: WeeklyNutritionReport
}) {
  const hasData = weekly.daily.length > 0
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>Weekly Nutrition Summary (7-day average)</Heading>
        {hasData ? (
          <MetadataList columns={2}>
            <MetadataListItem label="Avg Calories">
              {weekly.avg.calories} kcal
            </MetadataListItem>
            <MetadataListItem label="Avg Protein">
              {weekly.avg.protein_g} g
            </MetadataListItem>
            <MetadataListItem label="Avg Carbs">
              {weekly.avg.carbs_g} g
            </MetadataListItem>
            <MetadataListItem label="Avg Fat">
              {weekly.avg.fat_g} g
            </MetadataListItem>
          </MetadataList>
        ) : (
          <EmptyState
            isCompact
            icon={<span aria-hidden>🍽️</span>}
            title="No food logged"
            description="No food logged in the last 7 days."
          />
        )}
      </VStack>
    </Card>
  )
}
