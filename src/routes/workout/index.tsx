import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  HStack,
  Selector,
  Table,
  Text,
  VStack,
  proportional,
  type TableColumn,
} from '@astryxdesign/core'
import { useToast } from '@astryxdesign/core/Toast'
import { DateNavigationBar } from '~/components/DateNavigationBar'
import { ScrollableTable } from '~/components/ScrollableTable'
import { ToastUndoButton } from '~/components/ToastUndoButton'
import { WorkoutSetsTable, type WorkoutSetRow } from '~/components/workout/WorkoutSetsTable'
import {
  getExercises,
  getWorkoutSessions,
  getWorkoutSession,
  createWorkoutSession,
  addWorkoutSet,
  deleteWorkoutSet,
  getLastPerformance,
  getProgramDayTargets,
  type ProgramDayTarget,
} from '~/lib/api'
import { queueMutation, runOrQueue } from '~/lib/offline'
import { makeTempRef } from '~/lib/sync'
import type { Exercise, WorkoutSession } from '~/lib/db'
import { parseSearchDate, resolveSelectedDate } from '~/lib/nutrition'
import {
  mutationFailedBody,
  setDeletedBody,
  setSavedBody,
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

type WorkoutSearch = {
  session?: number
  date?: string
}

export const Route = createFileRoute('/workout/')({
  head: () => ({ meta: [{ title: 'Workout - FitTrack' }] }),
  validateSearch: (search: Record<string, unknown>): WorkoutSearch => ({
    session:
      typeof search.session === 'number'
        ? search.session
        : typeof search.session === 'string' && search.session
          ? parseInt(search.session, 10)
          : undefined,
    date: parseSearchDate(typeof search.date === 'string' ? search.date : undefined),
  }),
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
  const { session: sessionIdFromSearch, date: dateFromSearch } = Route.useSearch()
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
  const toast = useToast()

  const navigate = useNavigate()
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
    })
    setSets([])
  }

  const handleFinish = () => {
    setStartedSession(null)
    setSelectedExercise(null)
    setSets([])
    if (sessionIdFromSearch !== undefined) {
      navigate({ to: '/workout', search: (prev) => ({ date: prev.date }) })
    }
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
      if (sessionId === null) {
        await queueMutation('addWorkoutSet', { ...setFields, session_temp_ref: activeSession.tempRef })
        toast({ body: setSavedBody(), autoHideDuration: TOAST_DURATION_MS.setSaved })
        return
      }

      const outcome = await runOrQueue('addWorkoutSet', { ...setFields, session_id: sessionId }, () =>
        addWorkoutSet({ data: { ...setFields, session_id: sessionId } }),
      )
      if (!outcome.queued) {
        setSets((prev) =>
          prev.map((row, i) => (i === index ? { ...row, id: outcome.result.id } : row)),
        )
      }
      toast({ body: setSavedBody(), autoHideDuration: TOAST_DURATION_MS.setSaved })
    } catch {
      toast({ body: mutationFailedBody('Save set'), type: 'error' })
    }
  }

  const handleDeleteSet = async (index: number) => {
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

  const exerciseOptions = buildExerciseOptions(exercises, programTargets)
  const filteredExercises =
    programTargets.length > 0
      ? exercises.filter((ex) => programTargets.some((target) => target.exercise_id === ex.id))
      : exercises

  return (
    <VStack as="main" gap={4}>
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Heading level={1}>Workout</Heading>
        <Button label="Training Programs" href="/workout/programs" variant="secondary" size="lg" />
      </HStack>

      <DateNavigationBar
        selectedDate={selectedDate}
        onDateChange={(nextDate) => {
          navigate({
            search: (prev) => ({
              ...prev,
              date: nextDate,
            }),
          })
        }}
      />

      {!activeSession ? (
        <VStack gap={4}>
          <Card>
            <EmptyState
              icon={<span aria-hidden>🏋️</span>}
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
                  icon={<span aria-hidden>🏋️</span>}
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
                    columns={recentSessionColumns()}
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
      ) : (
        <VStack gap={4}>
          <Card>
            <VStack gap={3}>
              <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                <Heading level={2}>Active Session</Heading>
                <Button label="Finish workout" variant="secondary" size="lg" clickAction={handleFinish} />
              </HStack>
              {totalVolume > 0 ? (
                <HStack gap={4} wrap="wrap">
                  <VStack gap={1}>
                    <Text type="label">Volume</Text>
                    <Text size="2xl" weight="bold" hasTabularNumbers>
                      {Math.round(totalVolume)} kg
                    </Text>
                  </VStack>
                  {bestSet ? (
                    <VStack gap={1}>
                      <Text type="label">Est. 1RM</Text>
                      <Text size="2xl" weight="bold" hasTabularNumbers>
                        {Math.round(estimate1RM(bestSet.weight, bestSet.reps))} kg
                      </Text>
                    </VStack>
                  ) : null}
                </HStack>
              ) : null}
            </VStack>
          </Card>

          {programTargets.length > 0 ? (
            <Card>
              <VStack gap={3}>
                <Heading level={2}>Program Targets</Heading>
                <ScrollableTable scrollLabel="program-targets">
                  <Table
                    aria-label="Program targets"
                    columns={programTargetColumns()}
                    data={programTargets}
                    idKey="program_exercise_id"
                    density="compact"
                    hasHover
                  />
                </ScrollableTable>
              </VStack>
            </Card>
          ) : null}

          <Card>
            <VStack gap={3}>
              <Heading level={2}>Select Exercise</Heading>
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
            </VStack>
          </Card>

          {selectedExercise ? (
            <Card>
              <VStack gap={3}>
                <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                  <VStack gap={1}>
                    <Heading level={2}>{selectedExercise.name}</Heading>
                    {activeTarget ? (
                      <Text type="supporting">
                        Target: {activeTarget.target_sets} x {activeTarget.target_reps} @ RPE{' '}
                        {activeTarget.target_rpe}
                        {activeTarget.suggested_weight_kg
                          ? ` · Suggested ${activeTarget.suggested_weight_kg} kg`
                          : ''}
                      </Text>
                    ) : null}
                  </VStack>
                  <Button label="Add set" variant="primary" size="lg" clickAction={handleAddSet} />
                </HStack>
                {selectedExercise.instructions ? (
                  <Text type="supporting">{selectedExercise.instructions}</Text>
                ) : null}
                {isFreeFormSession && lastPerformance ? (
                  <Text type="supporting">
                    {formatLastPerformanceLine(lastPerformance, selectedDate)}
                  </Text>
                ) : null}
                {isFreeFormSession && freeFormSuggestion ? (
                  <Text type="supporting">{freeFormSuggestion.note}</Text>
                ) : null}
                {isFreeFormSession && !lastPerformance ? (
                  <Text type="supporting">{NO_HISTORY_GUIDANCE}</Text>
                ) : null}
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
                    onDeleteSet={handleDeleteSet}
                  />
                ) : null}
                <Text type="supporting">
                  RPE 7 = 3 reps in reserve · RPE 8 = 2 RIR · RPE 9 = 1 RIR · RPE 10 = max effort.
                  For hypertrophy, target RPE 7-9.
                </Text>
              </VStack>
            </Card>
          ) : null}
        </VStack>
      )}
    </VStack>
  )
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

function recentSessionColumns(): TableColumn<WorkoutSession>[] {
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
      width: proportional(1),
      renderCell: (session) => (
        <Button
          label={`View session ${session.name || session.date}`}
          href={`/workout?session=${session.id}`}
          variant="secondary"
          size="lg"
        />
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
