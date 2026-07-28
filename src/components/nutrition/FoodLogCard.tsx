import type { TableColumn } from "@astryxdesign/core";
import {
  Badge,
  Button,
  Collapsible,
  Dialog,
  DialogHeader,
  FormLayout,
  Grid,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  NumberInput,
  proportional,
  Table,
  Text,
  TextInput,
  VStack,
} from "@astryxdesign/core";
import { useToast } from "@astryxdesign/core/Toast";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useLogMealTemplate } from "~/components/nutrition/useLogMealTemplate";
import { ScrollableTable } from "~/components/ScrollableTable";
import { ToastUndoButton } from "~/components/ToastUndoButton";
import type { MealTemplateSummary } from "~/lib/api";
import {
  addFoodLogEntry,
  copyMealFromDate,
  deleteFoodLogEntries,
} from "~/lib/api";
import type { FoodLogEntry } from "~/lib/db";
import {
  canCopyMealFromDate,
  entriesForMeal,
  previousDay,
} from "~/lib/food-log-copy";
import { formatDisplayInteger } from "~/lib/format-number";
import { sortTemplatesForMealSection } from "~/lib/meal-template-log";
import type { MealType, QuickAddInput } from "~/lib/nutrition";
import {
  buildQuickAddDraft,
  isApproximateFoodLogEntry,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  mealSubtotals,
} from "~/lib/nutrition";
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
      ) : null}
      {MEAL_TYPES.map((mealType) => (
        <MealLogSection
          entries={entriesForMeal(entries, mealType)}
          key={mealType}
          mealTemplates={mealTemplates}
          mealType={mealType}
          onCopy={() => copyMeal(mealType)}
          onDelete={onDeleteEntry}
          selectedDate={selectedDate}
          showCopyAction={canCopyMealFromDate(
            entries,
            sourceDayEntries,
            mealType
          )}
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
    <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
      <HStack gap={2} vAlign="end">
        <Heading level={3}>{mealLabel}</Heading>
        {hasEntries ? (
          <Text hasTabularNumbers type="supporting">
            {formatDisplayInteger(subtotals.calories)} kcal
          </Text>
        ) : (
          <Text type="supporting">0 kcal</Text>
        )}
      </HStack>
    </HStack>
  );

  return (
    <Collapsible defaultIsOpen={hasEntries} trigger={triggerContent}>
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
        ) : null}
        <HStack gap={2} wrap="wrap">
          <Button
            clickAction={() => setQuickAddOpen(true)}
            label={`Quick add to ${mealLabel.toLowerCase()}`}
            size="lg"
            variant="secondary"
          >
            Quick add
          </Button>
          {showCopyAction ? (
            <Button
              clickAction={onCopy}
              label={`Copy ${mealLabel.toLowerCase()} from yesterday`}
              size="lg"
              variant="secondary"
            >
              Copy from yesterday
            </Button>
          ) : null}
        </HStack>
        {hasTemplateActions ? (
          <VStack gap={1}>
            <Text type="label">Log a saved meal</Text>
            {sectionTemplates.map((template) => (
              <Button
                clickAction={() =>
                  logTemplate({
                    expectedKcal: template.totals.calories,
                    mealType,
                    templateId: template.id,
                  })
                }
                key={template.id}
                label={`${template.name} — ${formatDisplayInteger(template.totals.calories)} kcal`}
                size="lg"
                variant="ghost"
              />
            ))}
          </VStack>
        ) : null}
        {hasEntries ? (
          <ScrollableTable scrollLabel={`food-log-${mealType}`}>
            <Table
              aria-label={`${mealLabel} food log`}
              columns={foodLogColumns(onDelete)}
              data={entries}
              density="compact"
              hasHover
              idKey="id"
            />
          </ScrollableTable>
        ) : null}
        {quickAddOpen ? (
          <QuickAddDialog
            isOpen={quickAddOpen}
            mealLabel={mealLabel}
            onOpenChange={setQuickAddOpen}
            onSubmit={logQuickAdd}
          />
        ) : null}
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
      if (!value.calories || value.calories <= 0) {
        return;
      }
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
        onOpenChange={onOpenChange}
        subtitle="Approximate calories still count toward your daily total."
        title={`Quick add — ${mealLabel}`}
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
                  isOptional
                  label="Name"
                  onChange={field.handleChange}
                  placeholder="e.g. Office lunch"
                  value={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="calories">
              {(field) => (
                <NumberInput
                  isRequired
                  label="Calories"
                  min={1}
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </form.Field>
            <Grid columns={{ minWidth: 120 }} gap={2}>
              <form.Field name="protein_g">
                {(field) => (
                  <NumberInput
                    isOptional
                    label="Protein (g)"
                    min={0}
                    onChange={field.handleChange}
                    value={field.state.value}
                  />
                )}
              </form.Field>
              <form.Field name="carbs_g">
                {(field) => (
                  <NumberInput
                    isOptional
                    label="Carbs (g)"
                    min={0}
                    onChange={field.handleChange}
                    value={field.state.value}
                  />
                )}
              </form.Field>
              <form.Field name="fat_g">
                {(field) => (
                  <NumberInput
                    isOptional
                    label="Fat (g)"
                    min={0}
                    onChange={field.handleChange}
                    value={field.state.value}
                  />
                )}
              </form.Field>
            </Grid>
          </FormLayout>
          <HStack gap={2} hAlign="end" wrap="wrap">
            <Button
              clickAction={() => onOpenChange(false)}
              label="Cancel quick add"
              size="lg"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              label="Log quick add"
              size="lg"
              type="submit"
              variant="primary"
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
        let dismiss = () => {
          /* assigned below */
        };
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
        <Badge label="Approximate" variant="warning" />
      ) : null}
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
      <Text hasTabularNumbers type="supporting">
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
          clickAction={() => onDelete(entry)}
          label={`Delete ${foodEntryName(entry)}`}
          size="lg"
          variant="destructive"
        >
          Delete
        </Button>
      ),
    },
  ];
}
