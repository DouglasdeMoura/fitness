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
} from "@astryxdesign/core";
import { createFileRoute } from "@tanstack/react-router";

import { CalorieRing } from "~/components/calorie-ring";
import { DataLoadErrorView } from "~/components/data-load-error-banner";
import {
  NutritionIcon,
  ProgressIcon,
  ReviewIcon,
  WorkoutIcon,
} from "~/components/icons/fit-track-icons";
import { DashboardSkeleton } from "~/components/loading/page-skeletons";
import {
  getConsistency,
  getDashboardStats,
  getWeeklyReviewAvailability,
} from "~/lib/api";
import type { MacroTone } from "~/lib/dashboard";
import {
  calorieRemainingLabel,
  isFirstTimeUser,
  macroProgress,
} from "~/lib/dashboard";
import {
  dashboardLoaderDeps,
  loadDashboardRouteData,
  parseDashboardSearch,
} from "~/lib/dashboard-route";
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import {
  formatDisplayDecimal,
  formatDisplayInteger,
} from "~/lib/format-number";

export const Route = createFileRoute("/")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard - FitTrack" }] }),
  loader: async ({ deps }) => loadDashboardRouteData(dashboardLoaderDeps(deps)),
  loaderDeps: ({ search }) => parseDashboardSearch(search),
  pendingComponent: DashboardSkeleton,
  validateSearch: parseDashboardSearch,
});

export function DashboardPage() {
  return <DashboardPageContent />;
}

function DashboardPageContent() {
  const loaderData = Route.useLoaderData();
  const { asOf } = loaderData;
  const dashboardQuery = useDataLoadQuery({
    initialData: {
      consistency: loaderData.consistency,
      stats: loaderData.stats,
      weeklyReview: loaderData.weeklyReview,
    },
    queryFn: async () => ({
      consistency: await getConsistency({ data: { asOf } }),
      stats: await getDashboardStats(),
      weeklyReview: await getWeeklyReviewAvailability({ data: { asOf } }),
    }),
    queryKey: ["dashboard", asOf],
  });

  if (isDataLoadPending(dashboardQuery)) {
    return <DashboardSkeleton />;
  }

  const failedQuery = pickFailedDataLoadQuery([dashboardQuery]);
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Dashboard"
        query={failedQuery}
        title="Failed to load dashboard"
      />
    );
  }

  const dashboard = dashboardQuery.data!;
  const { stats, consistency, weeklyReview } = dashboard;
  const { consumed, targets, user, workoutDaysThisMonth } = stats;

  const today = new Date().toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });

  const showWelcome = isFirstTimeUser(stats);

  if (showWelcome) {
    return (
      <VStack as="main" gap={6}>
        <VStack gap={1}>
          <Heading level={1}>Dashboard</Heading>
          <Text type="supporting">{today}</Text>
        </VStack>
        <EmptyState
          actions={
            <Button
              href="/settings"
              label="Set up your targets"
              variant="primary"
            />
          }
          description="Set up your nutrition targets to get started with personalized calorie and macro tracking."
          icon={<NutritionIcon />}
          title="Welcome to FitTrack"
        />
      </VStack>
    );
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
          <CalorieRing consumed={consumed.calories} target={targets.calories} />
          <Text hasTabularNumbers size="4xl" weight="bold">
            {formatDisplayInteger(consumed.calories)}
          </Text>
          <Text type="supporting">
            of {formatDisplayInteger(targets.calories)} kcal
          </Text>
          <Text
            color={consumed.calories > targets.calories ? "accent" : undefined}
            type="body"
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
            consumed={Math.round(consumed.protein_g)}
            label="Protein"
            target={targets.protein_g}
            tone="success"
          />
          <MacroBar
            consumed={Math.round(consumed.carbs_g)}
            label="Carbs"
            target={targets.carbs_g}
            tone="warning"
          />
          <MacroBar
            consumed={Math.round(consumed.fat_g)}
            label="Fat"
            target={targets.fat_g}
            tone="accent"
          />
        </VStack>
      </Card>

      {/* Secondary stats grid */}
      <Grid columns={{ max: 3, minWidth: 200 }} gap={4}>
        <Card padding={4}>
          <VStack gap={1}>
            <Text type="label">Current Weight</Text>
            <Text hasTabularNumbers size="2xl" weight="bold">
              {targets.weightKg
                ? `${formatDisplayDecimal(targets.weightKg)} kg`
                : "\u2014"}
            </Text>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={1}>
            <Text type="label">TDEE</Text>
            <Text hasTabularNumbers size="2xl" weight="bold">
              {targets.tdee
                ? `${formatDisplayInteger(targets.tdee)} kcal`
                : "\u2014"}
            </Text>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={1}>
            <Text type="label">Workouts (30d)</Text>
            <Text hasTabularNumbers size="2xl" weight="bold">
              {workoutDaysThisMonth}
            </Text>
            <Text type="supporting">sessions logged</Text>
          </VStack>
        </Card>
      </Grid>

      {/* Quick Actions — prominent ClickableCards */}
      <VStack gap={3}>
        <Text type="label">Quick Actions</Text>
        <Grid columns={{ max: 2, minWidth: 180 }} gap={4}>
          <ClickableCard href="/nutrition" label="Log your meals" padding={4}>
            <HStack gap={3} vAlign="center">
              <NutritionIcon />
              <VStack gap={0.5}>
                <Text weight="semibold">Log Food</Text>
                <Text type="supporting">Track your daily nutrition</Text>
              </VStack>
            </HStack>
          </ClickableCard>
          <ClickableCard href="/workout" label="Start a workout" padding={4}>
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
      <Card aria-label="Consistency tracking" padding={4}>
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
              <VStack gap={1} hAlign="center" key={day.date}>
                <StatusDot
                  label={
                    day.logged
                      ? `${day.weekday} food logged`
                      : `${day.weekday} no food log`
                  }
                  variant={day.logged ? "success" : "neutral"}
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
                label={user.goalType.replaceAll("_", " ")}
                variant="purple"
              />
            </MetadataListItem>
            <MetadataListItem label="Activity Level">
              {user.activityLevel.replaceAll("_", " ")}
            </MetadataListItem>
            <MetadataListItem label="Daily Calorie Target">
              {targets.calories} kcal
            </MetadataListItem>
          </MetadataList>
        </VStack>
      </Card>
    </VStack>
  );
}

function MacroBar({
  label,
  consumed,
  target,
  tone,
}: {
  label: string;
  consumed: number;
  target: number;
  tone: MacroTone;
}) {
  const state = macroProgress(consumed, target, tone);
  return (
    <VStack gap={1}>
      <HStack justify="between" vAlign="end">
        <Text type="label">{label}</Text>
        <Text type="body" weight="semibold">
          {formatDisplayInteger(consumed)} / {formatDisplayInteger(target)} g
        </Text>
      </HStack>
      <ProgressBar
        isLabelHidden
        label={`${label} consumed`}
        max={state.max}
        value={state.value}
        variant={state.variant}
      />
    </VStack>
  );
}
