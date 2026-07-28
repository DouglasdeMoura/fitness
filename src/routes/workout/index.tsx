import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense, useEffect, useState } from 'react'
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
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  Table,
  Text,
  VStack,
  proportional,
  type TableColumn,
} from '@astryxdesign/core'
import { WorkoutIcon } from '~/components/icons/FitTrackIcons'
import { useToast } from '@astryxdesign/core/Toast'
import { DeleteConfirmationDialog } from '~/components/DeleteConfirmationDialog'
import { DateNavigationBar } from '~/components/DateNavigationBar'
import { ScrollableTable } from '~/components/ScrollableTable'
import { ToastUndoButton } from '~/components/ToastUndoButton'
import { WorkoutSetsTable, type WorkoutSetRow } from '~/components/workout/WorkoutSetsTable'
import { SessionSummaryCard } from '~/components/workout/SessionSummaryCard'
import {
  getExercises,
  getWorkoutSessions,
  getWorkoutSession,
  getWorkoutSessionSummary,
  finishWorkoutSession,
  createWorkoutSession,
  addWorkoutSet,
  deleteWorkoutSet,
  getExerciseSetHistory,
  getLastPerformance,
  getProgramDayTargets,
  type ProgramDayTarget,
  type ExerciseSetHistoryRow,
  type WorkoutSessionSummary,
} from '~/lib/api'
import { queueMutation, runOrQueue } from '~/lib/offline'
import { makeTempRef } from '~/lib/sync'
import type { Exercise, WorkoutSession } from '~/lib/db'
import { formatDisplayInteger } from '~/lib/format-number'
import { deleteWorkoutSetTitle } from '~/lib/delete-confirmation'
import { parseSearchDate, resolveSelectedDate } from '~/lib/nutrition'
import {
  mutationFailedBody,
  setDeletedBody,
  setSavedBody,
  setSavedWithRecordsBody,
  TOAST_DURATION_MS,
} from '~/lib/toasts'
import {
  activeSessionFromUrl,
  buildFreeFormSuggestion,
  calculateVolume,
  estimate1RM,
  formatLastPerformanceLine,
  NO_HISTORY_GUIDANCE,
  type ActiveSession,
} from '~/lib/workout'
import { WorkoutSkeleton } from '~/components/loading/PageSkeletons'
import {
  clearRestTimer,
  hydrateRestTimerFromUrl,
  parseRestTimerSearch,
  restTimerSearchFromState,
  startRestTimer,
} from '~/lib/rest-timer'
import {
  detectPersonalRecords,
  personalRecordsToastBody,
  recordKindsBySetId,
  type ExerciseSetSnapshot,
  type RecordKind,
} from '~/lib/records'

type WorkoutSearch = {
  session?: number
  date?: string
  summary?: boolean
  restEnd?: number
  restDur?: number
}

export const Route = createFileRoute('/workout/')({
  head: () => ({ meta: [{ title: 'Workout - FitTrack' }] }),
  validateSearch: (search: Record<string, unknown>): WorkoutSearch => {
    const rest = parseRestTimerSearch(search)
    return {
      session:
        typeof search.session === 'number'
          ? search.session
          : typeof search.session === 'string' && search.session
            ? parseInt(search.session, 10)
            : undefined,
      date: parseSearchDate(typeof search.date === 'string' ? search.date : undefined),
      summary:
        search.summary === true ||
        search.summary === 'true' ||
        search.summary === 1 ||
        search.summary === '1'
          ? true
          : undefined,
      restEnd: rest.restEnd,
      restDur: rest.restDur,
    }
  },
  loaderDeps: ({ search: { date } }) => ({ date }),
  loader: async ({ deps }) => {
    const selectedDate = resolveSelectedDate(deps.date)
    const sessions = await getWorkoutSessions({ data: { date: selectedDate, limit: 10 } })
    return { selectedDate, sessions }
  },
  pendingComponent: WorkoutSkeleton,
  component: WorkoutPage,
})

function WorkoutPage() {
  return (
    <Suspense fallback={<WorkoutSkeleton />}>
      <WorkoutPageContent />
    </Suspense>
  )
}

function WorkoutPageContent() {
  const {
    session: sessionIdFromSearch,
    date: dateFromSearch,
    summary: showSummary,
    restEnd: restEndFromSearch,
    restDur: restDurFromSearch,
  } = Route.useSearch()
  const loaderData = Route.useLoaderData()
  const selectedDate = resolveSelectedDate(dateFromSearch)

  const { data: exercises } = useSuspenseQuery({
    queryKey: ['exercises'],
    queryFn: () => getExercises({ data: {} }),
  })

  const { data: sessions } = useSuspenseQuery({
    queryKey: ['workout-sessions', selectedDate],
    queryFn: () => getWorkoutSessions({ data: { date: selectedDate, limit: 10 } }),
    initialData: loaderData.selectedDate === selectedDate ? loaderData.sessions : undefined,
  })

  const [startedSession, setStartedSession] = useState<ActiveSession | null>(null)
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [sets, setSets] = useState<WorkoutSetRow[]>([])
  const [summaryOverride, setSummaryOverride] = useState<WorkoutSessionSummary | null>(null)
  const [pendingSetIndex, setPendingSetIndex] = useState<number | null>(null)
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const toast = useToast()

  const navigate = useNavigate()
  useEffect(() => {
    hydrateRestTimerFromUrl({ restEnd: restEndFromSearch, restDur: restDurFromSearch }, Date.now())
  }, [restEndFromSearch, restDurFromSearch])

  const { data: urlSession } = useQuery({
    queryKey: ['workout-session', sessionIdFromSearch],
    queryFn: () => getWorkoutSession({ data: { id: sessionIdFromSearch as number } }),
    enabled: sessionIdFromSearch !== undefined,
  })

  const activeSession =
    startedSession ??
    (sessionIdFromSearch !== undefined && urlSession
      ? activeSessionFromUrl(urlSession.session)
      : null)

  const { data: sessionSummary } = useQuery({
    queryKey: ['workout-session-summary', sessionIdFromSearch],
    queryFn: () => getWorkoutSessionSummary({ data: { id: sessionIdFromSearch as number } }),
    enabled: showSummary === true && sessionIdFromSearch !== undefined,
  })

  const isViewingSavedSession =
    sessionIdFromSearch !== undefined && startedSession === null && urlSession != null

  const isSummaryView = showSummary === true && sessionIdFromSearch !== undefined

  const historyExerciseIds = isViewingSavedSession
    ? [...new Set(urlSession.sets.map((set) => set.exercise_id))]
    : []

  const { data: historyByExercise } = useQuery({
    queryKey: ['exercise-set-histories', historyExerciseIds],
    queryFn: async () => {
      const entries = await Promise.all(
        historyExerciseIds.map(async (exerciseId) => {
          const { sets } = await getExerciseSetHistory({ data: { exerciseId } })
          return [exerciseId, sets] as const
        }),
      )
      return new Map(entries)
    },
    enabled: isViewingSavedSession && historyExerciseIds.length > 0,
  })

  const sessionHistoryRows =
    isViewingSavedSession && historyByExercise
      ? buildSessionHistoryRows(urlSession.sets, historyByExercise)
      : []

  const hasProgramDay = activeSession?.programId != null && activeSession?.programDayId != null
  const { data: targetsResponse } = useQuery({
    queryKey: ['program-day-targets', activeSession?.programId, activeSession?.programDayId],
    queryFn: () =>
      getProgramDayTargets({
        data: {
          programId: activeSession?.programId as number,
          programDayId: activeSession?.programDayId as number,
        },
      }),
    enabled: hasProgramDay,
  })
  const programTargets = targetsResponse?.targets ?? []

  const activeTarget = selectedExercise
    ? programTargets.find((target) => target.exercise_id === selectedExercise.id)
    : undefined

  const isFreeFormSession = !hasProgramDay
  const { data: lastPerformance } = useQuery({
    queryKey: ['last-performance', selectedExercise?.id, activeSession?.id],
    queryFn: () =>
      getLastPerformance({
        data: {
          exerciseId: selectedExercise!.id,
          excludeSessionId: activeSession?.id ?? undefined,
        },
      }),
    enabled: selectedExercise != null && isFreeFormSession,
  })
  const freeFormSuggestion = buildFreeFormSuggestion(lastPerformance ?? null)

  const handleStartWorkout = async () => {
    const tempRef = makeTempRef()
    const outcome = await runOrQueue(
      'createWorkoutSession',
      { name: 'Training Session', temp_ref: tempRef },
      () => createWorkoutSession({ data: { name: 'Training Session', date: selectedDate } }),
    )
    setStartedSession({
      id: outcome.queued ? null : outcome.result.id,
      tempRef,
      programId: null,
      programDayId: null,
      startedAt: new Date().toISOString(),
    })
    setSets([])
  }
  const dismissSummary = () => {
    setSummaryOverride(null)
    setShowFinishDialog(false)
    navigate({
      to: '/workout',
      search: (prev) => {
        const next = { ...prev }
        delete next.session
        delete next.summary
        delete next.restEnd
        delete next.restDur
        return next
      },
    })
  }

  const handleFinish = async () => {
    if (!activeSession) return

    clearRestTimer()
    const finishedSessionId = activeSession.id

    try {
      if (finishedSessionId != null) {
        const summary = await finishWorkoutSession({
          data: {
            id: finishedSessionId,
            finishedAt: new Date().toISOString(),
          },
        })
        setSummaryOverride(summary)
      }
    } catch {
      toast({ body: mutationFailedBody('Finish workout'), type: 'error' })
      return
    }

    setStartedSession(null)
    setSelectedExercise(null)
    setSets([])

    if (finishedSessionId != null) {
      setShowFinishDialog(true)
      navigate({
        to: '/workout',
        search: (prev) => ({
          ...prev,
          session: finishedSessionId,
          restEnd: undefined,
          restDur: undefined,
        }),
      })
      return
    }

    dismissSummary()
  }

  const handleAddSet = () => {
    if (!selectedExercise) return
    const lastSet = sets[sets.length - 1]
    const suggestedWeight = activeTarget?.suggested_weight_kg ?? freeFormSuggestion?.weight
    const suggestedReps = activeTarget
      ? parseInt(activeTarget.target_reps.split('-')[0] || '8', 10)
      : freeFormSuggestion?.reps
    setSets([
      ...sets,
      {
        reps: lastSet?.reps || suggestedReps || 8,
        weight: lastSet?.weight || suggestedWeight || 20,
        rpe: lastSet?.rpe || activeTarget?.target_rpe || lastPerformance?.rpe || 7,
      },
    ])
  }

  const handleSaveSet = async (set: WorkoutSetRow, index: number) => {
    if (!activeSession || !selectedExercise) return
    const setFields = {
      exercise_id: selectedExercise.id,
      set_number: index + 1,
      reps: set.reps,
      weight_kg: set.weight,
      rpe: set.rpe,
    }

    try {
      const sessionId = activeSession.id
      const { sets: historyRows } = await getExerciseSetHistory({
        data: { exerciseId: selectedExercise.id },
      })
      const brokenRecords =
        sessionId === null
          ? []
          : detectRecordsForNewSet(historyRows, sessionId, set, set.id)
      const recordKinds = brokenRecords.map((record) => record.kind)
      const toastBody =
        brokenRecords.length > 0
          ? setSavedWithRecordsBody(personalRecordsToastBody(brokenRecords))
          : setSavedBody()

      if (sessionId === null) {
        await queueMutation('addWorkoutSet', { ...setFields, session_temp_ref: activeSession.tempRef })
        startRestTimer(set.rpe, Date.now())
        navigate({ to: '/workout', search: (prev) => ({ ...prev, ...restTimerSearchFromState(Date.now()) }) })
        toast({ body: toastBody, autoHideDuration: TOAST_DURATION_MS.setSaved })
        return
      }

      const outcome = await runOrQueue('addWorkoutSet', { ...setFields, session_id: sessionId }, () =>
        addWorkoutSet({ data: { ...setFields, session_id: sessionId } }),
      )
      if (!outcome.queued) {
        setSets((prev) =>
          prev.map((row, i) =>
            i === index ? { ...row, id: outcome.result.id, recordKinds } : row,
          ),
        )
      } else if (recordKinds.length > 0) {
        setSets((prev) =>
          prev.map((row, i) => (i === index ? { ...row, recordKinds } : row)),
        )
      }
      startRestTimer(set.rpe, Date.now())
      navigate({ to: '/workout', search: (prev) => ({ ...prev, ...restTimerSearchFromState(Date.now()) }) })
      toast({ body: toastBody, autoHideDuration: TOAST_DURATION_MS.setSaved })
    } catch {
      toast({ body: mutationFailedBody('Save set'), type: 'error' })
    }
  }

  const requestDeleteSet = (index: number) => {
    if (sets[index]) setPendingSetIndex(index)
  }

  const confirmDeleteSet = async (index: number) => {
    const removed = sets[index]
    if (!removed) return

    try {
      if (removed.id != null) {
        await deleteWorkoutSet({ data: { id: removed.id } })
      }
      setSets((prev) => prev.filter((_, i) => i !== index))

      let dismiss = () => {}
      dismiss = toast({
        body: setDeletedBody(),
        autoHideDuration: TOAST_DURATION_MS.undo,
        endContent: (
          <ToastUndoButton
            onUndo={async () => {
              dismiss()
              try {
                if (removed.id != null && activeSession?.id != null && selectedExercise) {
                  const outcome = await runOrQueue(
                    'addWorkoutSet',
                    {
                      session_id: activeSession.id,
                      exercise_id: selectedExercise.id,
                      set_number: index + 1,
                      reps: removed.reps,
                      weight_kg: removed.weight,
                      rpe: removed.rpe,
                    },
                    () =>
                      addWorkoutSet({
                        data: {
                          session_id: activeSession.id as number,
                          exercise_id: selectedExercise.id,
                          set_number: index + 1,
                          reps: removed.reps,
                          weight_kg: removed.weight,
                          rpe: removed.rpe,
                        },
                      }),
                  )
                  const restored: WorkoutSetRow = !outcome.queued
                    ? { ...removed, id: outcome.result.id }
                    : { reps: removed.reps, weight: removed.weight, rpe: removed.rpe }
                  setSets((prev) => {
                    const next = [...prev]
                    next.splice(index, 0, restored)
                    return next
                  })
                  return
                }
                setSets((prev) => {
                  const next = [...prev]
                  next.splice(index, 0, {
                    reps: removed.reps,
                    weight: removed.weight,
                    rpe: removed.rpe,
                  })
                  return next
                })
              } catch {
                toast({ body: mutationFailedBody('Save set'), type: 'error' })
              }
            }}
          />
        ),
      })
    } catch {
      toast({ body: mutationFailedBody('Delete set'), type: 'error' })
    }
  }

  const totalVolume = sets.reduce((sum, s) => sum + calculateVolume(1, s.reps, s.weight), 0)
  const bestSet =
    sets.length > 0
      ? sets.reduce((best, s) =>
          estimate1RM(s.weight, s.reps) > estimate1RM(best.weight, best.reps) ? s : best,
        )
      : null

  const displayedSummary = summaryOverride ?? sessionSummary ?? null

    const exerciseOptions = buildExerciseOptions(exercises, programTargets)
  const filteredExercises =
    programTargets.length > 0
      ? exercises.filter((ex) => programTargets.some((target) => target.exercise_id === ex.id))
      : exercises

  const isActiveSession = activeSession != null && !isViewingSavedSession
  const isActiveFreeForm = isActiveSession && isFreeFormSession

  return (
    <VStack as="main" gap={isActiveSession ? 4 : 6}>
      {/* Page header — hidden during active session (focused mode) */}
      {!isActiveSession ? (
        <>
          <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
            <Heading level={1}>Workout</Heading>
            <Button label="Training Programs" href="/workout/programs" variant="secondary" size="lg" />
          </HStack>
          <DateNavigationBar
            selectedDate={selectedDate}
            onDateChange={(nextDate) => {
              navigate({
                to: '/workout',
                search: (prev) => ({
                  ...prev,
                  date: nextDate,
                }),
              })
            }}
          />
        </>
      ) : null}

      {/* Summary view (historical, from URL) */}
      {isSummaryView && !showFinishDialog ? (
        displayedSummary ? (
          <SessionSummaryCard summary={displayedSummary} onDone={dismissSummary} />
        ) : null
      ) : !activeSession ? (
        /* Idle state — no active session */
        <VStack gap={4}>
          <Card>
            <EmptyState
              icon={<WorkoutIcon />}
              title="Ready to train?"
              description="Start a free-form session or follow a structured training program."
              actions={
                <HStack gap={2} wrap="wrap">
                  <Button label="Start Workout" variant="primary" size="lg" clickAction={handleStartWorkout} />
                  <Button label="Browse Programs" href="/workout/programs" variant="secondary" size="lg" />
                </HStack>
              }
              headingLevel={2}
            />
          </Card>

          <Card>
            <VStack gap={3}>
              <Heading level={2}>Recent Sessions</Heading>
              {sessions.length === 0 ? (
                <EmptyState
                  icon={<WorkoutIcon />}
                  title="No workouts yet"
                  description="Start a free-form session or follow a structured training program."
                  actions={
                    <Button
                      label="Start your first workout"
                      variant="primary"
                      size="lg"
                      clickAction={handleStartWorkout}
                    />
                  }
                  headingLevel={3}
                  isCompact
                />
              ) : (
                <ScrollableTable scrollLabel="recent-sessions">
                  <Table
                    aria-label="Recent workout sessions"
                    columns={recentSessionColumns(selectedDate)}
                    data={sessions}
                    idKey="id"
                    density="compact"
                    hasHover
                  />
                </ScrollableTable>
              )}
            </VStack>
          </Card>
        </VStack>
      ) : isViewingSavedSession ? (
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
                    idKey="id"
                    density="compact"
                    hasHover
                  />
                </ScrollableTable>
              </VStack>
            </Card>
          ) : null}

          <Card>
            <VStack gap={3}>
              <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                <Heading level={2}>Session</Heading>
              </HStack>
              {totalVolume > 0 ? (
                <HStack gap={4} wrap="wrap">
                  <VStack gap={1}>
                    <Text type="label">Volume</Text>
                    <Text size="2xl" weight="bold" hasTabularNumbers>
                      {formatDisplayInteger(totalVolume)} kg
                    </Text>
                  </VStack>
                  {bestSet ? (
                    <VStack gap={1}>
                      <Text type="label">Est. 1RM</Text>
                      <Text size="2xl" weight="bold" hasTabularNumbers>
                        {formatDisplayInteger(estimate1RM(bestSet.weight, bestSet.reps))} kg
                      </Text>
                    </VStack>
                  ) : null}
                </HStack>
              ) : null}
            </VStack>
          </Card>
        </VStack>
      ) : (
        /* Focused active session — the core redesign */
        <VStack gap={4}>
          {/* Exercise switcher — SegmentedControl for program, Selector for free-form */}
          <Card>
            <VStack gap={3}>
              <Heading level={2}>Exercise</Heading>
              {programTargets.length > 0 ? (
                <SegmentedControl
                  value={selectedExercise ? String(selectedExercise.id) : ''}
                  onChange={(value) => {
                    const exercise = filteredExercises.find(
                      (item) => item.id === parseInt(value, 10),
                    )
                    setSelectedExercise(exercise ?? null)
                    setSets([])
                  }}
                  label="Select exercise"
                  size="lg"
                  layout="fill"
                >
                  {filteredExercises.map((ex) => (
                    <SegmentedControlItem
                      key={ex.id}
                      value={String(ex.id)}
                      label={ex.name}
                    />
                  ))}
                </SegmentedControl>
              ) : (
                <Selector
                  label="Exercise"
                  placeholder="Choose an exercise..."
                  value={selectedExercise ? String(selectedExercise.id) : ''}
                  onChange={(value) => {
                    const exercise = filteredExercises.find(
                      (item) => item.id === parseInt(String(value), 10),
                    )
                    setSelectedExercise(exercise ?? null)
                    setSets([])
                  }}
                  options={exerciseOptions}
                />
              )}
            </VStack>
          </Card>

          {/* Current exercise — the hero of the focused view */}
          {selectedExercise ? (
            <Card>
              <VStack gap={4}>
                <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                  <VStack gap={1}>
                    <Heading level={2} type="display-2">
                      {selectedExercise.name}
                    </Heading>
                    {activeTarget ? (
                      <Text type="supporting">
                        Target: {activeTarget.target_sets} x {activeTarget.target_reps} @ RPE{' '}
                        {activeTarget.target_rpe}
                        {activeTarget.suggested_weight_kg
                          ? ` · Suggested ${activeTarget.suggested_weight_kg} kg`
                          : ''}
                      </Text>
                    ) : null}
                    {/* Previous session context — shown for free-form sessions */}
                    {isActiveFreeForm && lastPerformance ? (
                      <Text type="supporting">
                        {formatLastPerformanceLine(lastPerformance, selectedDate)}
                      </Text>
                    ) : null}
                    {isActiveFreeForm && freeFormSuggestion ? (
                      <Text type="supporting">{freeFormSuggestion.note}</Text>
                    ) : null}
                    {isActiveFreeForm && !lastPerformance ? (
                      <Text type="supporting">{NO_HISTORY_GUIDANCE}</Text>
                    ) : null}
                  </VStack>
                  <Button label="Add set" variant="primary" size="lg" clickAction={handleAddSet} />
                </HStack>

                {selectedExercise.instructions ? (
                  <Text type="supporting">{selectedExercise.instructions}</Text>
                ) : null}

                {/* Sets table — large touch-friendly inputs via GymStepperInput */}
                {sets.length > 0 ? (
                  <WorkoutSetsTable
                    sets={sets}
                    exerciseName={selectedExercise.name}
                    onChangeSet={(index, patch) => {
                      setSets((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
                      )
                    }}
                    onSaveSet={handleSaveSet}
                    onDeleteSet={requestDeleteSet}
                  />
                ) : null}

                <Text type="supporting">
                  RPE 7 = 3 reps in reserve · RPE 8 = 2 RIR · RPE 9 = 1 RIR · RPE 10 = max effort.
                  For hypertrophy, target RPE 7-9.
                </Text>
              </VStack>
            </Card>
          ) : null}

          {/* Stats panel — Collapsible, not always visible */}
          {totalVolume > 0 ? (
            <Collapsible
              trigger={<Text weight="bold">Session stats</Text>}
              defaultIsOpen={false}
            >
              <Card>
                <MetadataList>
                  <MetadataListItem label="Total volume">
                    <Text hasTabularNumbers>{formatDisplayInteger(totalVolume)} kg</Text>
                  </MetadataListItem>
                  {bestSet ? (
                    <MetadataListItem label="Est. 1RM">
                      <Text hasTabularNumbers>
                        {formatDisplayInteger(estimate1RM(bestSet.weight, bestSet.reps))} kg
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
            <Button label="Finish workout" variant="secondary" size="lg" clickAction={handleFinish} />
          </HStack>
        </VStack>
      )}

      {/* Finish summary Dialog — shown after clicking Finish Workout */}
      {showFinishDialog && summaryOverride ? (
        <Dialog
          isOpen={showFinishDialog}
          onOpenChange={(open) => {
            if (!open) dismissSummary()
          }}
          purpose="form"
          width={390}
        >
          <DialogHeader
            title="Session Summary"
            subtitle={summaryOverride.name}
            onOpenChange={() => dismissSummary()}
          />
          <VStack gap={4}>
            <Text size="2xl" weight="bold" aria-label="Session volume comparison">
              {summaryOverride.comparisonSentence}
            </Text>

            <MetadataList>
              <MetadataListItem label="Total volume">
                <Text hasTabularNumbers>{formatDisplayInteger(summaryOverride.totalVolume)} kg</Text>
              </MetadataListItem>
              <MetadataListItem label="Sets logged">
                <Text hasTabularNumbers>{String(summaryOverride.setCount)}</Text>
              </MetadataListItem>
              <MetadataListItem label="Exercises">
                <Text hasTabularNumbers>{String(summaryOverride.exerciseCount)}</Text>
              </MetadataListItem>
              <MetadataListItem label="Duration">
                <Text hasTabularNumbers>
                  {summaryOverride.durationMinutes != null
                    ? `${String(summaryOverride.durationMinutes)} min`
                    : '—'}
                </Text>
              </MetadataListItem>
              <MetadataListItem label="Personal records">
                <HStack gap={2} vAlign="center">
                  <Text hasTabularNumbers>{String(summaryOverride.personalRecordCount)}</Text>
                  {summaryOverride.personalRecordCount > 0 ? (
                    <Badge label="PR" variant="success" />
                  ) : null}
                </HStack>
              </MetadataListItem>
            </MetadataList>

            <Button label="Done" variant="primary" size="lg" clickAction={dismissSummary} />
          </VStack>
        </Dialog>
      ) : null}

      <DeleteConfirmationDialog
        isOpen={pendingSetIndex != null}
        onOpenChange={(open) => {
          if (!open) setPendingSetIndex(null)
        }}
        title={deleteWorkoutSetTitle()}
        onConfirm={async () => {
          if (pendingSetIndex == null) return
          await confirmDeleteSet(pendingSetIndex)
          setPendingSetIndex(null)
        }}
      />
    </VStack>
  )
}


type SessionHistoryRow = {
  id: number
  exercise_name: string
  set_number: number
  weight_kg: number
  reps: number
  rpe: number
  recordKinds: RecordKind[]
}

function toSetSnapshot(row: ExerciseSetHistoryRow): ExerciseSetSnapshot {
  return {
    id: row.id,
    session_id: row.session_id,
    weight_kg: row.weight_kg,
    reps: row.reps,
  }
}

function detectRecordsForNewSet(
  historyRows: ExerciseSetHistoryRow[],
  sessionId: number,
  set: WorkoutSetRow,
  excludeSetId?: number,
) {
  const priorSets = historyRows
    .filter((row) => row.id !== excludeSetId)
    .map(toSetSnapshot)
  const newSet: ExerciseSetSnapshot = {
    session_id: sessionId,
    weight_kg: set.weight,
    reps: set.reps,
  }
  const currentSessionPrior = priorSets.filter((row) => row.session_id === sessionId)
  return detectPersonalRecords(priorSets, newSet, currentSessionPrior)
}

function buildSessionHistoryRows(
  sets: Array<{
    id: number
    exercise_id: number
    exercise_name: string
    set_number: number
    weight_kg: number | null
    reps: number | null
    rpe: number
  }>,
  historyByExercise: Map<number, ExerciseSetHistoryRow[]>,
): SessionHistoryRow[] {
  return sets
    .filter((set) => set.weight_kg != null && set.reps != null)
    .map((set) => {
      const chronological = (historyByExercise.get(set.exercise_id) ?? []).map(toSetSnapshot)
      const recordKinds = recordKindsBySetId(chronological).get(set.id) ?? []
      return {
        id: set.id,
        exercise_name: set.exercise_name,
        set_number: set.set_number,
        weight_kg: set.weight_kg as number,
        reps: set.reps as number,
        rpe: set.rpe,
        recordKinds,
      }
    })
}

function sessionHistoryColumns(): TableColumn<SessionHistoryRow>[] {
  return [
    {
      key: 'exercise_name',
      header: 'Exercise',
      width: proportional(2),
      renderCell: (row) => <Text>{row.exercise_name}</Text>,
    },
    {
      key: 'set_number',
      header: 'Set',
      width: proportional(1),
      renderCell: (row) => (
        <HStack gap={2} wrap="wrap" vAlign="center">
          <Text hasTabularNumbers>{row.set_number}</Text>
          {row.recordKinds.length > 0 ? <Badge label="PR" variant="success" /> : null}
        </HStack>
      ),
    },
    {
      key: 'weight',
      header: 'Weight (kg)',
      width: proportional(1),
      renderCell: (row) => <Text hasTabularNumbers>{row.weight_kg}</Text>,
    },
    {
      key: 'reps',
      header: 'Reps',
      width: proportional(1),
      renderCell: (row) => <Text hasTabularNumbers>{row.reps}</Text>,
    },
    {
      key: 'rpe',
      header: 'RPE',
      width: proportional(1),
      renderCell: (row) => <Text hasTabularNumbers>{row.rpe}</Text>,
    },
  ]
}

function buildExerciseOptions(exercises: Exercise[], programTargets: ProgramDayTarget[]) {
  const list =
    programTargets.length > 0
      ? exercises.filter((ex) => programTargets.some((target) => target.exercise_id === ex.id))
      : exercises
  return list.map((exercise) => ({
    value: String(exercise.id),
    label: `${exercise.name} (${exercise.muscle_group})`,
  }))
}

function recentSessionColumns(selectedDate: string): TableColumn<WorkoutSession>[] {
  return [
    {
      key: 'date',
      header: 'Date',
      width: proportional(1),
      renderCell: (session) => <Text hasTabularNumbers>{session.date}</Text>,
    },
    {
      key: 'name',
      header: 'Name',
      width: proportional(2),
      renderCell: (session) => <Text>{session.name || 'Workout'}</Text>,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: proportional(2),
      renderCell: (session) => (
        <HStack gap={2} wrap="wrap">
          <Button
            label={`View session ${session.name || session.date}`}
            href={`/workout?session=${session.id}&date=${selectedDate}`}
            variant="secondary"
            size="lg"
          />
          <Button
            label={`View summary ${session.name || session.date}`}
            href={`/workout?session=${session.id}&summary=1&date=${selectedDate}`}
            variant="secondary"
            size="lg"
          />
        </HStack>
      ),
    },
  ]
}

function programTargetColumns(): TableColumn<ProgramDayTarget>[] {
  return [
    {
      key: 'exercise_name',
      header: 'Exercise',
      width: proportional(2),
      renderCell: (target) => <Text weight="bold">{target.exercise_name}</Text>,
    },
    {
      key: 'target',
      header: 'Target',
      width: proportional(2),
      renderCell: (target) => (
        <HStack gap={2} wrap="wrap">
          <Text type="supporting">
            {target.target_sets} x {target.target_reps} @ RPE {target.target_rpe}
          </Text>
          {target.dup_emphasis ? <Badge label={target.dup_emphasis} variant="info" /> : null}
        </HStack>
      ),
    },
    {
      key: 'suggested',
      header: 'Suggested',
      width: proportional(2),
      renderCell: (target) => (
        <Text type="supporting">
          {target.suggested_weight_kg ? `${target.suggested_weight_kg} kg` : target.progression_note}
        </Text>
      ),
    },
  ]
}
