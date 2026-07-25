import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge, Button, Card } from '@astryxdesign/core'
import { deleteMealTemplate, getMealTemplates, saveMealTemplate } from '~/lib/api'
import { MEAL_TYPE_LABELS, type MealType } from '~/lib/nutrition'

export const Route = createFileRoute('/nutrition/templates/')({
  head: () => ({ meta: [{ title: 'Meal Templates - FitTrack' }] }),
  component: MealTemplatesPage,
})

function MealTemplatesPage() {
  const queryClient = useQueryClient()
  const { data: templates } = useSuspenseQuery({
    queryKey: ['meal-templates'],
    queryFn: () => getMealTemplates(),
  })

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [defaultMealType, setDefaultMealType] = useState<MealType>('lunch')

  const handleCreate = async () => {
    if (!name.trim()) return
    const template = await saveMealTemplate({
      data: {
        name: name.trim(),
        description: description.trim() || undefined,
        default_meal_type: defaultMealType,
        items: [],
      },
    })
    await queryClient.invalidateQueries({ queryKey: ['meal-templates'] })
    setShowCreate(false)
    setName('')
    setDescription('')
    if (template?.id) window.location.href = `/nutrition/templates/${template.id}`
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this meal template?')) return
    await deleteMealTemplate({ data: { id } })
    await queryClient.invalidateQueries({ queryKey: ['meal-templates'] })
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Meal Templates</h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/nutrition" className="btn btn-secondary btn-sm">Back</Link>
          <Link to="/nutrition/planning" className="btn btn-secondary btn-sm">Weekly Planner</Link>
          <Button variant="primary" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Cancel' : 'New Template'}
          </Button>
        </div>
      </div>

      <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Build reusable meal combos and preview their macros before adding them to your weekly plan.
      </p>

      {showCreate ? (
        <Card padding={4} style={{ marginBottom: '16px' }}>
          <div className="card-title">Create Meal Template</div>
          <div className="form-grid">
            <label>
              Name
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. High-protein breakfast" />
            </label>
            <label>
              Default meal
              <select className="input" value={defaultMealType} onChange={(e) => setDefaultMealType(e.target.value as MealType)}>
                {Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Description
              <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
          <div style={{ marginTop: '12px' }}>
            <Button variant="primary" onClick={handleCreate}>Create &amp; Edit Foods</Button>
          </div>
        </Card>
      ) : null}

      {templates.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🥗</div>
            <p>No meal templates yet. Create one to start building recipes.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {templates.map((template) => (
            <Card key={template.id} padding={4}>
              <div className="section-header" style={{ marginBottom: '8px' }}>
                <div>
                  <Link to="/nutrition/templates/$templateId" params={{ templateId: String(template.id) }} style={{ fontWeight: 700, fontSize: '1.125rem' }}>
                    {template.name}
                  </Link>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <Badge variant="neutral">{MEAL_TYPE_LABELS[template.default_meal_type]}</Badge>
                    <Badge variant="info">{template.item_count} food{template.item_count === 1 ? '' : 's'}</Badge>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Link to="/nutrition/templates/$templateId" params={{ templateId: String(template.id) }} className="btn btn-secondary btn-sm">
                    Edit
                  </Link>
                  <Button variant="secondary" size="sm" onClick={() => handleDelete(template.id)}>Delete</Button>
                </div>
              </div>
              {template.description ? (
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 8px' }}>{template.description}</p>
              ) : null}
              <div className="stat-row">
                <span className="stat-label">Macros per serving</span>
                <span className="stat-value" style={{ fontSize: '0.9375rem' }}>
                  {Math.round(template.totals.calories)} kcal · P {Math.round(template.totals.protein_g)}g · C {Math.round(template.totals.carbs_g)}g · F {Math.round(template.totals.fat_g)}g
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
