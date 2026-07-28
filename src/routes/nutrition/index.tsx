import { Button, Heading, HStack, VStack } from "@astryxdesign/core";
import { useToast } from "@astryxdesign/core/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { DataLoadErrorView } from "~/components/data-load-error-banner";
import { DateNavigationBar } from "~/components/date-navigation-bar";
import { DeleteConfirmationDialog } from "~/components/delete-confirmation-dialog";
import { NutritionSkeleton } from "~/components/loading/page-skeletons";
import { FoodLogCard } from "~/components/nutrition/food-log-card";
import { FoodLogDialog } from "~/components/nutrition/food-log-dialog";
import { StickyMacroHeader } from "~/components/nutrition/sticky-macro-header";
import { ToastUndoButton } from "~/components/toast-undo-button";
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
    const selectedDate = resolveSelectedDate((deps as NutritionSearch).date);
    const sourceDate = previousDay(selectedDate);
    const [summary, sourceSummary, targets, mealTemplates] = await Promise.all([
      getNutritionSummary({ data: { date: selectedDate } }),
      getNutritionSummary({ data: { date: sourceDate } }),
      getDailyTargets(),
      getMealTemplates(),
    ]);
    return {
      mealTemplates,
      selectedDate,
      sourceDate,
      sourceSummary,
      summary,
      targets,
    };
  },
  loaderDeps: ({ search }) => ({
    date: (search as NutritionSearch).date,
  }),
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
        query={failedQuery}
        title="Failed to load nutrition data"
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
        onCopyDay={copyDay}
        onDateChange={handleDateChange}
        selectedDate={selectedDate}
        showCopyDay={canCopyDayFromDate(summary.entries, sourceSummary.entries)}
      />
      <StickyMacroHeader
        onLogFood={() => setFoodLogDialogOpen(true)}
        targets={targets}
        totals={summary.totals}
      />
      <FoodLogCard
        entries={summary.entries}
        mealTemplates={mealTemplates}
        onDeleteEntry={setPendingDeleteEntry}
        selectedDate={selectedDate}
        sourceDayEntries={sourceSummary.entries}
      />
      <FoodLogDialog
        isOpen={foodLogDialogOpen}
        onOpenChange={setFoodLogDialogOpen}
        selectedDate={selectedDate}
      />
      <DeleteConfirmationDialog
        isOpen={pendingDeleteEntry !== null}
        onConfirm={async () => {
          if (!pendingDeleteEntry) {
            return;
          }
          await confirmDeleteEntry(pendingDeleteEntry);
          setPendingDeleteEntry(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteEntry(null);
          }
        }}
        title={deleteFoodEntryTitle()}
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
      <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
        <Heading level={1}>Nutrition</Heading>
        <HStack gap={2} wrap="wrap">
          {showCopyDay ? (
            <Button
              clickAction={onCopyDay}
              label="Copy yesterday"
              size="sm"
              variant="primary"
            >
              Copy yesterday
            </Button>
          ) : null}
          <Button href="/nutrition/templates" label="Templates" size="sm" />
          <Button href="/nutrition/planning" label="Weekly Plan" size="sm" />
        </HStack>
      </HStack>
      <DateNavigationBar
        onDateChange={onDateChange}
        selectedDate={selectedDate}
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

      let dismiss = () => {
        /* assigned below */
      };
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
      toast({ body: copyCompletedBody(sourceDayEntries.length) });
    } catch {
      toast({ body: mutationFailedBody("Copy day"), type: "error" });
    }
  };
}
