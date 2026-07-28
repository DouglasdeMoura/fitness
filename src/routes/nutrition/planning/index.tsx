import type { TableColumn } from "@astryxdesign/core";
import {
  Button,
  Card,
  EmptyState,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  ProgressBar,
  proportional,
  Selector,
  Table,
  Text,
  VStack,
} from "@astryxdesign/core";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataLoadErrorView } from "~/components/data-load-error-banner";
import { TemplateIcon } from "~/components/icons/fit-track-icons";
import { NutritionSkeleton } from "~/components/loading/page-skeletons";
import type { MealTemplateSummary, WeekMealPlan } from "~/lib/api";
import {
  clearMealPlan,
  getMealTemplates,
  getWeekMealPlan,
  logMealFromPlan,
  setMealPlan,
} from "~/lib/api";
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import { formatDisplayInteger } from "~/lib/format-number";
import type { MealType } from "~/lib/nutrition";
import { addDays, MEAL_TYPE_LABELS, MEAL_TYPES } from "~/lib/nutrition";

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
        if (!slot) {
          return <Text type="supporting">Unavailable</Text>;
        }
        return (
          <VStack gap={2}>
            <Selector
              isLabelHidden
              label={`${day.day_label} ${MEAL_TYPE_LABELS[mealType]}`}
              onChange={(value) =>
                assignTemplate(slot.date, mealType, String(value))
              }
              options={templateOptions}
              value={slot.template_id?.toString() ?? ""}
            />
            {slot.template_id ? (
              <VStack gap={1}>
                <Text hasTabularNumbers>
                  {formatDisplayInteger(slot.macros.calories)} kcal
                </Text>
                <Text hasTabularNumbers type="supporting">
                  P {formatDisplayInteger(slot.macros.protein_g)} · C{" "}
                  {formatDisplayInteger(slot.macros.carbs_g)} · F{" "}
                  {formatDisplayInteger(slot.macros.fat_g)}
                </Text>
                <Button
                  clickAction={() => logMeal(slot.date, mealType)}
                  label={`Log ${slot.template_name} for ${day.day_label} ${MEAL_TYPE_LABELS[mealType]}`}
                  size="sm"
                  variant="secondary"
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
            <Text hasTabularNumbers weight="bold">
              {formatDisplayInteger(day.day_totals.calories)} kcal
            </Text>
            <Text hasTabularNumbers type="supporting">
              P {formatDisplayInteger(day.day_totals.protein_g)} · C{" "}
              {formatDisplayInteger(day.day_totals.carbs_g)} · F{" "}
              {formatDisplayInteger(day.day_totals.fat_g)}
            </Text>
            <ProgressBar
              formatValueLabel={() =>
                `${formatDisplayInteger(caloriePercent)}% of target`
              }
              hasValueLabel
              label={`${day.day_label} calorie target`}
              max={dailyTargetCalories || 1}
              value={Math.min(day.day_totals.calories, dailyTargetCalories)}
              variant={caloriePercent > 100 ? "error" : "accent"}
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
        query={failedQuery}
        title="Failed to load meal plan"
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
      <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
        <Heading level={1}>Weekly Meal Plan</Heading>
        <HStack gap={2} wrap="wrap">
          <Button
            href="/nutrition"
            label="Back"
            size="sm"
            variant="secondary"
          />
          <Button
            href="/nutrition/templates"
            label="Templates"
            size="sm"
            variant="secondary"
          />
        </HStack>
      </HStack>

      <Card>
        <VStack gap={3}>
          <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
            <Heading level={2}>
              {weekPlan.start_date} — {weekPlan.end_date}
            </Heading>
            <HStack gap={2} wrap="wrap">
              <Button
                clickAction={() => shiftWeek(-1)}
                label="Previous week"
                size="sm"
                variant="secondary"
              >
                ← Prev
              </Button>
              <Button
                clickAction={() => setWeekStart(undefined)}
                label="This Week"
                size="sm"
                variant="secondary"
              />
              <Button
                clickAction={() => shiftWeek(1)}
                label="Next week"
                size="sm"
                variant="secondary"
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
              description="Templates provide the foods and macros used by each planned meal."
              headingLevel={2}
              icon={<TemplateIcon />}
              title="Create a meal template first"
            />
            <Button
              href="/nutrition/templates"
              label="Create Template"
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
          density="compact"
          hasHover
          idKey="date"
        />
      )}
    </VStack>
  );
}
