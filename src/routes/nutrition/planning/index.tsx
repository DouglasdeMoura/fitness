import { Button, Card, EmptyState, Heading, HStack, MetadataList, MetadataListItem, ProgressBar, Selector, Table, Text, VStack, proportional } from '@astryxdesign/core';
import type { TableColumn } from '@astryxdesign/core';
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataLoadErrorView } from "~/components/DataLoadErrorBanner";
import { TemplateIcon } from "~/components/icons/FitTrackIcons";
import { NutritionSkeleton } from "~/components/loading/PageSkeletons";
import { clearMealPlan, getMealTemplates, getWeekMealPlan, logMealFromPlan, setMealPlan } from '~/lib/api';
import type { MealTemplateSummary, WeekMealPlan } from '~/lib/api';
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import { formatDisplayInteger } from "~/lib/format-number";
import { addDays, MEAL_TYPE_LABELS, MEAL_TYPES } from '~/lib/nutrition';
import type { MealType } from '~/lib/nutrition';

export const Route = createFileRoute("/nutrition/planning/")({
  component: MealPlanningPage,
  head: () => ({ meta: [{ title: "Meal Planning - FitTrack" }] }),
});

type WeekPlanDay = WeekMealPlan["days"][number];
type AssignMealTemplate = (
  date: string,
  mealType: MealType,
  templateId: string
) => Promise<void>;
type LogPlannedMeal = (date: string, mealType: MealType) => Promise<void>;

function mealPlanColumns(
  templates: MealTemplateSummary[],
  dailyTargetCalories: number,
  assignTemplate: AssignMealTemplate,
  logMeal: LogPlannedMeal
): TableColumn<WeekPlanDay>[] {
  const templateOptions = [
    { label: "— None —", value: "" },
    ...templates.map((template) => ({
      label: template.name,
      value: String(template.id),
    })),
  ];
  const mealColumns = MEAL_TYPES.map(
    (mealType): TableColumn<WeekPlanDay> => ({
      header: MEAL_TYPE_LABELS[mealType],
      key: mealType,
      renderCell: (day) => {
        const slot = day.slots.find(
          (candidate) => candidate.meal_type === mealType
        );
        if (!slot) return <Text type="supporting">Unavailable</Text>;
        return (
          <VStack gap={2}>
            <Selector
              label={`${day.day_label} ${MEAL_TYPE_LABELS[mealType]}`}
              isLabelHidden
              value={slot.template_id?.toString() ?? ""}
              onChange={(value) =>
                assignTemplate(slot.date, mealType, String(value))
              }
              options={templateOptions}
            />
            {slot.template_id ? (
              <VStack gap={1}>
                <Text hasTabularNumbers>
                  {formatDisplayInteger(slot.macros.calories)} kcal
                </Text>
                <Text type="supporting" hasTabularNumbers>
                  P {formatDisplayInteger(slot.macros.protein_g)} · C{" "}
                  {formatDisplayInteger(slot.macros.carbs_g)} · F{" "}
                  {formatDisplayInteger(slot.macros.fat_g)}
                </Text>
                <Button
                  label={`Log ${slot.template_name} for ${day.day_label} ${MEAL_TYPE_LABELS[mealType]}`}
                  variant="secondary"
                  size="sm"
                  clickAction={() => logMeal(slot.date, mealType)}
                >
                  Log
                </Button>
              </VStack>
            ) : null}
          </VStack>
        );
      },
      width: proportional(2),
    })
  );
  return [
    {
      header: "Day",
      key: "day_label",
      renderCell: (day) => <Text weight="bold">{day.day_label}</Text>,
      width: proportional(1),
    },
    ...mealColumns,
    {
      header: "Daily Total",
      key: "daily_total",
      renderCell: (day) => {
        const caloriePercent =
          dailyTargetCalories > 0
            ? (day.day_totals.calories / dailyTargetCalories) * 100
            : 0;
        return (
          <VStack gap={2}>
            <Text weight="bold" hasTabularNumbers>
              {formatDisplayInteger(day.day_totals.calories)} kcal
            </Text>
            <Text type="supporting" hasTabularNumbers>
              P {formatDisplayInteger(day.day_totals.protein_g)} · C{" "}
              {formatDisplayInteger(day.day_totals.carbs_g)} · F{" "}
              {formatDisplayInteger(day.day_totals.fat_g)}
            </Text>
            <ProgressBar
              label={`${day.day_label} calorie target`}
              value={Math.min(day.day_totals.calories, dailyTargetCalories)}
              max={dailyTargetCalories || 1}
              variant={caloriePercent > 100 ? "error" : "accent"}
              hasValueLabel
              formatValueLabel={() =>
                `${formatDisplayInteger(caloriePercent)}% of target`
              }
            />
          </VStack>
        );
      },
      width: proportional(2),
    },
  ];
}

function MealPlanningPage() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState<string | undefined>();
  const weekPlanQuery = useDataLoadQuery({
    queryFn: () => getWeekMealPlan({ data: { start_date: weekStart } }),
    queryKey: ["week-meal-plan", weekStart],
  });
  const templatesQuery = useDataLoadQuery({
    queryFn: () => getMealTemplates(),
    queryKey: ["meal-templates"],
  });

  if (isDataLoadPending(weekPlanQuery) || isDataLoadPending(templatesQuery)) {
    return <NutritionSkeleton />;
  }

  const failedQuery = pickFailedDataLoadQuery([weekPlanQuery, templatesQuery]);
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Weekly Meal Plan"
        title="Failed to load meal plan"
        query={failedQuery}
      />
    );
  }

  const weekPlan = weekPlanQuery.data!;
  const templates = templatesQuery.data!;

  const shiftWeek = (direction: -1 | 1) => {
    setWeekStart(addDays(weekPlan.start_date, direction * 7));
  };

  const handleAssign: AssignMealTemplate = async (
    date,
    mealType,
    templateId
  ) => {
    if (templateId) {
      await setMealPlan({
        data: {
          date,
          meal_type: mealType,
          template_id: Number.parseInt(templateId, 10),
        },
      });
    } else {
      await clearMealPlan({ data: { date, meal_type: mealType } });
    }
    await queryClient.invalidateQueries({ queryKey: ["week-meal-plan"] });
  };

  const handleLogMeal: LogPlannedMeal = async (date, mealType) => {
    await logMealFromPlan({ data: { date, meal_type: mealType } });
    await queryClient.invalidateQueries({ queryKey: ["food-log"] });
    window.alert(
      `Logged ${MEAL_TYPE_LABELS[mealType].toLowerCase()} to your food diary.`
    );
  };

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>Weekly Meal Plan</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Back"
            href="/nutrition"
            variant="secondary"
            size="sm"
          />
          <Button
            label="Templates"
            href="/nutrition/templates"
            variant="secondary"
            size="sm"
          />
        </HStack>
      </HStack>

      <Card>
        <VStack gap={3}>
          <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
            <Heading level={2}>
              {weekPlan.start_date} — {weekPlan.end_date}
            </Heading>
            <HStack gap={2} wrap="wrap">
              <Button
                label="Previous week"
                variant="secondary"
                size="sm"
                clickAction={() => shiftWeek(-1)}
              >
                ← Prev
              </Button>
              <Button
                label="This Week"
                variant="secondary"
                size="sm"
                clickAction={() => setWeekStart(undefined)}
              />
              <Button
                label="Next week"
                variant="secondary"
                size="sm"
                clickAction={() => shiftWeek(1)}
              >
                Next →
              </Button>
            </HStack>
          </HStack>
          <MetadataList>
            <MetadataListItem label="Week calories">
              {formatDisplayInteger(weekPlan.week_totals.calories)} kcal
            </MetadataListItem>
            <MetadataListItem label="Protein">
              {formatDisplayInteger(weekPlan.week_totals.protein_g)}g
            </MetadataListItem>
            <MetadataListItem label="Carbs">
              {formatDisplayInteger(weekPlan.week_totals.carbs_g)}g
            </MetadataListItem>
            <MetadataListItem label="Fat">
              {formatDisplayInteger(weekPlan.week_totals.fat_g)}g
            </MetadataListItem>
          </MetadataList>
        </VStack>
      </Card>

      {templates.length === 0 ? (
        <Card>
          <VStack gap={3}>
            <EmptyState
              icon={<TemplateIcon />}
              title="Create a meal template first"
              description="Templates provide the foods and macros used by each planned meal."
              headingLevel={2}
            />
            <Button
              label="Create Template"
              href="/nutrition/templates"
              variant="primary"
            />
          </VStack>
        </Card>
      ) : (
        <Table
          aria-label="Weekly meal plan"
          columns={mealPlanColumns(
            templates,
            weekPlan.targets.calories,
            handleAssign,
            handleLogMeal
          )}
          data={weekPlan.days}
          idKey="date"
          density="compact"
          hasHover
        />
      )}
    </VStack>
  );
}
