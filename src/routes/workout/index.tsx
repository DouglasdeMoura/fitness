import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getExercises, getWorkoutSessions, createWorkoutSession, addWorkoutSet } from '~/lib/api'
import { queueMutation, runOrQueue } from '~/lib/offline'
import { makeTempRef } from '~/lib/sync'
import { estimate1RM, calculateVolume, type Exercise } from '~/lib/workout'

export const Route = createFileRoute('/workout/')({
  head: () => ({ meta: [{ title: 'Workout - FitTrack' }] }),
  component: WorkoutPage,
})

function WorkoutPage() {
  const { data: exercises } = useSuspenseQuery({
    queryKey: ['exercises'],
    queryFn: () => getExercises({ data: {} }),
  })

  const { data: sessions } = useSuspenseQuery({
    queryKey: ['workout-sessions'],
    queryFn: () => getWorkoutSessions({ data: { limit: 10 } }),
  })

  // id is null while the session itself is still sitting in the offline
  // outbox; tempRef is what its sets reference until the server assigns one.
  const [activeSession, setActiveSession] = useState<{ id: number | null; tempRef: string } | null>(null)
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [sets, setSets] = useState<Array<{ reps: number; weight: number; rpe: number }>>([])

  const handleStartWorkout = async () => {
    const tempRef = makeTempRef()
    const outcome = await runOrQueue(
      'createWorkoutSession',
      { name: 'Training Session', temp_ref: tempRef },
      () => createWorkoutSession({ data: { name: 'Training Session' } })
    )
    setActiveSession({ id: outcome.queued ? null : outcome.result.id, tempRef })
    setSets([])
  }

  const handleAddSet = () => {
    if (!selectedExercise) return
    const lastSet = sets[sets.length - 1]
    setSets([...sets, { reps: lastSet?.reps || 8, weight: lastSet?.weight || 20, rpe: 7 }])
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
      // The session has not reached the server yet, so the set has to travel
      // through the outbox behind it to be attached to the right row.
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
      </div>

      {!activeSession ? (
        <>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="empty-state-icon">🏋️</div>
            <h3>Ready to train?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Start a new training session to log your lifts
            </p>
            <button className="btn btn-primary" onClick={handleStartWorkout}>
              Start Workout
            </button>
          </div>

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
                onClick={() => { setActiveSession(null); setSelectedExercise(null); setSets([]) }}
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
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.muscle_group})
                </option>
              ))}
            </select>
          </div>

          {selectedExercise && (
            <div className="card">
              <div className="section-header" style={{ marginBottom: '12px' }}>
                <div className="card-title" style={{ margin: 0 }}>{selectedExercise.name}</div>
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
