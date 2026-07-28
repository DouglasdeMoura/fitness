import { Badge, Button, Card, Collapsible, Dialog, DialogHeader, FormLayout, Grid, Heading, HStack, MetadataList, MetadataListItem, NumberInput, Table, Text, TextInput, VStack, proportional } from '@astryxdesign/core';
import type { TableColumn } from '@astryxdesign/core';
import { useToast } from "@astryxdesign/core/Toast";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useLogMealTemplate } from "~/components/nutrition/useLogMealTemplate";
import { ScrollableTable } from "~/components/ScrollableTable";
import { ToastUndoButton } from "~/components/ToastUndoButton";
import { addFoodLogEntry, copyMealFromDate, deleteFoodLogEntries } from '~/lib/api';
import type { MealTemplateSummary } from '~/lib/api';
import type { FoodLogEntry } from "~/lib/db";
import {
  canCopyMealFromDate,
  entriesForMeal,
  previousDay,
} from "~/lib/food-log-copy";
import { formatDisplayInteger } from "~/lib/format-number";
import { sortTemplatesForMealSection } from "~/lib/meal-template-log";
import { MEAL_TYPE_LABELS, MEAL_TYPES, buildQuickAddDraft, isApproximateFoodLogEntry, mealSubtotals } from '~/lib/nutrition';
import type { MealType, NutritionTotals, QuickAddInput } from '~/lib/nutrition';
import { runOrQueue } from "~/lib/offline";
import {
  copyCompletedBody,
  foodLoggedBody,
  mutationFailedBody,
  TOAST_DURATION_MS,
} from "~/lib/toasts";

type RequestDeleteFoodEntry = (entry: FoodLogEntry) => void;
type CopyMealFromYesterday = (mealType: MealType) => Promise<void>;
type FoodLogRow = FoodLogEntry & { food_name?: string | null };

/**
 * Displays food entries grouped by meal with copy-from-yesterday shortcuts.
 * @example <FoodLogCard entries={entries} sourceDayEntries={yesterday} selectedDate="2026-07-25" onDeleteEntry={requestDelete} />
 */
export function FoodLogCard({
  entries,
  sourceDayEntries,
  selectedDate,
  mealTemplates,
  onDeleteEntry,
}: {
  entries: FoodLogRow[];
  sourceDayEntries: FoodLogRow[];
  selectedDate: string;
  mealTemplates: MealTemplateSummary[];
  onAddMeal?: () => void;
  onDeleteEntry: RequestDeleteFoodEntry;
}) {
  const copyMeal = useCopyMealFromYesterday(selectedDate, sourceDayEntries);

  return (
    <VStack gap={5}>
      {entries.length === 0 ? (
        <Text type="supporting">
          No food logged yet. Use the quick-add or log-food buttons to get
          started.
        </Text>
      ) : undefined}
      {MEAL_TYPES.map((mealType) => (
        <MealLogSection
          key={mealType}
          mealType={mealType}
          entries={entriesForMeal(entries, mealType)}
          mealTemplates={mealTemplates}
          selectedDate={selectedDate}
          showCopyAction={canCopyMealFromDate(
            entries,
            sourceDayEntries,
            mealType
          )}
          onCopy={() => copyMeal(mealType)}
          onDelete={onDeleteEntry}
        />
      ))}
    </VStack>
  );
}

/**
 * Collapsible section for one meal type showing a calorie-subtotal trigger,
 * per-meal macro MetadataList, and the entry table with quick-add/template
 * actions (PRD 06 Batch 2).
 */
function MealLogSection({
  mealType,
  entries,
  mealTemplates,
  selectedDate,
  showCopyAction,
  onCopy,
  onDelete,
}: {
  mealType: MealType;
  entries: FoodLogRow[];
  mealTemplates: MealTemplateSummary[];
  selectedDate: string;
  showCopyAction: boolean;
  onCopy: () => void;
  onDelete: RequestDeleteFoodEntry;
}) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const mealLabel = MEAL_TYPE_LABELS[mealType];
  const sectionTemplates = sortTemplatesForMealSection(mealTemplates, mealType);
  const logTemplate = useLogMealTemplate(selectedDate);
  const logQuickAdd = useQuickAddFood(selectedDate, mealType);
  const hasTemplateActions = sectionTemplates.length > 0;
  const subtotals = mealSubtotals(entries);
  const hasEntries = entries.length > 0;

  const triggerContent = (
    <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
      <HStack gap={2} vAlign="end">
        <Heading level={3}>{mealLabel}</Heading>
        {hasEntries ? (
          <Text type="supporting" hasTabularNumbers>
            {formatDisplayInteger(subtotals.calories)} kcal
          </Text>
        ) : (
          <Text type="supporting">0 kcal</Text>
        )}
      </HStack>
    </HStack>
  );

  return (
    <Collapsible trigger={triggerContent} defaultIsOpen={hasEntries}>
      <VStack gap={3}>
        {hasEntries ? (
          <MetadataList>
            <MetadataListItem label="Calories">
              <Text hasTabularNumbers>
                {formatDisplayInteger(subtotals.calories)} kcal
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Protein">
              <Text hasTabularNumbers>
                {formatDisplayInteger(subtotals.protein_g)} g
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Carbs">
              <Text hasTabularNumbers>
                {formatDisplayInteger(subtotals.carbs_g)} g
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Fat">
              <Text hasTabularNumbers>
                {formatDisplayInteger(subtotals.fat_g)} g
              </Text>
            </MetadataListItem>
          </MetadataList>
        ) : undefined}
        <HStack gap={2} wrap="wrap">
          <Button
            label={`Quick add to ${mealLabel.toLowerCase()}`}
            variant="secondary"
            size="lg"
            clickAction={() => setQuickAddOpen(true)}
          >
            Quick add
          </Button>
          {showCopyAction ? (
            <Button
              label={`Copy ${mealLabel.toLowerCase()} from yesterday`}
              variant="secondary"
              size="lg"
              clickAction={onCopy}
            >
              Copy from yesterday
            </Button>
          ) : undefined}
        </HStack>
        {hasTemplateActions ? (
          <VStack gap={1}>
            <Text type="label">Log a saved meal</Text>
            {sectionTemplates.map((template) => (
              <Button
                key={template.id}
                label={`${template.name} — ${formatDisplayInteger(template.totals.calories)} kcal`}
                variant="ghost"
                size="lg"
                clickAction={() =>
                  logTemplate({
                    expectedKcal: template.totals.calories,
                    mealType,
                    templateId: template.id,
                  })
                }
              />
            ))}
          </VStack>
        ) : undefined}
        {hasEntries ? (
          <ScrollableTable scrollLabel={`food-log-${mealType}`}>
            <Table
              aria-label={`${mealLabel} food log`}
              columns={foodLogColumns(onDelete)}
              data={entries}
              idKey="id"
              density="compact"
              hasHover
            />
          </ScrollableTable>
        ) : undefined}
        {quickAddOpen ? (
          <QuickAddDialog
            mealLabel={mealLabel}
            isOpen={quickAddOpen}
            onOpenChange={setQuickAddOpen}
            onSubmit={logQuickAdd}
          />
        ) : undefined}
      </VStack>
    </Collapsible>
  );
}

function QuickAddDialog({
  mealLabel,
  isOpen,
  onOpenChange,
  onSubmit,
}: {
  mealLabel: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: QuickAddInput) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: {
      calories: 0,
      carbs_g: 0,
      fat_g: 0,
      name: "",
      protein_g: 0,
    },
    onSubmit: async ({ value, formApi }) => {
      if (!value.calories || value.calories <= 0) {return;}
      await onSubmit({
        calories: value.calories,
        carbs_g: value.carbs_g > 0 ? value.carbs_g : undefined,
        fat_g: value.fat_g > 0 ? value.fat_g : undefined,
        name: value.name,
        protein_g: value.protein_g > 0 ? value.protein_g : undefined,
      });
      formApi.reset();
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={360}
    >
      <DialogHeader
        title={`Quick add — ${mealLabel}`}
        subtitle="Approximate calories still count toward your daily total."
        onOpenChange={onOpenChange}
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <VStack gap={3}>
          <FormLayout>
            <form.Field name="name">
              {(field) => (
                <TextInput
                  label="Name"
                  value={field.state.value}
                  onChange={field.handleChange}
                  placeholder="e.g. Office lunch"
                  isOptional
                />
              )}
            </form.Field>
            <form.Field name="calories">
              {(field) => (
                <NumberInput
                  label="Calories"
                  value={field.state.value}
                  onChange={field.handleChange}
                  min={1}
                  isRequired
                />
              )}
            </form.Field>
            <Grid columns={{ minWidth: 120 }} gap={2}>
              <form.Field name="protein_g">
                {(field) => (
                  <NumberInput
                    label="Protein (g)"
                    value={field.state.value}
                    onChange={field.handleChange}
                    min={0}
                    isOptional
                  />
                )}
              </form.Field>
              <form.Field name="carbs_g">
                {(field) => (
                  <NumberInput
                    label="Carbs (g)"
                    value={field.state.value}
                    onChange={field.handleChange}
                    min={0}
                    isOptional
                  />
                )}
              </form.Field>
              <form.Field name="fat_g">
                {(field) => (
                  <NumberInput
                    label="Fat (g)"
                    value={field.state.value}
                    onChange={field.handleChange}
                    min={0}
                    isOptional
                  />
                )}
              </form.Field>
            </Grid>
          </FormLayout>
          <HStack gap={2} hAlign="end" wrap="wrap">
            <Button
              label="Cancel quick add"
              variant="secondary"
              size="lg"
              clickAction={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              label="Log quick add"
              variant="primary"
              size="lg"
              type="submit"
            />
          </HStack>
        </VStack>
      </form>
    </Dialog>
  );
}

function useQuickAddFood(selectedDate: string, mealType: MealType) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return async (input: QuickAddInput) => {
    const entry = buildQuickAddDraft(input, selectedDate, mealType);
    try {
      const outcome = await runOrQueue("addFoodLogEntry", entry, () =>
        addFoodLogEntry({ data: entry })
      );
      toast({ body: foodLoggedBody() });
      if (!outcome.queued) {
        await queryClient.invalidateQueries({
          queryKey: ["food-log", selectedDate],
        });
      }
    } catch {
      toast({ body: mutationFailedBody("Log food"), type: "error" });
      throw new Error("quick add failed");
    }
  };
}

function useInvalidateFoodLog(selectedDate: string) {
  const queryClient = useQueryClient();
  const sourceDate = previousDay(selectedDate);

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["food-log", selectedDate] }),
      queryClient.invalidateQueries({ queryKey: ["food-log", sourceDate] }),
    ]);
  };
}

function useCopyMealFromYesterday(
  selectedDate: string,
  sourceDayEntries: FoodLogRow[]
): CopyMealFromYesterday {
  const toast = useToast();
  const invalidateFoodLog = useInvalidateFoodLog(selectedDate);
  const sourceDate = previousDay(selectedDate);

  return async (mealType) => {
    const payload = { fromDate: sourceDate, mealType, toDate: selectedDate };
    try {
      const outcome = await runOrQueue("copyMealFromDate", payload, () =>
        copyMealFromDate({ data: payload })
      );
      if (!outcome.queued) {
        await invalidateFoodLog();
        const entryIds = outcome.result.entries.map((entry) => entry.id);
        let dismiss = () => {};
        dismiss = toast({
          autoHideDuration: TOAST_DURATION_MS.undo,
          body: copyCompletedBody(entryIds.length),
          endContent: (
            <ToastUndoButton
              onUndo={async () => {
                dismiss();
                try {
                  await runOrQueue(
                    "deleteFoodLogEntries",
                    { ids: entryIds },
                    () => deleteFoodLogEntries({ data: { ids: entryIds } })
                  );
                  await invalidateFoodLog();
                } catch {
                  toast({
                    body: mutationFailedBody("Undo copy"),
                    type: "error",
                  });
                }
              }}
            />
          ),
        });
        return;
      }
      toast({
        body: copyCompletedBody(
          entriesForMeal(sourceDayEntries, mealType).length
        ),
      });
    } catch {
      toast({ body: mutationFailedBody("Copy meal"), type: "error" });
    }
  };
}

function foodEntryName(entry: FoodLogRow): string {
  return entry.custom_name || entry.food_name || `Food #${entry.food_id}`;
}

function foodEntryLabel(entry: FoodLogRow) {
  return (
    <HStack gap={1} vAlign="center">
      <Text>{foodEntryName(entry)}</Text>
      {isApproximateFoodLogEntry(entry) ? (
        <Badge variant="warning" label="Approximate" />
      ) : undefined}
    </HStack>
  );
}

const FOOD_LOG_COLUMNS: TableColumn<FoodLogRow>[] = [
  {
    header: "Food",
    key: "custom_name",
    renderCell: foodEntryLabel,
    width: proportional(2),
  },
  {
    align: "end",
    header: "Calories",
    key: "calories",
    renderCell: (entry) => (
      <Text hasTabularNumbers>{formatDisplayInteger(entry.calories)}</Text>
    ),
    width: proportional(1),
  },
  {
    header: "P / C / F",
    key: "macros",
    renderCell: (entry) => (
      <Text type="supporting" hasTabularNumbers>
        {formatDisplayInteger(entry.protein_g)} /{" "}
        {formatDisplayInteger(entry.carbs_g)} /{" "}
        {formatDisplayInteger(entry.fat_g)} g
      </Text>
    ),
    width: proportional(1),
  },
];

function foodLogColumns(
  onDelete: RequestDeleteFoodEntry
): TableColumn<FoodLogRow>[] {
  return [
    ...FOOD_LOG_COLUMNS,
    {
      align: "end",
      header: "Actions",
      key: "actions",
      renderCell: (entry) => (
        <Button
          label={`Delete ${foodEntryName(entry)}`}
          variant="destructive"
          size="lg"
          clickAction={() => onDelete(entry)}
        >
          Delete
        </Button>
      ),
    },
  ];
}
