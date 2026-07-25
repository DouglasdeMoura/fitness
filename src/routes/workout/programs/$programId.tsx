import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Badge, Button, Card } from '@astryxdesign/core'
import {
  getExercises,
  getProgram,
  saveProgram,
  startWorkoutFromProgram,
  type ProgramDayInput,
  type ProgramExerciseInput,
} from '~/lib/api'
import type { PeriodizationType } from '~/lib/db'
import { getDupDayEmphasis } from '~/lib/workout'

export const Route = createFileRoute('/workout/programs/$programId')({
  head: () => ({ meta: [{ title: 'Edit Program - FitTrack' }] }),
  component: ProgramDetailPage,
})

type EditableDay = ProgramDayInput & { tempId: string }
type EditableExercise = ProgramExerciseInput & { tempId: string }

function makeTempId() {
  return `tmp-${Math.random().toString(36).slice(2, 9)}`
}

function ProgramDetailPage() {
  const { programId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const id = parseInt(programId, 10)

  const { data: program } = useSuspenseQuery({
    queryKey: ['program', id],
    queryFn: () => getProgram({ data: { id } }),
  })

  const { data: exercises } = useSuspenseQuery({
    queryKey: ['exercises'],
    queryFn: () => getExercises({ data: {} }),
  })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [frequency, setFrequency] = useState(3)
  const [periodizationType, setPeriodizationType] = useState<PeriodizationType>('linear')
  const [incrementPct, setIncrementPct] = useState(2.5)
  const [isActive, setIsActive] = useState(false)
  const [days, setDays] = useState<EditableDay[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!program) return
    setName(program.name)
    setDescription(program.description || '')
    setFrequency(program.frequency_per_week)
    setPeriodizationType(program.periodization_type)
    setIncrementPct(program.progression_increment_pct)
    setIsActive(!!program.is_active)
    setDays(
      program.days.map((day) => ({
        tempId: `day-${day.id}`,
        day_name: day.day_name,
        sort_order: day.sort_order,
        exercises: day.exercises.map((exercise) => ({
          tempId: `ex-${exercise.id}`,
          exercise_id: exercise.exercise_id,
          target_sets: exercise.target_sets ?? 3,
          target_reps: exercise.target_reps ?? '8-12',
          target_rpe: exercise.target_rpe ?? 8,
          rest_seconds: exercise.rest_seconds ?? 90,
          sort_order: exercise.sort_order,
        })),
      })),
    )
  }, [program])

  if (!program) {
    return (
      <Card padding={4}>
        <h3>Program not found</h3>
        <Link to="/workout/programs" className="btn btn-secondary btn-sm">Back to Programs</Link>
      </Card>
    )
  }

  const updateDay = (tempId: string, patch: Partial<EditableDay>) => {
    setDays((current) => current.map((day) => (day.tempId === tempId ? { ...day, ...patch } : day)))
  }

  const updateExercise = (dayTempId: string, exerciseTempId: string, patch: Partial<EditableExercise>) => {
    setDays((current) =>
      current.map((day) =>
        day.tempId === dayTempId
          ? {
              ...day,
              exercises: day.exercises.map((exercise) =>
                exercise.tempId === exerciseTempId ? { ...exercise, ...patch } : exercise,
              ),
            }
          : day,
      ),
    )
  }

  const addDay = () => {
    setDays((current) => [
      ...current,
      {
        tempId: makeTempId(),
        day_name: `Day ${String.fromCharCode(65 + current.length)}`,
        sort_order: current.length + 1,
        exercises: [],
      },
    ])
  }

  const addExercise = (dayTempId: string) => {
    const firstExercise = exercises[0]
    if (!firstExercise) return
    setDays((current) =>
      current.map((day) =>
        day.tempId === dayTempId
          ? {
              ...day,
              exercises: [
                ...day.exercises,
                {
                  tempId: makeTempId(),
                  exercise_id: firstExercise.id,
                  target_sets: 3,
                  target_reps: periodizationType === 'dup' ? '5' : '8-12',
                  target_rpe: 8,
                  rest_seconds: 90,
                  sort_order: day.exercises.length + 1,
                },
              ],
            }
          : day,
      ),
    )
  }

  const removeDay = (tempId: string) => {
    setDays((current) =>
      current
        .filter((day) => day.tempId !== tempId)
        .map((day, index) => ({ ...day, sort_order: index + 1 })),
    )
  }

  const removeExercise = (dayTempId: string, exerciseTempId: string) => {
    setDays((current) =>
      current.map((day) =>
        day.tempId === dayTempId
          ? {
              ...day,
              exercises: day.exercises
                .filter((exercise) => exercise.tempId !== exerciseTempId)
                .map((exercise, index) => ({ ...exercise, sort_order: index + 1 })),
            }
          : day,
      ),
    )
  }

  const handleSave = async () => {
    await saveProgram({
      data: {
        id,
        name: name.trim(),
        description: description.trim() || undefined,
        frequency_per_week: frequency,
        periodization_type: periodizationType,
        progression_increment_pct: incrementPct,
        is_active: isActive,
        days: days.map((day, dayIndex) => ({
          day_name: day.day_name,
          sort_order: dayIndex + 1,
          exercises: day.exercises.map((exercise, exerciseIndex) => ({
            exercise_id: exercise.exercise_id,
            target_sets: exercise.target_sets,
            target_reps: exercise.target_reps,
            target_rpe: exercise.target_rpe,
            rest_seconds: exercise.rest_seconds,
            sort_order: exerciseIndex + 1,
          })),
        })),
      },
    })
    await queryClient.invalidateQueries({ queryKey: ['program', id] })
    await queryClient.invalidateQueries({ queryKey: ['programs'] })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleStartDay = async (programDayId: number) => {
    const result = await startWorkoutFromProgram({ data: { programId: id, programDayId } })
    navigate({ to: '/workout', search: { session: result.sessionId } })
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">{name || 'Edit Program'}</h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/workout/programs" className="btn btn-secondary btn-sm">Back</Link>
          <Button variant="primary" onClick={handleSave}>{saved ? 'Saved!' : 'Save Program'}</Button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-title">Program Settings</div>
        <div className="form-grid">
          <label>
            Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Frequency (days/week)
            <input className="input" type="number" min={1} max={7} value={frequency} onChange={(e) => setFrequency(parseInt(e.target.value) || 3)} />
          </label>
          <label>
            Periodization
            <select className="input" value={periodizationType} onChange={(e) => setPeriodizationType(e.target.value as PeriodizationType)}>
              <option value="linear">Linear progression</option>
              <option value="dup">Daily undulating (DUP)</option>
            </select>
          </label>
          {periodizationType === 'linear' ? (
            <label>
              Load increment (%)
              <input className="input" type="number" step="0.5" min={1} max={10} value={incrementPct} onChange={(e) => setIncrementPct(parseFloat(e.target.value) || 2.5)} />
            </label>
          ) : null}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Set as active program
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Description
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        {days.map((day, dayIndex) => {
          const savedDay = program.days[dayIndex]
          return (
            <Card key={day.tempId} padding={4}>
              <div className="section-header" style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    style={{ maxWidth: '220px' }}
                    value={day.day_name}
                    onChange={(e) => updateDay(day.tempId, { day_name: e.target.value })}
                  />
                  {periodizationType === 'dup' && day.exercises[0]?.target_reps ? (
                    <Badge variant="info">{getDupDayEmphasis(day.exercises[0].target_reps)}</Badge>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {savedDay ? (
                    <Button variant="primary" size="sm" onClick={() => handleStartDay(savedDay.id)}>Start Day</Button>
                  ) : null}
                  <Button variant="secondary" size="sm" onClick={() => removeDay(day.tempId)}>Remove Day</Button>
                </div>
              </div>

              {day.exercises.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No exercises assigned yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Sets</th>
                      <th>Reps</th>
                      <th>RPE</th>
                      <th>Rest (s)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.exercises.map((exercise) => (
                      <tr key={exercise.tempId}>
                        <td>
                          <select
                            className="input"
                            value={exercise.exercise_id}
                            onChange={(e) => updateExercise(day.tempId, exercise.tempId, { exercise_id: parseInt(e.target.value, 10) })}
                          >
                            {exercises.map((item) => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input className="input" style={{ width: '60px' }} type="number" min={1} value={exercise.target_sets} onChange={(e) => updateExercise(day.tempId, exercise.tempId, { target_sets: parseInt(e.target.value, 10) || 1 })} />
                        </td>
                        <td>
                          <input className="input" style={{ width: '80px' }} value={exercise.target_reps} onChange={(e) => updateExercise(day.tempId, exercise.tempId, { target_reps: e.target.value })} />
                        </td>
                        <td>
                          <input className="input" style={{ width: '60px' }} type="number" min={6} max={10} value={exercise.target_rpe} onChange={(e) => updateExercise(day.tempId, exercise.tempId, { target_rpe: parseInt(e.target.value, 10) || 8 })} />
                        </td>
                        <td>
                          <input className="input" style={{ width: '70px' }} type="number" min={30} value={exercise.rest_seconds ?? 90} onChange={(e) => updateExercise(day.tempId, exercise.tempId, { rest_seconds: parseInt(e.target.value, 10) || 90 })} />
                        </td>
                        <td>
                          <Button variant="secondary" size="sm" onClick={() => removeExercise(day.tempId, exercise.tempId)}>Remove</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{ marginTop: '12px' }}>
                <Button variant="secondary" size="sm" onClick={() => addExercise(day.tempId)}>+ Add Exercise</Button>
              </div>
            </Card>
          )
        })}
      </div>

      <div style={{ marginTop: '16px' }}>
        <Button variant="secondary" onClick={addDay}>+ Add Training Day</Button>
      </div>
    </div>
  )
}
