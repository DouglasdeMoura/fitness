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
  proportional,
  Tab,
  TabList,
  Table,
  Text,
  VStack,
} from "@astryxdesign/core";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";

import { DataLoadErrorView } from "~/components/data-load-error-banner";
import {
  BarChartIcon,
  MealIcon,
  ScaleIcon,
} from "~/components/icons/fit-track-icons";
import { ProgressSkeleton } from "~/components/loading/page-skeletons";
import type { BodyLogRecord } from "~/db/user-body-queries";
import type {
  MuscleVolume,
  ProgressHighlights,
  WeeklyNutritionReport,
} from "~/lib/api";
import {
  getBodyLogs,
  getProgressHighlights,
  getWeeklyNutrition,
  getWeeklyVolume,
  getWorkoutSessions,
} from "~/lib/api";
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
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
    return { bodyLogs, highlights, sessions, weeklyNutrition, weeklyVolume };
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
        query={failedQuery}
        title="Failed to load progress data"
      />
    );
  }

  const bodyLogs = bodyLogsQuery.data!;
  const _sessions = sessionsQuery.data!;
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
            hasDivider
            layout="fill"
            onChange={(value: string) => setActiveTab(value as TabView)}
            size="lg"
            value={activeTab}
          >
            <Tab label="Weight" value="weight" />
            <Tab label="Volume" value="volume" />
            <Tab label="Nutrition" value="nutrition" />
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
                <Text size="base" type="body" weight="normal">
                  kg
                </Text>
              </Heading>
              <Text type="supporting">
                {highlights.bestLift.exercise} &times;{" "}
                {highlights.bestLift.reps}
              </Text>
            </>
          ) : (
            <Text hasTabularNumbers size="2xl" weight="bold">
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
            <Text size="base" type="body" weight="normal">
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
            <Text size="base" type="body" weight="normal">
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

function WeightView({ bodyLogs }: { bodyLogs: BodyLogRecord[] }) {
  const trend = weightTrend(bodyLogs);
  const weighted = bodyLogs
    .filter(
      (log): log is BodyLogRecord & { weightKg: number } =>
        log.weightKg !== null
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (weighted.length === 0) {
    return (
      <EmptyState
        actions={
          <Button href="/settings" label="Log your weight" variant="primary" />
        }
        description="Log your weight in Settings to start tracking trends."
        icon={<ScaleIcon />}
        title="No weight data yet"
      />
    );
  }

  const weights = weighted.map((log) => log.weightKg);
  const sma = movingAverage(weights, SMA_WINDOW);

  return (
    <VStack gap={4}>
      <WeightAreaChart sma={sma} trend={trend!} weights={weights} />
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
      if (value === null) {
        return null;
      }
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
  const _accentColorFaded = "var(--color-accent)";

  return (
    <svg
      aria-label="Weight trend area chart with 7-day moving average"
      viewBox={`0 0 ${geometry.width} ${geometry.viewBoxHeight}`}
      width="100%"
    >
      <title>Weight trend area chart with 7-day moving average</title>
      <defs>
        <linearGradient id="weight-area-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Area fill under raw data */}
      <path d={areaPath} fill="url(#weight-area-fill)" />

      {/* Raw data line */}
      <polyline
        fill="none"
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        stroke={accentColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />

      {/* 7-day SMA trend line — thicker, dashed */}
      {smaLine ? (
        <polyline
          fill="none"
          opacity={0.7}
          points={smaLine}
          stroke={accentColor}
          strokeDasharray="6 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
        />
      ) : null}

      {/* Data point dots */}
      {points.map((point, index) => (
        <circle
          cx={point.x}
          cy={point.y}
          fill={accentColor}
          key={index}
          opacity={0.6}
          r={2}
        />
      ))}
    </svg>
  );
}

interface WeightLogRow extends Record<string, unknown> {
  bodyFat: string;
  date: string;
  id: number;
  weight: string;
}

function RecentWeightTable({ bodyLogs }: { bodyLogs: BodyLogRecord[] }) {
  const rows: WeightLogRow[] = bodyLogs.slice(0, 10).map((log) => ({
    bodyFat: log.bodyFatPct ? `${log.bodyFatPct}%` : "\u2014",
    date: log.date,
    id: log.id,
    weight: log.weightKg ? `${log.weightKg} kg` : "\u2014",
  }));

  return (
    <Table
      aria-label="Recent weight log entries"
      columns={[
        { header: "Date", key: "date", width: proportional(1) },
        { header: "Weight", key: "weight", width: proportional(1) },
        { header: "Body Fat", key: "bodyFat", width: proportional(1) },
      ]}
      data={rows}
      density="compact"
      idKey="id"
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
    if (volume.length === 0) {
      return;
    }
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
      if (i > volume.length) {
        clearInterval(timer);
      }
    }, 80);
    return () => clearInterval(timer);
  }, [volume.length]);

  if (volume.length === 0) {
    return (
      <EmptyState
        description="No training data in the last 7 days. Log a workout to see volume analysis."
        icon={<BarChartIcon />}
        isCompact
        title="No training data"
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
            visible={index < visibleCount}
            volume={mv}
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
    <VStack aria-hidden={!visible} gap={1}>
      <HStack hAlign="between" vAlign="center" wrap="wrap">
        <Text weight="semibold">
          {capitalizeMuscleGroup(volume.muscle_group)}
        </Text>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Text hasTabularNumbers>{volume.total_sets} sets</Text>
          <Text type="supporting">
            ({volume.min_recommended}&ndash;{volume.max_recommended} optimal)
          </Text>
          <Badge label={status.label} variant={status.variant} />
        </HStack>
      </HStack>
      {visible ? (
        <ProgressBar
          isLabelHidden
          label={`${capitalizeMuscleGroup(volume.muscle_group)} weekly volume`}
          max={bar.max}
          value={bar.value}
          variant={bar.variant}
        />
      ) : (
        <ProgressBar
          isLabelHidden
          label={`${capitalizeMuscleGroup(volume.muscle_group)} weekly volume`}
          max={bar.max}
          value={0}
          variant="accent"
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
          description="No food logged in the last 7 days."
          icon={<MealIcon />}
          isCompact
          title="No food logged"
        />
      )}
    </VStack>
  );
}
