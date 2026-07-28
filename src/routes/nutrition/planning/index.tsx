import {
  Button,
  Card,
  EmptyState,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  ProgressBar,
  Selector,
  Table,
  Text,
  VStack,
  proportional,
  type TableColumn,
} from "@astryxdesign/core";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DataLoadErrorView } from "~/components/DataLoadErrorBanner";
import { NutritionSkeleton } from "~/components/loading/PageSkeletons";
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import {
  clearMealPlan,
  getMealTemplates,
  getWeekMealPlan,
  logMealFromPlan,
  setMealPlan,
  type MealTemplateSummary,
  type WeekMealPlan,
} from "~/lib/api";
import { addDays, MEAL_TYPE_LABELS, MEAL_TYPES, type MealType } from "~/lib/nutrition";

export const Route = createFileRoute("/nutrition/planning/")({
  head: () => ({ meta: [{ title: "Meal Planning - FitTrack" }] }),
  component: MealPlanningPage,
});

type WeekPlanDay = WeekMealPlan["days"][number];
type AssignMealTemplate = (date: string, mealType: MealType, templateId: string) => Promise<void>;
type LogPlannedMeal = (date: string, mealType: MealType) => Promise<void>;

function mealPlanColumns(
  templates: MealTemplateSummary[],
  dailyTargetCalories: number,
  assignTemplate: AssignMealTemplate,
  logMeal: LogPlannedMeal,
): TableColumn<WeekPlanDay>[] {
  const templateOptions = [
    { value: "", label: "— None —" },
    ...templates.map((template) => ({
      value: String(template.id),
      label: template.name,
    })),
  ];
  const mealColumns = MEAL_TYPES.map(
    (mealType): TableColumn<WeekPlanDay> => ({
      key: mealType,
      header: MEAL_TYPE_LABELS[mealType],
      width: proportional(2),
      renderCell: (day) => {
        const slot = day.slots.find((candidate) => candidate.meal_type === mealType);
        if (!slot) return <Text type="supporting">Unavailable</Text>;
        return (
          <VStack gap={2}>
            <Selector
              label={`${day.day_label} ${MEAL_TYPE_LABELS[mealType]}`}
              isLabelHidden
              value={slot.template_id?.toString() ?? ""}
              onChange={(value) => assignTemplate(slot.date, mealType, String(value))}
              options={templateOptions}
            />
            {slot.template_id ? (
              <VStack gap={1}>
                <Text hasTabularNumbers>{Math.round(slot.macros.calories)} kcal</Text>
                <Text type="supporting" hasTabularNumbers>
                  P {Math.round(slot.macros.protein_g)} · C {Math.round(slot.macros.carbs_g)} · F{" "}
                  {Math.round(slot.macros.fat_g)}
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
    }),
  );
  return [
    {
      key: "day_label",
      header: "Day",
      width: proportional(1),
      renderCell: (day) => <Text weight="bold">{day.day_label}</Text>,
    },
    ...mealColumns,
    {
      key: "daily_total",
      header: "Daily Total",
      width: proportional(2),
      renderCell: (day) => {
        const caloriePercent =
          dailyTargetCalories > 0 ? (day.day_totals.calories / dailyTargetCalories) * 100 : 0;
        return (
          <VStack gap={2}>
            <Text weight="bold" hasTabularNumbers>
              {Math.round(day.day_totals.calories)} kcal
            </Text>
            <Text type="supporting" hasTabularNumbers>
              P {Math.round(day.day_totals.protein_g)} · C {Math.round(day.day_totals.carbs_g)} · F{" "}
              {Math.round(day.day_totals.fat_g)}
            </Text>
            <ProgressBar
              label={`${day.day_label} calorie target`}
              value={Math.min(day.day_totals.calories, dailyTargetCalories)}
              max={dailyTargetCalories || 1}
              variant={caloriePercent > 100 ? "error" : "accent"}
              hasValueLabel
              formatValueLabel={() => `${Math.round(caloriePercent)}% of target`}
            />
          </VStack>
        );
      },
    },
  ];
}

function MealPlanningPage() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const weekPlanQuery = useDataLoadQuery({
    queryKey: ["week-meal-plan", weekStart],
    queryFn: () => getWeekMealPlan({ data: { start_date: weekStart } }),
  });
  const templatesQuery = useDataLoadQuery({
    queryKey: ["meal-templates"],
    queryFn: () => getMealTemplates(),
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

  const handleAssign: AssignMealTemplate = async (date, mealType, templateId) => {
    if (!templateId) {
      await clearMealPlan({ data: { date, meal_type: mealType } });
    } else {
      await setMealPlan({
        data: {
          date,
          meal_type: mealType,
          template_id: Number.parseInt(templateId, 10),
        },
      });
    }
    await queryClient.invalidateQueries({ queryKey: ["week-meal-plan"] });
  };

  const handleLogMeal: LogPlannedMeal = async (date, mealType) => {
    await logMealFromPlan({ data: { date, meal_type: mealType } });
    await queryClient.invalidateQueries({ queryKey: ["food-log"] });
    window.alert(`Logged ${MEAL_TYPE_LABELS[mealType].toLowerCase()} to your food diary.`);
  };

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>Weekly Meal Plan</Heading>
        <HStack gap={2} wrap="wrap">
          <Button label="Back" href="/nutrition" variant="secondary" size="sm" />
          <Button label="Templates" href="/nutrition/templates" variant="secondary" size="sm" />
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
              {Math.round(weekPlan.week_totals.calories)} kcal
            </MetadataListItem>
            <MetadataListItem label="Protein">
              {Math.round(weekPlan.week_totals.protein_g)}g
            </MetadataListItem>
            <MetadataListItem label="Carbs">
              {Math.round(weekPlan.week_totals.carbs_g)}g
            </MetadataListItem>
            <MetadataListItem label="Fat">
              {Math.round(weekPlan.week_totals.fat_g)}g
            </MetadataListItem>
          </MetadataList>
        </VStack>
      </Card>

      {templates.length === 0 ? (
        <Card>
          <VStack gap={3}>
            <EmptyState
              title="Create a meal template first"
              description="Templates provide the foods and macros used by each planned meal."
              headingLevel={2}
            />
            <Button label="Create Template" href="/nutrition/templates" variant="primary" />
          </VStack>
        </Card>
      ) : (
        <Table
          aria-label="Weekly meal plan"
          columns={mealPlanColumns(
            templates,
            weekPlan.targets.calories,
            handleAssign,
            handleLogMeal,
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
