import {
  Badge,
  Button,
  Card,
  EmptyState,
  Grid,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  ProgressBar,
  Tab,
  TabList,
  Table,
  Text,
  VStack,
  proportional,
} from "@astryxdesign/core";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";

import { DataLoadErrorView } from "~/components/DataLoadErrorBanner";
import {
  ScaleIcon,
  BarChartIcon,
  MealIcon,
} from "~/components/icons/FitTrackIcons";
import { ProgressSkeleton } from "~/components/loading/PageSkeletons";
import { getBodyLogs, getProgressHighlights, getWorkoutSessions, getWeeklyNutrition, getWeeklyVolume } from '~/lib/api';
import type { MuscleVolume, ProgressHighlights, WeeklyNutritionReport } from '~/lib/api';
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import type { BodyLog } from "~/lib/db";
import { formatDisplayInteger } from "~/lib/format-number";
import {
  areaChartPath,
  capitalizeMuscleGroup,
  movingAverage,
  volumeProgress,
  volumeStatusBadge,
  weightChartGeometry,
  weightChartPoints,
  weightTrend,
} from "~/lib/progress";

/** 90-day window the progress page analyses (matches the data fetch limit). */
const PROGRESS_WINDOW_DAYS = 90;

/** SMA window for the weight trend line (Apple Health uses 7 days). */
const SMA_WINDOW = 7;

type TabView = "weight" | "volume" | "nutrition";

export const Route = createFileRoute("/progress/")({
  component: ProgressPage,
  head: () => ({ meta: [{ title: "Progress - FitTrack" }] }),
  loader: async () => {
    const [bodyLogs, sessions, weeklyVolume, weeklyNutrition, highlights] =
      await Promise.all([
        getBodyLogs({ data: { limit: PROGRESS_WINDOW_DAYS } }),
        getWorkoutSessions({ data: { limit: PROGRESS_WINDOW_DAYS } }),
        getWeeklyVolume(),
        getWeeklyNutrition(),
        getProgressHighlights(),
      ]);
    return { bodyLogs, sessions, weeklyVolume, weeklyNutrition, highlights };
  },
  pendingComponent: ProgressSkeleton,
});

function ProgressPage() {
  return <ProgressPageContent />;
}

function ProgressPageContent() {
  const loaderData = Route.useLoaderData();
  const [activeTab, setActiveTab] = React.useState<TabView>("weight");

  const bodyLogsQuery = useDataLoadQuery({
    initialData: loaderData.bodyLogs,
    queryFn: () => getBodyLogs({ data: { limit: PROGRESS_WINDOW_DAYS } }),
    queryKey: ["body-logs"],
  });

  const sessionsQuery = useDataLoadQuery({
    initialData: loaderData.sessions,
    queryFn: () =>
      getWorkoutSessions({ data: { limit: PROGRESS_WINDOW_DAYS } }),
    queryKey: ["workout-sessions-progress"],
  });

  const weeklyVolumeQuery = useDataLoadQuery({
    initialData: loaderData.weeklyVolume,
    queryFn: () => getWeeklyVolume(),
    queryKey: ["weekly-volume"],
  });

  const weeklyNutritionQuery = useDataLoadQuery({
    initialData: loaderData.weeklyNutrition,
    queryFn: () => getWeeklyNutrition(),
    queryKey: ["weekly-nutrition"],
  });

  const highlightsQuery = useDataLoadQuery({
    initialData: loaderData.highlights,
    queryFn: () => getProgressHighlights(),
    queryKey: ["progress-highlights"],
  });

  if (
    isDataLoadPending(bodyLogsQuery) ||
    isDataLoadPending(sessionsQuery) ||
    isDataLoadPending(weeklyVolumeQuery) ||
    isDataLoadPending(weeklyNutritionQuery) ||
    isDataLoadPending(highlightsQuery)
  ) {
    return <ProgressSkeleton />;
  }

  const failedQuery = pickFailedDataLoadQuery([
    bodyLogsQuery,
    sessionsQuery,
    weeklyVolumeQuery,
    weeklyNutritionQuery,
    highlightsQuery,
  ]);
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Progress"
        title="Failed to load progress data"
        query={failedQuery}
      />
    );
  }

  const bodyLogs = bodyLogsQuery.data!;
  const sessions = sessionsQuery.data!;
  const weeklyVolume = weeklyVolumeQuery.data!;
  const weeklyNutrition = weeklyNutritionQuery.data!;
  const highlights = highlightsQuery.data!;

  return (
    <VStack as="main" gap={6}>
      <Heading level={1}>Progress</Heading>

      <HighlightsCard highlights={highlights} />

      <Card padding={4}>
        <VStack gap={4}>
          <TabList
            value={activeTab}
            onChange={(value: string) => setActiveTab(value as TabView)}
            layout="fill"
            size="lg"
            hasDivider
          >
            <Tab value="weight" label="Weight" />
            <Tab value="volume" label="Volume" />
            <Tab value="nutrition" label="Nutrition" />
          </TabList>

          {activeTab === "weight" && <WeightView bodyLogs={bodyLogs} />}
          {activeTab === "volume" && <VolumeView volume={weeklyVolume} />}
          {activeTab === "nutrition" && (
            <NutritionView weekly={weeklyNutrition} />
          )}
        </VStack>
      </Card>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Highlights card — best lift, monthly volume, workout streak
// ---------------------------------------------------------------------------

function HighlightsCard({ highlights }: { highlights: ProgressHighlights }) {
  return (
    <Grid columns={{ max: 3, minWidth: 140 }} gap={4}>
      <Card padding={4}>
        <VStack gap={1}>
          <Text type="label">Best Lift This Month</Text>
          {highlights.bestLift ? (
            <>
              <Heading level={3}>
                {highlights.bestLift.weightKg}{" "}
                <Text type="body" size="base" weight="normal">
                  kg
                </Text>
              </Heading>
              <Text type="supporting">
                {highlights.bestLift.exercise} &times;{" "}
                {highlights.bestLift.reps}
              </Text>
            </>
          ) : (
            <Text size="2xl" weight="bold" hasTabularNumbers>
              &mdash;
            </Text>
          )}
        </VStack>
      </Card>

      <Card padding={4}>
        <VStack gap={1}>
          <Text type="label">Monthly Volume</Text>
          <Heading level={3}>
            {formatDisplayInteger(highlights.monthlyVolumeKg)}{" "}
            <Text type="body" size="base" weight="normal">
              kg
            </Text>
          </Heading>
          <Text type="supporting">Total weight lifted</Text>
        </VStack>
      </Card>

      <Card padding={4}>
        <VStack gap={1}>
          <Text type="label">Workout Streak</Text>
          <Heading level={3}>
            {highlights.workoutStreak}{" "}
            <Text type="body" size="base" weight="normal">
              day{highlights.workoutStreak === 1 ? "" : "s"}
            </Text>
          </Heading>
          <Text type="supporting">Consecutive days</Text>
        </VStack>
      </Card>
    </Grid>
  );
}

// ---------------------------------------------------------------------------
// Weight view — area chart + SMA trend line + table
// ---------------------------------------------------------------------------

function WeightView({ bodyLogs }: { bodyLogs: BodyLog[] }) {
  const trend = weightTrend(bodyLogs);
  const weighted = bodyLogs
    .filter(
      (log): log is BodyLog & { weight_kg: number } => log.weight_kg !== null
    )
    .sort((a, b) => (a.date < b.date ? -1 : (a.date > b.date ? 1 : 0)));

  if (weighted.length === 0) {
    return (
      <EmptyState
        icon={<ScaleIcon />}
        title="No weight logs yet"
        description="Log your weight in Settings to start tracking trends."
        actions={
          <Button label="Log your weight" variant="primary" href="/settings" />
        }
      />
    );
  }

  const weights = weighted.map((log) => log.weight_kg);
  const sma = movingAverage(weights, SMA_WINDOW);

  return (
    <VStack gap={4}>
      <WeightAreaChart weights={weights} sma={sma} trend={trend!} />
      <RecentWeightTable bodyLogs={bodyLogs} />
    </VStack>
  );
}

function WeightAreaChart({
  weights,
  sma,
  trend,
}: {
  weights: number[];
  sma: (number | null)[];
  trend: { min: number; max: number };
}) {
  const geometry = weightChartGeometry(weights.length);
  const points = weightChartPoints(weights, trend.min, trend.max, geometry);
  const areaPath = areaChartPath(points, geometry);

  // Map SMA values to chart points, skipping nulls with breaks in the line
  const smaPoints = sma
    .map((value, index) => {
      if (value === null) {return null;}
      const point = weightChartPoints([value], trend.min, trend.max, geometry);
      return {
        x: (index / Math.max(weights.length - 1, 1)) * geometry.width,
        y: point[0].y,
      };
    })
    .filter((p): p is { x: number; y: number } => p !== null);

  const smaLine =
    smaPoints.length > 0 ? smaPoints.map((p) => `${p.x},${p.y}`).join(" ") : "";

  const accentColor = "var(--color-accent)";
  const accentColorFaded = "var(--color-accent)";

  return (
    <svg
      role="img"
      aria-label="Weight trend area chart with 7-day moving average"
      viewBox={`0 0 ${geometry.width} ${geometry.viewBoxHeight}`}
      width="100%"
    >
      <title>Weight trend area chart with 7-day moving average</title>
      <defs>
        <linearGradient id="weight-area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Area fill under raw data */}
      <path d={areaPath} fill="url(#weight-area-fill)" />

      {/* Raw data line */}
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={accentColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* 7-day SMA trend line — thicker, dashed */}
      {smaLine && (
        <polyline
          points={smaLine}
          fill="none"
          stroke={accentColor}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="6 3"
          opacity={0.7}
        />
      )}

      {/* Data point dots */}
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={2}
          fill={accentColor}
          opacity={0.6}
        />
      ))}
    </svg>
  );
}

interface WeightLogRow extends Record<string, unknown> {
  id: number;
  date: string;
  weight: string;
  bodyFat: string;
}

function RecentWeightTable({ bodyLogs }: { bodyLogs: BodyLog[] }) {
  const rows: WeightLogRow[] = bodyLogs.slice(0, 10).map((log) => ({
    bodyFat: log.body_fat_pct ? `${log.body_fat_pct}%` : "\u2014",
    date: log.date,
    id: log.id,
    weight: log.weight_kg ? `${log.weight_kg} kg` : "\u2014",
  }));

  return (
    <Table
      aria-label="Recent weight log entries"
      data={rows}
      idKey="id"
      density="compact"
      columns={[
        { header: "Date", key: "date", width: proportional(1) },
        { header: "Weight", key: "weight", width: proportional(1) },
        { header: "Body Fat", key: "bodyFat", width: proportional(1) },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Volume view — staggered entrance bars
// ---------------------------------------------------------------------------

function VolumeView({ volume }: { volume: MuscleVolume[] }) {
  // Stagger bar entrance: reveal one bar every 80 ms
  const [visibleCount, setVisibleCount] = React.useState(0);

  React.useEffect(() => {
    if (volume.length === 0) {return;}
    setVisibleCount(0);
    // Check for reduced motion preference
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setVisibleCount(volume.length);
      return;
    }
    let i = 1;
    const timer = setInterval(() => {
      setVisibleCount(i);
      i++;
      if (i > volume.length) {clearInterval(timer);}
    }, 80);
    return () => clearInterval(timer);
  }, [volume.length]);

  if (volume.length === 0) {
    return (
      <EmptyState
        isCompact
        icon={<BarChartIcon />}
        title="No training data"
        description="No training data in the last 7 days. Log a workout to see volume analysis."
      />
    );
  }

  return (
    <VStack gap={1}>
      <VStack gap={1}>
        <Text weight="semibold">Weekly Volume by Muscle Group</Text>
        <Text type="supporting">
          Schoenfeld et al. 2017: 10&ndash;20 sets per muscle group per week for
          hypertrophy
        </Text>
      </VStack>
      <VStack gap={3}>
        {volume.map((mv, index) => (
          <AnimatedVolumeRow
            key={mv.muscle_group}
            volume={mv}
            visible={index < visibleCount}
          />
        ))}
      </VStack>
    </VStack>
  );
}

function AnimatedVolumeRow({
  volume,
  visible,
}: {
  volume: MuscleVolume;
  visible: boolean;
}) {
  const bar = volumeProgress(volume);
  const status = volumeStatusBadge(volume.status);

  return (
    <VStack gap={1} aria-hidden={!visible}>
      <HStack hAlign="between" vAlign="center" wrap="wrap">
        <Text weight="semibold">
          {capitalizeMuscleGroup(volume.muscle_group)}
        </Text>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Text hasTabularNumbers>{volume.total_sets} sets</Text>
          <Text type="supporting">
            ({volume.min_recommended}&ndash;{volume.max_recommended} optimal)
          </Text>
          <Badge variant={status.variant} label={status.label} />
        </HStack>
      </HStack>
      {visible ? (
        <ProgressBar
          label={`${capitalizeMuscleGroup(volume.muscle_group)} weekly volume`}
          value={bar.value}
          max={bar.max}
          variant={bar.variant}
          isLabelHidden
        />
      ) : (
        <ProgressBar
          label={`${capitalizeMuscleGroup(volume.muscle_group)} weekly volume`}
          value={0}
          max={bar.max}
          variant="accent"
          isLabelHidden
        />
      )}
      <Text type="supporting">
        Volume: {formatDisplayInteger(volume.total_volume)} kg
      </Text>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Nutrition view — weekly averages
// ---------------------------------------------------------------------------

function NutritionView({ weekly }: { weekly: WeeklyNutritionReport }) {
  const hasData = weekly.daily.length > 0;

  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Text weight="semibold">Weekly Nutrition Summary</Text>
        <Text type="supporting">7-day average</Text>
      </VStack>
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
          icon={<MealIcon />}
          title="No food logged"
          description="No food logged in the last 7 days."
        />
      )}
    </VStack>
  );
}
