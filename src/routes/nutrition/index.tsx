import { Button, Heading, HStack, VStack } from "@astryxdesign/core";
import { useToast } from "@astryxdesign/core/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { DataLoadErrorView } from "~/components/DataLoadErrorBanner";
import { DateNavigationBar } from "~/components/DateNavigationBar";
import { DeleteConfirmationDialog } from "~/components/DeleteConfirmationDialog";
import { NutritionSkeleton } from "~/components/loading/PageSkeletons";
import { FoodLogCard } from "~/components/nutrition/FoodLogCard";
import { FoodLogDialog } from "~/components/nutrition/FoodLogDialog";
import { StickyMacroHeader } from "~/components/nutrition/StickyMacroHeader";
import { ToastUndoButton } from "~/components/ToastUndoButton";
import {
  addFoodLogEntry,
  copyDayFromDate,
  deleteFoodLogEntries,
  deleteFoodLogEntry,
  getDailyTargets,
  getMealTemplates,
  getNutritionSummary,
} from "~/lib/api";
import {
  isDataLoadPending,
  pickFailedDataLoadQuery,
  useDataLoadQuery,
} from "~/lib/data-load-query";
import type { FoodLogEntry } from "~/lib/db";
import { deleteFoodEntryTitle } from "~/lib/delete-confirmation";
import { canCopyDayFromDate, previousDay } from "~/lib/food-log-copy";
import { parseSearchDate, resolveSelectedDate } from "~/lib/nutrition";
import { runOrQueue } from "~/lib/offline";
import {
  copyCompletedBody,
  entryDeletedBody,
  mutationFailedBody,
  TOAST_DURATION_MS,
} from "~/lib/toasts";

interface NutritionSearch {
  date?: string;
}

export const Route = createFileRoute("/nutrition/")({
  component: NutritionPage,
  head: () => ({ meta: [{ title: "Nutrition - FitTrack" }] }),
  loader: async ({ deps }) => {
    const selectedDate = resolveSelectedDate(deps.date);
    const sourceDate = previousDay(selectedDate);
    const [summary, sourceSummary, targets, mealTemplates] = await Promise.all([
      getNutritionSummary({ data: { date: selectedDate } }),
      getNutritionSummary({ data: { date: sourceDate } }),
      getDailyTargets(),
      getMealTemplates(),
    ]);
    return {
      selectedDate,
      sourceDate,
      summary,
      sourceSummary,
      targets,
      mealTemplates,
    };
  },
  loaderDeps: ({ search: { date } }) => ({ date }),
  pendingComponent: NutritionSkeleton,
  validateSearch: (search: Record<string, unknown>): NutritionSearch => ({
    date: parseSearchDate(
      typeof search.date === "string" ? search.date : undefined
    ),
  }),
});

function NutritionPage() {
  return <NutritionPageContent />;
}

function NutritionPageContent() {
  const { date: dateFromSearch } = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const selectedDate = resolveSelectedDate(dateFromSearch);
  const navigate = useNavigate({ from: Route.fullPath });
  const [pendingDeleteEntry, setPendingDeleteEntry] =
    useState<FoodLogEntry | null>(null);
  const [foodLogDialogOpen, setFoodLogDialogOpen] = useState(false);
  const confirmDeleteEntry = useConfirmDeleteFoodEntry(selectedDate);

  const sourceDate = previousDay(selectedDate);
  const summaryQuery = useDataLoadQuery({
    initialData:
      loaderData.selectedDate === selectedDate ? loaderData.summary : undefined,
    queryFn: () => getNutritionSummary({ data: { date: selectedDate } }),
    queryKey: ["food-log", selectedDate],
  });
  const sourceSummaryQuery = useDataLoadQuery({
    initialData:
      loaderData.selectedDate === selectedDate
        ? loaderData.sourceSummary
        : undefined,
    queryFn: () => getNutritionSummary({ data: { date: sourceDate } }),
    queryKey: ["food-log", sourceDate],
  });
  const targetsQuery = useDataLoadQuery({
    initialData: loaderData.targets,
    queryFn: () => getDailyTargets(),
    queryKey: ["targets"],
  });
  const mealTemplatesQuery = useDataLoadQuery({
    initialData: loaderData.mealTemplates,
    queryFn: () => getMealTemplates(),
    queryKey: ["meal-templates"],
  });
  const copyDay = useCopyDayFromYesterday(
    selectedDate,
    sourceSummaryQuery.data?.entries ?? []
  );

  if (
    isDataLoadPending(summaryQuery) ||
    isDataLoadPending(sourceSummaryQuery) ||
    isDataLoadPending(targetsQuery) ||
    isDataLoadPending(mealTemplatesQuery)
  ) {
    return <NutritionSkeleton />;
  }

  const failedQuery = pickFailedDataLoadQuery([
    summaryQuery,
    sourceSummaryQuery,
    targetsQuery,
    mealTemplatesQuery,
  ]);
  if (failedQuery) {
    return (
      <DataLoadErrorView
        heading="Nutrition"
        title="Failed to load nutrition data"
        query={failedQuery}
      />
    );
  }

  const summary = summaryQuery.data!;
  const sourceSummary = sourceSummaryQuery.data!;
  const targets = targetsQuery.data!;
  const mealTemplates = mealTemplatesQuery.data!;

  const handleDateChange = (nextDate: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        date: nextDate,
      }),
    });
  };

  return (
    <VStack as="main" gap={6}>
      <NutritionHeader
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        showCopyDay={canCopyDayFromDate(summary.entries, sourceSummary.entries)}
        onCopyDay={copyDay}
      />
      <StickyMacroHeader
        totals={summary.totals}
        targets={targets}
        onLogFood={() => setFoodLogDialogOpen(true)}
      />
      <FoodLogCard
        entries={summary.entries}
        sourceDayEntries={sourceSummary.entries}
        selectedDate={selectedDate}
        mealTemplates={mealTemplates}
        onDeleteEntry={setPendingDeleteEntry}
      />
      <FoodLogDialog
        isOpen={foodLogDialogOpen}
        onOpenChange={setFoodLogDialogOpen}
        selectedDate={selectedDate}
      />
      <DeleteConfirmationDialog
        isOpen={pendingDeleteEntry != null}
        onOpenChange={(open) => {
          if (!open) {setPendingDeleteEntry(null);}
        }}
        title={deleteFoodEntryTitle()}
        onConfirm={async () => {
          if (!pendingDeleteEntry) {return;}
          await confirmDeleteEntry(pendingDeleteEntry);
          setPendingDeleteEntry(null);
        }}
      />
    </VStack>
  );
}

function NutritionHeader({
  selectedDate,
  onDateChange,
  showCopyDay,
  onCopyDay,
}: {
  selectedDate: string;
  onDateChange: (date: string) => void;
  showCopyDay: boolean;
  onCopyDay: () => Promise<void>;
}) {
  return (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>Nutrition</Heading>
        <HStack gap={2} wrap="wrap">
          {showCopyDay ? (
            <Button
              label="Copy yesterday"
              variant="primary"
              size="sm"
              clickAction={onCopyDay}
            >
              Copy yesterday
            </Button>
          ) : undefined}
          <Button label="Templates" href="/nutrition/templates" size="sm" />
          <Button label="Weekly Plan" href="/nutrition/planning" size="sm" />
        </HStack>
      </HStack>
      <DateNavigationBar
        selectedDate={selectedDate}
        onDateChange={onDateChange}
      />
    </VStack>
  );
}

/** Rebuilds the addFoodLogEntry payload from a deleted row for Undo. */
function foodEntryRestorePayload(entry: FoodLogEntry) {
  return {
    calories: entry.calories,
    carbs_g: entry.carbs_g,
    custom_name: entry.custom_name ?? undefined,
    date: entry.date,
    fat_g: entry.fat_g,
    food_id: entry.food_id ?? undefined,
    meal_type: entry.meal_type,
    notes: entry.notes ?? undefined,
    protein_g: entry.protein_g,
    servings: entry.servings,
  };
}

function useConfirmDeleteFoodEntry(selectedDate: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const sourceDate = previousDay(selectedDate);

  const invalidateFoodLog = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["food-log", selectedDate] }),
      queryClient.invalidateQueries({ queryKey: ["food-log", sourceDate] }),
    ]);
  };

  return async (entry: FoodLogEntry) => {
    try {
      const outcome = await runOrQueue(
        "deleteFoodLogEntry",
        { id: entry.id },
        () => deleteFoodLogEntry({ data: { id: entry.id } })
      );
      if (!outcome.queued) {
        await invalidateFoodLog();
      }

      let dismiss = () => {};
      dismiss = toast({
        autoHideDuration: TOAST_DURATION_MS.undo,
        body: entryDeletedBody(),
        endContent: (
          <ToastUndoButton
            onUndo={async () => {
              dismiss();
              try {
                const restore = foodEntryRestorePayload(entry);
                await runOrQueue("addFoodLogEntry", restore, () =>
                  addFoodLogEntry({ data: restore })
                );
                await invalidateFoodLog();
              } catch {
                toast({ body: mutationFailedBody("Log food"), type: "error" });
              }
            }}
          />
        ),
      });
    } catch {
      toast({ body: mutationFailedBody("Delete entry"), type: "error" });
    }
  };
}

function useCopyDayFromYesterday(
  selectedDate: string,
  sourceDayEntries: import("~/lib/db").FoodLogEntry[]
) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const sourceDate = previousDay(selectedDate);

  const invalidateFoodLog = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["food-log", selectedDate] }),
      queryClient.invalidateQueries({ queryKey: ["food-log", sourceDate] }),
    ]);
  };

  return async () => {
    const payload = { fromDate: sourceDate, toDate: selectedDate };
    try {
      const outcome = await runOrQueue("copyDayFromDate", payload, () =>
        copyDayFromDate({ data: payload })
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
      toast({ body: copyCompletedBody(sourceDayEntries.length) });
    } catch {
      toast({ body: mutationFailedBody("Copy day"), type: "error" });
    }
  };
}
