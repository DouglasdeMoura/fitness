import type { TableColumn } from "@astryxdesign/core";
import {
  Badge,
  Button,
  Card,
  Collapsible,
  Dialog,
  DialogHeader,
  EmptyState,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  proportional,
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  Table,
  Text,
  VStack,
} from "@astryxdesign/core";
import { useToast } from "@astryxdesign/core/Toast";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";

import { DateNavigationBar } from "~/components/date-navigation-bar";
import { DeleteConfirmationDialog } from "~/components/delete-confirmation-dialog";
import { WorkoutSkeleton } from "~/components/loading/page-skeletons";
import { ScrollableTable } from "~/components/scrollable-table";
import { ToastUndoButton } from "~/components/toast-undo-button";
import { SessionSummaryCard } from "~/components/workout/session-summary-card";
import type { WorkoutSetRow } from "~/components/workout/workout-sets-table";
import { WorkoutSetsTable } from "~/components/workout/workout-sets-table";
import type {
  ExerciseSetHistoryRow,
  ProgramDayTarget,
  WorkoutSessionSummary,
} from "~/lib/api";
import {
  addWorkoutSet,
  createWorkoutSession,
  deleteWorkoutSet,
  finishWorkoutSession,
  getExerciseSetHistory,
  getExercises,
  getLastPerformance,
  getProgramDayTargets,
  getWorkoutSession,
  getWorkoutSessionSummary,
  getWorkoutSessions,
} from "~/lib/api";
import type { Exercise, WorkoutSession } from "~/lib/db";
import { deleteWorkoutSetTitle } from "~/lib/delete-confirmation";
import { formatDisplayInteger } from "~/lib/format-number";
import { parseSearchDate, resolveSelectedDate } from "~/lib/nutrition";
import { queueMutation, runOrQueue } from "~/lib/offline";
import type { ExerciseSetSnapshot, RecordKind } from "~/lib/records";
import {
  detectPersonalRecords,
  personalRecordsToastBody,
  recordKindsBySetId,
} from "~/lib/records";
import {
  clearRestTimer,
  hydrateRestTimerFromUrl,
  parseRestTimerSearch,
  restTimerSearchFromState,
  startRestTimer,
} from "~/lib/rest-timer";
import { makeTempRef } from "~/lib/sync";
import {
  mutationFailedBody,
  setDeletedBody,
  setSavedBody,
  setSavedWithRecordsBody,
  TOAST_DURATION_MS,
} from "~/lib/toasts";
import type { ActiveSession } from "~/lib/workout";
import {
  activeSessionFromUrl,
  buildFreeFormSuggestion,
  calculateVolume,
  estimate1RM,
  formatLastPerformanceLine,
  NO_HISTORY_GUIDANCE,
} from "~/lib/workout";

interface WorkoutSearch {
  date?: string;
  restDur?: number;
  restEnd?: number;
  session?: number;
  summary?: boolean;
}

export const Route = createFileRoute("/workout/")({
  component: WorkoutPage,
  head: () => ({ meta: [{ title: "Workout - FitTrack" }] }),
  loader: async ({ deps }) => {
    const selectedDate = resolveSelectedDate(deps.date);
    const sessions = await getWorkoutSessions({
      data: { date: selectedDate, limit: 10 },
    });
    return { selectedDate, sessions };
  },
  loaderDeps: ({ search: { date } }) => ({ date }),
  pendingComponent: WorkoutSkeleton,
  validateSearch: (search: Record<string, unknown>): WorkoutSearch => {
    const rest = parseRestTimerSearch(search);
    return {
      date: parseSearchDate(
        typeof search.date === "string" ? search.date : undefined
      ),
      restDur: rest.restDur,
      restEnd: rest.restEnd,
      session:
        typeof search.session === "number"
          ? search.session
          : typeof search.session === "string" && search.session
            ? Number.parseInt(search.session, 10)
            : undefined,
      summary:
        search.summary === true ||
        search.summary === "true" ||
        search.summary === 1 ||
        search.summary === "1"
          ? true
          : undefined,
    };
  },
});

function WorkoutPage() {
  return (
    <Suspense fallback={<WorkoutSkeleton />}>
      <WorkoutPageContent />
    </Suspense>
  );
}

function WorkoutPageContent() {
  const {
    session: sessionIdFromSearch,
    date: dateFromSearch,
    summary: showSummary,
    restEnd: restEndFromSearch,
    restDur: restDurFromSearch,
  } = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const selectedDate = resolveSelectedDate(dateFromSearch);

  const { data: exercises } = useSuspenseQuery({
    queryFn: () => getExercises({ data: {} }),
    queryKey: ["exercises"],
  });

  const { data: sessions } = useSuspenseQuery({
    initialData:
      loaderData.selectedDate === selectedDate
        ? loaderData.sessions
        : undefined,
    queryFn: () =>
      getWorkoutSessions({ data: { date: selectedDate, limit: 10 } }),
    queryKey: ["workout-sessions", selectedDate],
  });

  const [startedSession, setStartedSession] = useState<ActiveSession | null>(
    null
  );
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null
  );
  const [sets, setSets] = useState<WorkoutSetRow[]>([]);
  const [summaryOverride, setSummaryOverride] =
    useState<WorkoutSessionSummary | null>(null);
  const [pendingSetIndex, setPendingSetIndex] = useState<number | null>(null);
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const toast = useToast();

  const navigate = useNavigate();
  useEffect(() => {
    hydrateRestTimerFromUrl(
      { restDur: restDurFromSearch, restEnd: restEndFromSearch },
      Date.now()
    );
  }, [restEndFromSearch, restDurFromSearch]);

  const { data: urlSession } = useQuery({
    enabled: sessionIdFromSearch !== undefined,
    queryFn: () =>
      getWorkoutSession({ data: { id: sessionIdFromSearch as number } }),
    queryKey: ["workout-session", sessionIdFromSearch],
  });

  const activeSession =
    startedSession ??
    (sessionIdFromSearch !== undefined && urlSession
      ? activeSessionFromUrl(urlSession.session)
      : null);

  const { data: sessionSummary } = useQuery({
    enabled: showSummary === true && sessionIdFromSearch !== undefined,
    queryFn: () =>
      getWorkoutSessionSummary({ data: { id: sessionIdFromSearch as number } }),
    queryKey: ["workout-session-summary", sessionIdFromSearch],
  });

  const isViewingSavedSession =
    sessionIdFromSearch !== undefined &&
    startedSession === null &&
    urlSession !== null;

  const isSummaryView =
    showSummary === true && sessionIdFromSearch !== undefined;

  const historyExerciseIds = isViewingSavedSession
    ? [...new Set(urlSession.sets.map((set) => set.exercise_id))]
    : [];

  const { data: historyByExercise } = useQuery({
    enabled: isViewingSavedSession && historyExerciseIds.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        historyExerciseIds.map(async (exerciseId) => {
          const { sets: historySets } = await getExerciseSetHistory({
            data: { exerciseId },
          });
          return [exerciseId, historySets] as const;
        })
      );
      return new Map(entries);
    },
    queryKey: ["exercise-set-histories", historyExerciseIds],
  });

  const sessionHistoryRows =
    isViewingSavedSession && historyByExercise
      ? buildSessionHistoryRows(urlSession.sets, historyByExercise)
      : [];

  const hasProgramDay =
    activeSession?.programId !== null && activeSession?.programDayId !== null;
  const { data: targetsResponse } = useQuery({
    enabled: hasProgramDay,
    queryFn: () =>
      getProgramDayTargets({
        data: {
          programDayId: activeSession?.programDayId as number,
          programId: activeSession?.programId as number,
        },
      }),
    queryKey: [
      "program-day-targets",
      activeSession?.programId,
      activeSession?.programDayId,
    ],
  });
  const programTargets = targetsResponse?.targets ?? [];

  const activeTarget = selectedExercise
    ? programTargets.find(
        (target) => target.exercise_id === selectedExercise.id
      )
    : undefined;

  const isFreeFormSession = !hasProgramDay;
  const { data: lastPerformance } = useQuery({
    enabled: selectedExercise !== null && isFreeFormSession,
    queryFn: () =>
      getLastPerformance({
        data: {
          excludeSessionId: activeSession?.id ?? undefined,
          exerciseId: selectedExercise?.id,
        },
      }),
    queryKey: ["last-performance", selectedExercise?.id, activeSession?.id],
  });
  const freeFormSuggestion = buildFreeFormSuggestion(lastPerformance ?? null);

  const handleStartWorkout = async () => {
    const tempRef = makeTempRef();
    const outcome = await runOrQueue(
      "createWorkoutSession",
      { name: "Training Session", temp_ref: tempRef },
      () =>
        createWorkoutSession({
          data: { date: selectedDate, name: "Training Session" },
        })
    );
    setStartedSession({
      id: outcome.queued ? null : outcome.result.id,
      programDayId: null,
      programId: null,
      startedAt: new Date().toISOString(),
      tempRef,
    });
    setSets([]);
  };
  const dismissSummary = () => {
    setSummaryOverride(null);
    setShowFinishDialog(false);
    navigate({
      search: (prev) => {
        const next = { ...prev };
        next.session = undefined;
        next.summary = undefined;
        next.restEnd = undefined;
        next.restDur = undefined;
        return next;
      },
      to: "/workout",
    });
  };

  const handleFinish = async () => {
    if (!activeSession) {
      return;
    }

    clearRestTimer();
    const finishedSessionId = activeSession.id;

    try {
      if (finishedSessionId !== null) {
        const summary = await finishWorkoutSession({
          data: {
            finishedAt: new Date().toISOString(),
            id: finishedSessionId,
          },
        });
        setSummaryOverride(summary);
      }
    } catch {
      toast({ body: mutationFailedBody("Finish workout"), type: "error" });
      return;
    }

    setStartedSession(null);
    setSelectedExercise(null);
    setSets([]);

    if (finishedSessionId !== null) {
      setShowFinishDialog(true);
      navigate({
        search: (prev) => ({
          ...prev,
          restDur: undefined,
          restEnd: undefined,
          session: finishedSessionId,
        }),
        to: "/workout",
      });
      return;
    }

    dismissSummary();
  };

  const handleAddSet = () => {
    if (!selectedExercise) {
      return;
    }
    const lastSet = sets.at(-1);
    const suggestedWeight =
      activeTarget?.suggested_weight_kg ?? freeFormSuggestion?.weight;
    const suggestedReps = activeTarget
      ? Number.parseInt(activeTarget.target_reps.split("-")[0] || "8", 10)
      : freeFormSuggestion?.reps;
    setSets([
      ...sets,
      {
        reps: lastSet?.reps || suggestedReps || 8,
        rpe:
          lastSet?.rpe || activeTarget?.target_rpe || lastPerformance?.rpe || 7,
        weight: lastSet?.weight || suggestedWeight || 20,
      },
    ]);
  };

  const handleSaveSet = async (set: WorkoutSetRow, index: number) => {
    if (!(activeSession && selectedExercise)) {
      return;
    }
    const setFields = {
      exercise_id: selectedExercise.id,
      reps: set.reps,
      rpe: set.rpe,
      set_number: index + 1,
      weight_kg: set.weight,
    };

    try {
      const sessionId = activeSession.id;
      const { sets: historyRows } = await getExerciseSetHistory({
        data: { exerciseId: selectedExercise.id },
      });
      const brokenRecords =
        sessionId === null
          ? []
          : detectRecordsForNewSet(historyRows, sessionId, set, set.id);
      const recordKinds = brokenRecords.map((record) => record.kind);
      const toastBody =
        brokenRecords.length > 0
          ? setSavedWithRecordsBody(personalRecordsToastBody(brokenRecords))
          : setSavedBody();

      if (sessionId === null) {
        await queueMutation("addWorkoutSet", {
          ...setFields,
          session_temp_ref: activeSession.tempRef,
        });
        startRestTimer(set.rpe, Date.now());
        navigate({
          search: (prev) => ({
            ...prev,
            ...restTimerSearchFromState(Date.now()),
          }),
          to: "/workout",
        });
        toast({
          autoHideDuration: TOAST_DURATION_MS.setSaved,
          body: toastBody,
        });
        return;
      }

      const outcome = await runOrQueue(
        "addWorkoutSet",
        { ...setFields, session_id: sessionId },
        () => addWorkoutSet({ data: { ...setFields, session_id: sessionId } })
      );
      if (!outcome.queued) {
        setSets((prev) =>
          prev.map((row, i) =>
            i === index ? { ...row, id: outcome.result.id, recordKinds } : row
          )
        );
      } else if (recordKinds.length > 0) {
        setSets((prev) =>
          prev.map((row, i) => (i === index ? { ...row, recordKinds } : row))
        );
      }
      startRestTimer(set.rpe, Date.now());
      navigate({
        search: (prev) => ({
          ...prev,
          ...restTimerSearchFromState(Date.now()),
        }),
        to: "/workout",
      });
      toast({ autoHideDuration: TOAST_DURATION_MS.setSaved, body: toastBody });
    } catch {
      toast({ body: mutationFailedBody("Save set"), type: "error" });
    }
  };

  const requestDeleteSet = (index: number) => {
    if (sets[index]) {
      setPendingSetIndex(index);
    }
  };

  const confirmDeleteSet = async (index: number) => {
    const removed = sets[index];
    if (!removed) {
      return;
    }

    try {
      if (removed.id !== null) {
        await deleteWorkoutSet({ data: { id: removed.id } });
      }
      setSets((prev) => prev.filter((_, i) => i !== index));

      let dismiss = () => {
        /* assigned below */
      };
      dismiss = toast({
        autoHideDuration: TOAST_DURATION_MS.undo,
        body: setDeletedBody(),
        endContent: (
          <ToastUndoButton
            onUndo={async () => {
              dismiss();
              try {
                if (
                  removed.id !== null &&
                  activeSession?.id !== null &&
                  selectedExercise
                ) {
                  const outcome = await runOrQueue(
                    "addWorkoutSet",
                    {
                      exercise_id: selectedExercise.id,
                      reps: removed.reps,
                      rpe: removed.rpe,
                      session_id: activeSession.id,
                      set_number: index + 1,
                      weight_kg: removed.weight,
                    },
                    () =>
                      addWorkoutSet({
                        data: {
                          exercise_id: selectedExercise.id,
                          reps: removed.reps,
                          rpe: removed.rpe,
                          session_id: activeSession.id as number,
                          set_number: index + 1,
                          weight_kg: removed.weight,
                        },
                      })
                  );
                  const restored: WorkoutSetRow = outcome.queued
                    ? {
                        reps: removed.reps,
                        rpe: removed.rpe,
                        weight: removed.weight,
                      }
                    : { ...removed, id: outcome.result.id };
                  setSets((prev) => {
                    const next = [...prev];
                    next.splice(index, 0, restored);
                    return next;
                  });
                  return;
                }
                setSets((prev) => {
                  const next = [...prev];
                  next.splice(index, 0, {
                    reps: removed.reps,
                    rpe: removed.rpe,
                    weight: removed.weight,
                  });
                  return next;
                });
              } catch {
                toast({ body: mutationFailedBody("Save set"), type: "error" });
              }
            }}
          />
        ),
      });
    } catch {
      toast({ body: mutationFailedBody("Delete set"), type: "error" });
    }
  };

  const totalVolume = sets.reduce(
    (sum, s) => sum + calculateVolume(1, s.reps, s.weight),
    0
  );
  const bestSet =
    sets.length > 0
      ? sets.reduce((best, s) =>
          estimate1RM(s.weight, s.reps) > estimate1RM(best.weight, best.reps)
            ? s
            : best
        )
      : null;

  const displayedSummary = summaryOverride ?? sessionSummary ?? null;

  const exerciseOptions = buildExerciseOptions(exercises, programTargets);
  const filteredExercises =
    programTargets.length > 0
      ? exercises.filter((ex) =>
          programTargets.some((target) => target.exercise_id === ex.id)
        )
      : exercises;

  const isActiveSession = activeSession !== null && !isViewingSavedSession;
  const isActiveFreeForm = isActiveSession && isFreeFormSession;

  // Compute main content to avoid deeply nested ternaries.
  let mainContent: React.ReactNode = null;
  if (isSummaryView && !showFinishDialog) {
    if (displayedSummary) {
      mainContent = (
        <SessionSummaryCard
          onDone={dismissSummary}
          summary={displayedSummary}
        />
      );
    }
  } else if (activeSession) {
    if (isViewingSavedSession) {
      mainContent = (
        /* Viewing a saved (finished) session */
        <VStack gap={4}>
          {sessionHistoryRows.length > 0 ? (
            <Card>
              <VStack gap={3}>
                <Heading level={2}>Session History</Heading>
                <ScrollableTable scrollLabel="session-history-sets">
                  <Table
                    aria-label="Logged sets for this session"
                    columns={sessionHistoryColumns()}
                    data={sessionHistoryRows}
                    density="compact"
                    hasHover
                    idKey="id"
                  />
                </ScrollableTable>
              </VStack>
            </Card>
          ) : null}

          <Card>
            <VStack gap={3}>
              <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                <Heading level={2}>Session</Heading>
              </HStack>
              {totalVolume > 0 ? (
                <HStack gap={4} wrap="wrap">
                  <VStack gap={1}>
                    <Text type="label">Volume</Text>
                    <Text hasTabularNumbers size="2xl" weight="bold">
                      {formatDisplayInteger(totalVolume)} kg
                    </Text>
                  </VStack>
                  {bestSet ? (
                    <VStack gap={1}>
                      <Text type="label">Est. 1RM</Text>
                      <Text hasTabularNumbers size="2xl" weight="bold">
                        {formatDisplayInteger(
                          estimate1RM(bestSet.weight, bestSet.reps)
                        )}{" "}
                        kg
                      </Text>
                    </VStack>
                  ) : null}
                </HStack>
              ) : null}
            </VStack>
          </Card>
        </VStack>
      );
    } else {
      mainContent = (
        /* Focused active session — the core redesign */
        <VStack gap={4}>
          {/* Exercise switcher — SegmentedControl for program, Selector for free-form */}
          <Card>
            <VStack gap={3}>
              <Heading level={2}>Exercise</Heading>
              {programTargets.length > 0 ? (
                <SegmentedControl
                  label="Select exercise"
                  layout="fill"
                  onChange={(value) => {
                    const exercise = filteredExercises.find(
                      (item) => item.id === Number.parseInt(value, 10)
                    );
                    setSelectedExercise(exercise ?? null);
                    setSets([]);
                  }}
                  size="lg"
                  value={selectedExercise ? String(selectedExercise.id) : ""}
                >
                  {filteredExercises.map((ex) => (
                    <SegmentedControlItem
                      key={ex.id}
                      label={ex.name}
                      value={String(ex.id)}
                    />
                  ))}
                </SegmentedControl>
              ) : (
                <Selector
                  label="Exercise"
                  onChange={(value) => {
                    const exercise = filteredExercises.find(
                      (item) => item.id === Number.parseInt(String(value), 10)
                    );
                    setSelectedExercise(exercise ?? null);
                    setSets([]);
                  }}
                  options={exerciseOptions}
                  placeholder="Choose an exercise..."
                  value={selectedExercise ? String(selectedExercise.id) : ""}
                />
              )}
            </VStack>
          </Card>

          {/* Current exercise — the hero of the focused view */}
          {selectedExercise ? (
            <Card>
              <VStack gap={4}>
                <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                  <VStack gap={1}>
                    <Heading level={2} type="display-2">
                      {selectedExercise.name}
                    </Heading>
                    {activeTarget ? (
                      <Text type="supporting">
                        Target: {activeTarget.target_sets} x{" "}
                        {activeTarget.target_reps} @ RPE{" "}
                        {activeTarget.target_rpe}
                        {activeTarget.suggested_weight_kg
                          ? ` · Suggested ${activeTarget.suggested_weight_kg} kg`
                          : ""}
                      </Text>
                    ) : null}
                    {/* Previous session context — shown for free-form sessions */}
                    {isActiveFreeForm && lastPerformance ? (
                      <Text type="supporting">
                        {formatLastPerformanceLine(
                          lastPerformance,
                          selectedDate
                        )}
                      </Text>
                    ) : null}
                    {isActiveFreeForm && freeFormSuggestion ? (
                      <Text type="supporting">{freeFormSuggestion.note}</Text>
                    ) : null}
                    {isActiveFreeForm && !lastPerformance ? (
                      <Text type="supporting">{NO_HISTORY_GUIDANCE}</Text>
                    ) : null}
                  </VStack>
                  <Button
                    clickAction={handleAddSet}
                    label="Add set"
                    size="lg"
                    variant="primary"
                  />
                </HStack>

                {selectedExercise.instructions ? (
                  <Text type="supporting">{selectedExercise.instructions}</Text>
                ) : null}

                {/* Sets table — large touch-friendly inputs via GymStepperInput */}
                {sets.length > 0 ? (
                  <WorkoutSetsTable
                    exerciseName={selectedExercise.name}
                    onChangeSet={(index, patch) => {
                      setSets((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, ...patch } : row
                        )
                      );
                    }}
                    onDeleteSet={requestDeleteSet}
                    onSaveSet={handleSaveSet}
                    sets={sets}
                  />
                ) : null}

                <Text type="supporting">
                  RPE 7 = 3 reps in reserve · RPE 8 = 2 RIR · RPE 9 = 1 RIR ·
                  RPE 10 = max effort. For hypertrophy, target RPE 7-9.
                </Text>
              </VStack>
            </Card>
          ) : null}

          {/* Stats panel — Collapsible, not always visible */}
          {totalVolume > 0 ? (
            <Collapsible
              defaultIsOpen={false}
              trigger={<Text weight="bold">Session stats</Text>}
            >
              <Card>
                <MetadataList>
                  <MetadataListItem label="Total volume">
                    <Text hasTabularNumbers>
                      {formatDisplayInteger(totalVolume)} kg
                    </Text>
                  </MetadataListItem>
                  {bestSet ? (
                    <MetadataListItem label="Est. 1RM">
                      <Text hasTabularNumbers>
                        {formatDisplayInteger(
                          estimate1RM(bestSet.weight, bestSet.reps)
                        )}{" "}
                        kg
                      </Text>
                    </MetadataListItem>
                  ) : null}
                  <MetadataListItem label="Sets logged">
                    <Text hasTabularNumbers>{String(sets.length)}</Text>
                  </MetadataListItem>
                </MetadataList>
              </Card>
            </Collapsible>
          ) : null}

          {/* Finish button */}
          <HStack hAlign="end">
            <Button
              clickAction={handleFinish}
              label="Finish workout"
              size="lg"
              variant="secondary"
            />
          </HStack>
        </VStack>
      );
    }
  } else {
    mainContent = (
      /* Idle state — no active session */
      <VStack gap={4}>
        <Card>
          <EmptyState
            actions={
              <HStack gap={2} wrap="wrap">
                <Button
                  clickAction={handleStartWorkout}
                  label="Start Workout"
                  size="lg"
                  variant="primary"
                />
                <Button
                  href="/workout/programs"
                  label="Browse Programs"
                  size="lg"
                  variant="secondary"
                />
              </HStack>
            }
            description="Start a free-form session or follow a structured training program."
            headingLevel={2}
            title="Ready to train?"
          />
        </Card>

        <Card>
          <VStack gap={3}>
            <Heading level={2}>Recent Sessions</Heading>
            {sessions.length === 0 ? (
              <EmptyState
                actions={
                  <Button
                    clickAction={handleStartWorkout}
                    label="Start your first workout"
                    size="lg"
                    variant="primary"
                  />
                }
                description="Start a free-form session or follow a structured training program."
                headingLevel={3}
                isCompact
                title="No workouts yet"
              />
            ) : (
              <ScrollableTable scrollLabel="recent-sessions">
                <Table
                  aria-label="Recent workout sessions"
                  columns={recentSessionColumns(selectedDate)}
                  data={sessions}
                  density="compact"
                  hasHover
                  idKey="id"
                />
              </ScrollableTable>
            )}
          </VStack>
        </Card>
      </VStack>
    );
  }

  return (
    <VStack as="main" gap={isActiveSession ? 4 : 6}>
      {/* Page header — hidden during active session (focused mode) */}
      {isActiveSession ? null : (
        <>
          <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
            <Heading level={1}>Workout</Heading>
            <Button
              href="/workout/programs"
              label="Training Programs"
              size="lg"
              variant="secondary"
            />
          </HStack>
          <DateNavigationBar
            onDateChange={(nextDate) => {
              navigate({
                search: (prev) => ({
                  ...prev,
                  date: nextDate,
                }),
                to: "/workout",
              });
            }}
            selectedDate={selectedDate}
          />
        </>
      )}
      {mainContent}

      {/* Finish summary Dialog — shown after clicking Finish Workout */}
      {showFinishDialog && summaryOverride ? (
        <Dialog
          isOpen={showFinishDialog}
          onOpenChange={(open) => {
            if (!open) {
              dismissSummary();
            }
          }}
          purpose="form"
          width={390}
        >
          <DialogHeader
            onOpenChange={() => dismissSummary()}
            subtitle={summaryOverride.name}
            title="Session Summary"
          />
          <VStack gap={4}>
            <Text
              aria-label="Session volume comparison"
              size="2xl"
              weight="bold"
            >
              {summaryOverride.comparisonSentence}
            </Text>

            <MetadataList>
              <MetadataListItem label="Total volume">
                <Text hasTabularNumbers>
                  {formatDisplayInteger(summaryOverride.totalVolume)} kg
                </Text>
              </MetadataListItem>
              <MetadataListItem label="Sets logged">
                <Text hasTabularNumbers>
                  {String(summaryOverride.setCount)}
                </Text>
              </MetadataListItem>
              <MetadataListItem label="Exercises">
                <Text hasTabularNumbers>
                  {String(summaryOverride.exerciseCount)}
                </Text>
              </MetadataListItem>
              <MetadataListItem label="Duration">
                <Text hasTabularNumbers>
                  {summaryOverride.durationMinutes === null
                    ? "—"
                    : `${String(summaryOverride.durationMinutes)} min`}
                </Text>
              </MetadataListItem>
              <MetadataListItem label="Personal records">
                <HStack gap={2} vAlign="center">
                  <Text hasTabularNumbers>
                    {String(summaryOverride.personalRecordCount)}
                  </Text>
                  {summaryOverride.personalRecordCount > 0 ? (
                    <Badge label="PR" variant="success" />
                  ) : null}
                </HStack>
              </MetadataListItem>
            </MetadataList>

            <Button
              clickAction={dismissSummary}
              label="Done"
              size="lg"
              variant="primary"
            />
          </VStack>
        </Dialog>
      ) : null}

      <DeleteConfirmationDialog
        isOpen={pendingSetIndex !== null}
        onConfirm={async () => {
          if (pendingSetIndex === null) {
            return;
          }
          await confirmDeleteSet(pendingSetIndex);
          setPendingSetIndex(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingSetIndex(null);
          }
        }}
        title={deleteWorkoutSetTitle()}
      />
    </VStack>
  );
}

interface SessionHistoryRow {
  exercise_name: string;
  id: number;
  recordKinds: RecordKind[];
  reps: number;
  rpe: number;
  set_number: number;
  weight_kg: number;
}

function toSetSnapshot(row: ExerciseSetHistoryRow): ExerciseSetSnapshot {
  return {
    id: row.id,
    reps: row.reps,
    session_id: row.session_id,
    weight_kg: row.weight_kg,
  };
}

function detectRecordsForNewSet(
  historyRows: ExerciseSetHistoryRow[],
  sessionId: number,
  set: WorkoutSetRow,
  excludeSetId?: number
) {
  const priorSets = historyRows
    .filter((row) => row.id !== excludeSetId)
    .map(toSetSnapshot);
  const newSet: ExerciseSetSnapshot = {
    reps: set.reps,
    session_id: sessionId,
    weight_kg: set.weight,
  };
  const currentSessionPrior = priorSets.filter(
    (row) => row.session_id === sessionId
  );
  return detectPersonalRecords(priorSets, newSet, currentSessionPrior);
}

function buildSessionHistoryRows(
  sets: {
    id: number;
    exercise_id: number;
    exercise_name: string;
    set_number: number;
    weight_kg: number | null;
    reps: number | null;
    rpe: number;
  }[],
  historyByExercise: Map<number, ExerciseSetHistoryRow[]>
): SessionHistoryRow[] {
  return sets
    .filter((set) => set.weight_kg !== null && set.reps !== null)
    .map((set) => {
      const chronological = (historyByExercise.get(set.exercise_id) ?? []).map(
        toSetSnapshot
      );
      const recordKinds = recordKindsBySetId(chronological).get(set.id) ?? [];
      return {
        exercise_name: set.exercise_name,
        id: set.id,
        recordKinds,
        reps: set.reps as number,
        rpe: set.rpe,
        set_number: set.set_number,
        weight_kg: set.weight_kg as number,
      };
    });
}

function sessionHistoryColumns(): TableColumn<SessionHistoryRow>[] {
  return [
    {
      header: "Exercise",
      key: "exercise_name",
      renderCell: (row) => <Text>{row.exercise_name}</Text>,
      width: proportional(2),
    },
    {
      header: "Set",
      key: "set_number",
      renderCell: (row) => (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text hasTabularNumbers>{row.set_number}</Text>
          {row.recordKinds.length > 0 ? (
            <Badge label="PR" variant="success" />
          ) : null}
        </HStack>
      ),
      width: proportional(1),
    },
    {
      header: "Weight (kg)",
      key: "weight",
      renderCell: (row) => <Text hasTabularNumbers>{row.weight_kg}</Text>,
      width: proportional(1),
    },
    {
      header: "Reps",
      key: "reps",
      renderCell: (row) => <Text hasTabularNumbers>{row.reps}</Text>,
      width: proportional(1),
    },
    {
      header: "RPE",
      key: "rpe",
      renderCell: (row) => <Text hasTabularNumbers>{row.rpe}</Text>,
      width: proportional(1),
    },
  ];
}

function buildExerciseOptions(
  exercises: Exercise[],
  programTargets: ProgramDayTarget[]
) {
  const list =
    programTargets.length > 0
      ? exercises.filter((ex) =>
          programTargets.some((target) => target.exercise_id === ex.id)
        )
      : exercises;
  return list.map((exercise) => ({
    label: `${exercise.name} (${exercise.muscle_group})`,
    value: String(exercise.id),
  }));
}

function recentSessionColumns(
  selectedDate: string
): TableColumn<WorkoutSession>[] {
  return [
    {
      header: "Date",
      key: "date",
      renderCell: (session) => <Text hasTabularNumbers>{session.date}</Text>,
      width: proportional(1),
    },
    {
      header: "Name",
      key: "name",
      renderCell: (session) => <Text>{session.name || "Workout"}</Text>,
      width: proportional(2),
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: (session) => (
        <HStack gap={2} wrap="wrap">
          <Button
            href={`/workout?session=${session.id}&date=${selectedDate}`}
            label={`View session ${session.name || session.date}`}
            size="lg"
            variant="secondary"
          />
          <Button
            href={`/workout?session=${session.id}&summary=1&date=${selectedDate}`}
            label={`View summary ${session.name || session.date}`}
            size="lg"
            variant="secondary"
          />
        </HStack>
      ),
      width: proportional(2),
    },
  ];
}

function _programTargetColumns(): TableColumn<ProgramDayTarget>[] {
  return [
    {
      header: "Exercise",
      key: "exercise_name",
      renderCell: (target) => <Text weight="bold">{target.exercise_name}</Text>,
      width: proportional(2),
    },
    {
      header: "Target",
      key: "target",
      renderCell: (target) => (
        <HStack gap={2} wrap="wrap">
          <Text type="supporting">
            {target.target_sets} x {target.target_reps} @ RPE{" "}
            {target.target_rpe}
          </Text>
          {target.dup_emphasis ? (
            <Badge label={target.dup_emphasis} variant="info" />
          ) : null}
        </HStack>
      ),
      width: proportional(2),
    },
    {
      header: "Suggested",
      key: "suggested",
      renderCell: (target) => (
        <Text type="supporting">
          {target.suggested_weight_kg
            ? `${target.suggested_weight_kg} kg`
            : target.progression_note}
        </Text>
      ),
      width: proportional(2),
    },
  ];
}
