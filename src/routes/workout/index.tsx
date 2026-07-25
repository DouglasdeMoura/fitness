import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Badge, Button, Card } from '@astryxdesign/core'
import {
  getExercises,
  getWorkoutSessions,
  getWorkoutSession,
  createWorkoutSession,
  addWorkoutSet,
  getProgramDayTargets,
  type ProgramDayTarget,
} from '~/lib/api'
import { queueMutation, runOrQueue } from '~/lib/offline'
import { makeTempRef } from '~/lib/sync'
import type { Exercise } from '~/lib/db'
import { estimate1RM, calculateVolume } from '~/lib/workout'

type WorkoutSearch = {
  session?: number
}

export const Route = createFileRoute('/workout/')({
  head: () => ({ meta: [{ title: 'Workout - FitTrack' }] }),
  validateSearch: (search: Record<string, unknown>): WorkoutSearch => ({
    session: typeof search.session === 'number'
      ? search.session
      : typeof search.session === 'string' && search.session
        ? parseInt(search.session, 10)
        : undefined,
  }),
  component: WorkoutPage,
})

function WorkoutPage() {
  const { session: sessionIdFromSearch } = Route.useSearch()
  const { data: exercises } = useSuspenseQuery({
    queryKey: ['exercises'],
    queryFn: () => getExercises({ data: {} }),
  })

  const { data: sessions } = useSuspenseQuery({
    queryKey: ['workout-sessions'],
    queryFn: () => getWorkoutSessions({ data: { limit: 10 } }),
  })

  const [activeSession, setActiveSession] = useState<{ id: number | null; tempRef: string; programDayId?: number | null; programId?: number | null } | null>(null)
  const [programTargets, setProgramTargets] = useState<ProgramDayTarget[]>([])
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [sets, setSets] = useState<Array<{ reps: number; weight: number; rpe: number }>>([])

  useEffect(() => {
    if (!sessionIdFromSearch || activeSession?.id === sessionIdFromSearch) return

    let cancelled = false
    ;(async () => {
      const loaded = await getWorkoutSession({ data: { id: sessionIdFromSearch } })
      if (!loaded || cancelled) return

      setActiveSession({ id: loaded.session.id, tempRef: `session-${loaded.session.id}` })

      if (loaded.session.program_id && loaded.session.program_day_id) {
        const dayTargets = await getProgramDayTargets({
          data: {
            programId: loaded.session.program_id,
            programDayId: loaded.session.program_day_id,
          },
        })
        if (!cancelled && dayTargets) {
          setProgramTargets(dayTargets.targets)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sessionIdFromSearch, activeSession?.id])

  const activeTarget = selectedExercise
    ? programTargets.find((target) => target.exercise_id === selectedExercise.id)
    : undefined

  const handleStartWorkout = async () => {
    const tempRef = makeTempRef()
    const outcome = await runOrQueue(
      'createWorkoutSession',
      { name: 'Training Session', temp_ref: tempRef },
      () => createWorkoutSession({ data: { name: 'Training Session' } })
    )
    setActiveSession({ id: outcome.queued ? null : outcome.result.id, tempRef })
    setProgramTargets([])
    setSets([])
  }

  const handleAddSet = () => {
    if (!selectedExercise) return
    const lastSet = sets[sets.length - 1]
    const suggestedWeight = activeTarget?.suggested_weight_kg
    setSets([
      ...sets,
      {
        reps: lastSet?.reps || parseInt(activeTarget?.target_reps.split('-')[0] || '8', 10),
        weight: lastSet?.weight || suggestedWeight || 20,
        rpe: lastSet?.rpe || activeTarget?.target_rpe || 7,
      },
    ])
  }

  const handleSaveSet = async (set: { reps: number; weight: number; rpe: number }, index: number) => {
    if (!activeSession || !selectedExercise) return
    const setFields = {
      exercise_id: selectedExercise.id,
      set_number: index + 1,
      reps: set.reps,
      weight_kg: set.weight,
      rpe: set.rpe,
    }

    const sessionId = activeSession.id
    if (sessionId === null) {
      await queueMutation('addWorkoutSet', { ...setFields, session_temp_ref: activeSession.tempRef })
      return
    }

    await runOrQueue('addWorkoutSet', { ...setFields, session_id: sessionId }, () =>
      addWorkoutSet({ data: { ...setFields, session_id: sessionId } })
    )
  }

  const totalVolume = sets.reduce((sum, s) => sum + calculateVolume(1, s.reps, s.weight), 0)
  const bestSet = sets.length > 0
    ? sets.reduce((best, s) => (estimate1RM(s.weight, s.reps) > estimate1RM(best.weight, best.reps) ? s : best))
    : null

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Workout</h1>
        <Link to="/workout/programs" className="btn btn-secondary btn-sm">Training Programs</Link>
      </div>

      {!activeSession ? (
        <>
          <Card padding={4} style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div className="empty-state-icon">🏋️</div>
            <h3>Ready to train?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Start a free-form session or follow a structured training program
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={handleStartWorkout}>Start Workout</Button>
              <Link to="/workout/programs" className="btn btn-secondary">Browse Programs</Link>
            </div>
          </Card>

          <div className="card">
            <div className="card-title">Recent Sessions</div>
            {sessions.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No workouts logged yet.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Date</th><th>Name</th><th></th></tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.date}</td>
                      <td>{s.name || 'Workout'}</td>
                      <td><a href={`/workout/${s.id}`} className="btn btn-secondary btn-sm">View</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <div className="section-header" style={{ marginBottom: '12px' }}>
              <div className="card-title" style={{ margin: 0 }}>Active Session</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setActiveSession(null); setSelectedExercise(null); setSets([]); setProgramTargets([]) }}
              >
                Finish
              </button>
            </div>
            {totalVolume > 0 && (
              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Volume</span>
                  <div style={{ fontWeight: 700 }}>{Math.round(totalVolume)} kg</div>
                </div>
                {bestSet && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Est. 1RM</span>
                    <div style={{ fontWeight: 700 }}>{Math.round(estimate1RM(bestSet.weight, bestSet.reps))} kg</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {programTargets.length > 0 && (
            <Card padding={4} style={{ marginBottom: '16px' }}>
              <div className="card-title">Program Targets</div>
              <table>
                <thead>
                  <tr>
                    <th>Exercise</th>
                    <th>Target</th>
                    <th>Suggested</th>
                  </tr>
                </thead>
                <tbody>
                  {programTargets.map((target) => (
                    <tr key={target.program_exercise_id}>
                      <td>{target.exercise_name}</td>
                      <td>
                        {target.target_sets} x {target.target_reps} @ RPE {target.target_rpe}
                        {target.dup_emphasis ? <Badge variant="info" style={{ marginLeft: '8px' }}>{target.dup_emphasis}</Badge> : null}
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {target.suggested_weight_kg ? `${target.suggested_weight_kg} kg` : target.progression_note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="card">
            <div className="card-title">Select Exercise</div>
            <select
              className="input"
              value={selectedExercise?.id || ''}
              onChange={(e) => {
                const ex = exercises.find((x) => x.id === parseInt(e.target.value))
                setSelectedExercise(ex || null)
                setSets([])
              }}
            >
              <option value="">Choose an exercise...</option>
              {(programTargets.length > 0
                ? exercises.filter((ex) => programTargets.some((target) => target.exercise_id === ex.id))
                : exercises
              ).map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.muscle_group})
                </option>
              ))}
            </select>
          </div>

          {selectedExercise && (
            <div className="card">
              <div className="section-header" style={{ marginBottom: '12px' }}>
                <div>
                  <div className="card-title" style={{ margin: 0 }}>{selectedExercise.name}</div>
                  {activeTarget ? (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                      Target: {activeTarget.target_sets} x {activeTarget.target_reps} @ RPE {activeTarget.target_rpe}
                      {activeTarget.suggested_weight_kg ? ` · Suggested ${activeTarget.suggested_weight_kg} kg` : ''}
                    </p>
                  ) : null}
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleAddSet}>+ Add Set</button>
              </div>
              {selectedExercise.instructions && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  {selectedExercise.instructions}
                </p>
              )}
              {sets.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Set</th>
                      <th>Weight (kg)</th>
                      <th>Reps</th>
                      <th>RPE</th>
                      <th>Volume</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sets.map((set, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>
                          <input
                            type="number"
                            className="input"
                            style={{ width: '80px' }}
                            value={set.weight}
                            onChange={(e) => {
                              const newSets = [...sets]
                              newSets[i] = { ...set, weight: parseFloat(e.target.value) || 0 }
                              setSets(newSets)
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="input"
                            style={{ width: '60px' }}
                            value={set.reps}
                            onChange={(e) => {
                              const newSets = [...sets]
                              newSets[i] = { ...set, reps: parseInt(e.target.value) || 0 }
                              setSets(newSets)
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="input"
                            style={{ width: '50px' }}
                            value={set.rpe}
                            min="1"
                            max="10"
                            onChange={(e) => {
                              const newSets = [...sets]
                              newSets[i] = { ...set, rpe: parseInt(e.target.value) || 7 }
                              setSets(newSets)
                            }}
                          />
                        </td>
                        <td>{Math.round(set.weight * set.reps)} kg</td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleSaveSet(set, i)}>
                            Save
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                💡 RPE 7 = 3 reps in reserve | RPE 8 = 2 RIR | RPE 9 = 1 RIR | RPE 10 = max effort.
                For hypertrophy, target RPE 7-9.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
