import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge, Button, Card } from '@astryxdesign/core'
import { deleteProgram, getPrograms, saveProgram, setActiveProgram } from '~/lib/api'
import type { PeriodizationType } from '~/lib/db'

export const Route = createFileRoute('/workout/programs/')({
  head: () => ({ meta: [{ title: 'Training Programs - FitTrack' }] }),
  component: ProgramsPage,
})

const PERIODIZATION_LABELS: Record<PeriodizationType, string> = {
  linear: 'Linear progression',
  dup: 'Daily undulating (DUP)',
}

function ProgramsPage() {
  const queryClient = useQueryClient()
  const { data: programs } = useSuspenseQuery({
    queryKey: ['programs'],
    queryFn: () => getPrograms(),
  })

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [frequency, setFrequency] = useState(3)
  const [periodizationType, setPeriodizationType] = useState<PeriodizationType>('linear')

  const handleCreate = async () => {
    if (!name.trim()) return
    const program = await saveProgram({
      data: {
        name: name.trim(),
        description: description.trim() || undefined,
        frequency_per_week: frequency,
        periodization_type: periodizationType,
        is_active: programs.length === 0,
        days: [{ day_name: 'Day A', sort_order: 1, exercises: [] }],
      },
    })
    await queryClient.invalidateQueries({ queryKey: ['programs'] })
    setShowCreate(false)
    setName('')
    setDescription('')
    if (program?.id) window.location.href = `/workout/programs/${program.id}`
  }

  const handleSetActive = async (id: number) => {
    await setActiveProgram({ data: { id } })
    await queryClient.invalidateQueries({ queryKey: ['programs'] })
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this training program?')) return
    await deleteProgram({ data: { id } })
    await queryClient.invalidateQueries({ queryKey: ['programs'] })
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Training Programs</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link to="/workout" className="btn btn-secondary btn-sm">Back to Workout</Link>
          <Button variant="primary" size="sm" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Cancel' : 'New Program'}
          </Button>
        </div>
      </div>

      <Card padding={4} style={{ marginBottom: '16px' }}>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Build reusable multi-day programs with target sets, reps, and RPE. Linear programs progress load
          when autoregulation criteria are met; DUP rotates rep zones across training days within the week
          (Rhea et al. 2002; Prestes et al. 2009).
        </p>
      </Card>

      {showCreate && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-title">Create Program</div>
          <div className="form-grid">
            <label>
              Name
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Upper/Lower Split" />
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
            <label style={{ gridColumn: '1 / -1' }}>
              Description
              <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional program notes" />
            </label>
          </div>
          <div style={{ marginTop: '12px' }}>
            <Button variant="primary" onClick={handleCreate}>Create Program</Button>
          </div>
        </div>
      )}

      {programs.length === 0 ? (
        <Card padding={4}>
          <div className="empty-state-icon">📋</div>
          <h3>No programs yet</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Create your first training program to structure your workouts.</p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {programs.map((program) => (
            <Card key={program.id} padding={4}>
              <div className="section-header" style={{ marginBottom: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0 }}>{program.name}</h3>
                    {program.is_active ? <Badge variant="success">Active</Badge> : null}
                    <Badge variant="info">{PERIODIZATION_LABELS[program.periodization_type]}</Badge>
                  </div>
                  {program.description ? (
                    <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>{program.description}</p>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {!program.is_active ? (
                    <Button variant="secondary" size="sm" onClick={() => handleSetActive(program.id)}>Set Active</Button>
                  ) : null}
                  <Link to="/workout/programs/$programId" params={{ programId: String(program.id) }} className="btn btn-primary btn-sm">Edit</Link>
                  <Button variant="secondary" size="sm" onClick={() => handleDelete(program.id)}>Delete</Button>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {program.day_count} training day{program.day_count === 1 ? '' : 's'} · {program.frequency_per_week}x/week
                {program.periodization_type === 'linear' ? ` · +${program.progression_increment_pct}% load jumps` : ''}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
